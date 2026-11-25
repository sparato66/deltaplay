import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://store.steampowered.com/search/results/';
const YEARS = ['2026', '2027', '2028', '2029', '2030'];
const PER_YEAR = 50;
const PAGE_SIZE = 100;
const headers = { 'User-Agent': 'DeltaGameFeed/3.0 (+https://github.com/sparato66/deltaplay)' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJSON(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      const error = new Error(`Steam returned ${response.status} for ${url}`);
      error.rateLimited = response.status === 429;
      throw error;
    }
    const wait = Number(response.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1);
    console.warn(`Steam requested slower traffic (${response.status}); retrying in ${wait}ms.`);
    await sleep(wait);
  }
}

function cleanText(html = '') {
  return html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&quot;/g, "'").replace(/\s+/g, ' ').trim();
}

function releaseDate(raw) {
  const value = raw?.trim() || '';
  if (!value || /coming soon|to be announced|tba|не визначено/i.test(value)) return { label: 'Дату уточнюють', sort: '9999-12-31' };
  const ukrainian = value.match(/(\d{1,2})\s+([А-Яа-яІіЇїЄєҐґ]+)\.?\s+(20\d{2})/u);
  if (ukrainian) {
    const monthKey = ukrainian[2].toLocaleLowerCase('uk').replace(/\.$/, '');
    const months = [['січ', '01'], ['лют', '02'], ['бер', '03'], ['квіт', '04'], ['трав', '05'], ['черв', '06'], ['лип', '07'], ['серп', '08'], ['вер', '09'], ['жовт', '10'], ['листоп', '11'], ['груд', '12']];
    const month = months.find(([prefix]) => monthKey.startsWith(prefix))?.[1];
    if (month) return { label: value, sort: `${ukrainian[3]}-${month}-${ukrainian[1].padStart(2, '0')}` };
  }
  const quarter = value.match(/Q([1-4])\s*(20\d{2})/i);
  if (quarter) return { label: value, sort: `${quarter[2]}-${String(Number(quarter[1]) * 3).padStart(2, '0')}-31` };
  const yearOnly = value.match(/^20\d{2}$/);
  if (yearOnly) return { label: value, sort: `${value}-12-31` };
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return { label: new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed), sort: new Date(parsed).toISOString().slice(0, 10) };
  const year = value.match(/20\d{2}/)?.[0];
  return { label: year ? value : 'Дату уточнюють', sort: year ? `${year}-12-31` : '9999-12-31' };
}

function resultRows(markup = '') {
  const rows = [];
  const pattern = /<a\b(?=[^>]*\bclass=["'][^"']*\bsearch_result_row\b)([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of markup.matchAll(pattern)) {
    const attributes = match[1];
    const id = attributes.match(/\bdata-ds-appid=["'](\d+)["']/i)?.[1] || attributes.match(/\bdata-ds-itemkey=["']App_(\d+)["']/i)?.[1];
    if (!id) continue;
    const html = match[2];
    const title = cleanText(html.match(/<span\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const rawDate = cleanText(html.match(/<div\b[^>]*class=["'][^"']*\bsearch_released\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const image = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || '';
    rows.push({ id, title, rawDate, image, ...releaseDate(rawDate) });
  }
  return rows;
}

async function steamMovies(id) {
  const response = await fetch(`https://store.steampowered.com/video/${id}/?l=english&cc=us`, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Steam video page returned ${response.status} for ${id}`);
  const markup = await response.text();
  const tags = [...markup.matchAll(/<div\b(?=[^>]*\bclass=["'][^"']*\bhighlight_movie\b)([^>]*)>/gi)].map((match) => match[1]);
  const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)`, 'i'))?.[1]?.replace(/&amp;/g, '&').replace(/&#39;/g, "'") || '';
  return tags.map((tag) => ({
    name: attribute(tag, 'data-title') || attribute(tag, 'data-name') || 'Офіційний трейлер Steam',
    mp4: attribute(tag, 'data-mp4-source'), webm: attribute(tag, 'data-webm-source')
  })).filter((movie) => movie.mp4 || movie.webm);
}

const candidates = new Map();
async function collectSearch(parameters, label, maxItems, scoreBase, stopCounts, dateSorted = false) {
  const yearIds = Object.fromEntries(YEARS.map((year) => [year, new Set()]));
  let total = Infinity;
  for (let start = 0; start < maxItems && start < 15000; start += PAGE_SIZE) {
    const query = new URLSearchParams({ ...parameters, count: PAGE_SIZE, start, infinite: 1, json: 1, cc: 'ua', l: 'ukrainian' });
    let page;
    try {
      page = await getJSON(`${BASE}?${query}`);
    } catch (error) {
      if (error.rateLimited) {
        console.warn(`Steam paused the ${label} search at page ${start / PAGE_SIZE + 1}; keeping collected projects and continuing with another source.`);
        break;
      }
      throw error;
    }
    const rows = resultRows(page.results_html);
    if (!rows.length) throw new Error(`Steam ${label} search returned no parseable game rows.`);
    rows.forEach((row, index) => {
      if (!YEARS.includes(row.sort.slice(0, 4))) return;
      const year = row.sort.slice(0, 4);
      yearIds[year].add(row.id);
      const priority = scoreBase - start - index;
      const previous = candidates.get(row.id);
      const isSteamGameSearch = parameters.category1 === 998;
      if (!previous || priority > previous.priority) candidates.set(row.id, { ...row, year, priority, officialGameList: isSteamGameSearch || previous?.officialGameList });
    });
    total = Number(page.total_count) || total;
    const counts = Object.fromEntries(YEARS.map((year) => [year, yearIds[year].size]));
    console.log(`Steam ${label}: ${JSON.stringify(counts)} date-listed projects, page ${start / PAGE_SIZE + 1}.`);
    const enough = YEARS.every((year) => counts[year] >= 140);
    const pageYears = rows.map((row) => Number(row.sort.slice(0, 4))).filter(Number.isFinite);
    const passedWindow = dateSorted && pageYears.length && Math.max(...pageYears) < Number(YEARS[0]);
    const reachedSourcesTarget = Object.entries(stopCounts).every(([year, count]) => counts[year] >= count);
    if (enough || reachedSourcesTarget || passedWindow || !page.results_html || start + PAGE_SIZE >= total) break;
    await sleep(1800);
  }
}

// Start with higher-priced scheduled releases (which surface pre-orders and
// large named series), then fill from Steam's date-sorted upcoming calendar.
await collectSearch({ filter: 'comingsoon', category1: 998, sort_by: 'Price_DESC' }, 'pre-orders and releases', 1000, 100000, { 2026: 70, 2027: 70, 2028: 70, 2029: 70, 2030: 70 });
await collectSearch({ filter: 'popularcomingsoon' }, 'popular upcoming', 500, 50000, { 2026: 180, 2027: 30 });
await collectSearch({ filter: 'comingsoon', category1: 998, sort_by: 'Released_DESC' }, 'year calendar', 8000, 10000, { 2026: 90, 2027: 90, 2028: 90, 2029: 90, 2030: 90 }, true);
await collectSearch({ filter: 'comingsoon', sort_by: 'Released_DESC' }, 'all Steam categories', 5000, 5000, { 2026: 90, 2027: 90, 2028: 90, 2029: 90, 2030: 90 }, true);

const candidatesByYear = Object.fromEntries(YEARS.map((year) => [year, [...candidates.values()].filter((game) => game.year === year).sort((a, b) => b.priority - a.priority)]));
console.log(`Candidate pool by year: ${JSON.stringify(Object.fromEntries(YEARS.map((year) => [year, candidatesByYear[year].length])))}.`);
const verifiedByYear = Object.fromEntries(YEARS.map((year) => [year, new Map()]));
const queue = YEARS.flatMap((year) => candidatesByYear[year].map((candidate) => ({ ...candidate, targetYear: year })));
const releaseDay = new Date().toISOString().slice(0, 10);

async function details(candidate) {
  const id = candidate.id;
  const payload = await getJSON(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=ua&l=ukrainian`);
  const app = payload[id]?.data;
  if (!payload[id]?.success || !app || app.type !== 'game' || !app.release_date?.coming_soon) return null;
  let release = releaseDate(app.release_date.date);
  if (release.sort < releaseDay) return null;
  if (release.sort === '9999-12-31' && YEARS.includes(candidate.year)) release = { label: candidate.rawDate || `${candidate.year} · орієнтовний рік Steam`, sort: candidate.sort };
  const explicitYear = release.sort.slice(0, 4);
  if (!YEARS.includes(explicitYear) && release.sort !== '9999-12-31') return null;
  if (release.sort === '9999-12-31') release = { label: `${candidate.targetYear} · рік у каталозі Steam`, sort: `${candidate.targetYear}-12-31` };
  const year = release.sort.slice(0, 4);
  if (!YEARS.includes(year)) return null;
  const shortDescription = cleanText(app.short_description || '');
  const fullDescription = cleanText(app.about_the_game || '');
  const description = (shortDescription.length >= 120 ? shortDescription : fullDescription || shortDescription).slice(0, 520);
  let trailers = (app.movies || []).map((movie) => ({ name: movie.name, mp4: movie.mp4?.max || movie.mp4?.['480'] || '', webm: movie.webm?.max || movie.webm?.['480'] || '' })).filter((movie) => movie.mp4 || movie.webm);
  if (!trailers.length) {
    try { trailers = await steamMovies(id); }
    catch (error) { console.warn(`Steam video metadata unavailable for ${id}: ${error.message}`); }
  }
  return {
    id: String(id), appid: Number(id), title: app.name || candidate.title || 'Без назви', description,
    releaseYear: year, releaseDate: release.label, sortDate: release.sort, comingSoon: true,
    priority: candidate.priority, priorityLabel: candidate.priority >= 50000 ? 'ВИСОКИЙ ПРОФІЛЬ' : 'МАЙБУТНІЙ РЕЛІЗ', addedAt: new Date().toISOString(), developers: app.developers || [], publishers: app.publishers || [],
    platforms: app.platforms || {}, genres: (app.genres || []).map((item) => item.description),
    header: app.header_image || '', poster: app.library_capsule || app.header_image || '',
    hero: app.background_raw || app.background || '', screenshots: app.screenshots || [],
    trailers,
    website: app.website || '', storeUrl: `https://store.steampowered.com/app/${id}/`, sourceUrl: `https://store.steampowered.com/app/${id}/`
  };
}

function minimalFromSteamSearch(candidate) {
  if (!candidate.officialGameList || !YEARS.includes(candidate.year) || candidate.sort < releaseDay) return null;
  return {
    id: String(candidate.id), appid: Number(candidate.id), title: candidate.title || `Майбутня гра Steam ${candidate.id}`,
    description: `Сторінка гри в Steam позначає реліз на ${candidate.rawDate || candidate.year}. Студія ще не опублікувала більше подробиць.`,
    releaseYear: candidate.year, releaseDate: candidate.rawDate || `${candidate.year} · рік у Steam`, sortDate: candidate.sort,
    comingSoon: true, priority: candidate.priority, priorityLabel: candidate.priority >= 50000 ? 'ВИСОКИЙ ПРОФІЛЬ' : 'МАЙБУТНІЙ РЕЛІЗ',
    addedAt: new Date().toISOString(), developers: [], publishers: [], platforms: { windows: true }, genres: [],
    header: candidate.image || '', poster: candidate.image || '', hero: '', screenshots: [], trailers: [], website: '',
    storeUrl: `https://store.steampowered.com/app/${candidate.id}/`, sourceUrl: `https://store.steampowered.com/app/${candidate.id}/`,
    limitedInfo: true
  };
}

for (let offset = 0; offset < queue.length; offset += 4) {
  const batch = queue.slice(offset, offset + 4).filter((candidate) => verifiedByYear[candidate.targetYear].size < PER_YEAR);
  if (!batch.length) continue;
  const results = await Promise.all(batch.map(async (candidate) => {
    try { return await details(candidate); }
    catch (error) {
      console.warn(`Using Steam search listing for ${candidate.id}: ${error.message}`);
      return minimalFromSteamSearch(candidate);
    }
  }));
  for (const game of results) {
    if (game && verifiedByYear[game.releaseYear].size < PER_YEAR) verifiedByYear[game.releaseYear].set(game.id, game);
  }
  console.log(`Verified per year: ${JSON.stringify(Object.fromEntries(YEARS.map((year) => [year, verifiedByYear[year].size])))}.`);
  if (YEARS.every((year) => verifiedByYear[year].size >= PER_YEAR)) break;
  await sleep(1100);
}

const missing = YEARS.filter((year) => verifiedByYear[year].size < PER_YEAR).map((year) => `${year}: ${verifiedByYear[year].size}/50`);
if (missing.length) console.warn(`Steam has fewer verified listings for distant years (${missing.join(', ')}). Publishing the listings it could verify; no projects were assigned invented release years.`);
const editorial = JSON.parse(await readFile('editorial-games.json', 'utf8')).games || [];
const datedEditorial = editorial.filter((game) => YEARS.includes(String(game.releaseYear)));
const undatedEditorial = editorial.filter((game) => !YEARS.includes(String(game.releaseYear)) && game.status === 'announced');
for (const game of datedEditorial) {
  const year = String(game.releaseYear);
  const entries = [...verifiedByYear[year].values()].filter((entry) => entry.id !== game.id && entry.title.toLocaleLowerCase('uk') !== game.title.toLocaleLowerCase('uk'));
  entries.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title, 'uk'));
  if (entries.length >= PER_YEAR) entries.length = PER_YEAR - 1;
  entries.unshift(game);
  verifiedByYear[year] = new Map(entries.map((entry) => [entry.id, entry]));
}
const games = [...YEARS.flatMap((year) => [...verifiedByYear[year].values()].sort((a, b) => (b.editorialRank || 0) - (a.editorialRank || 0) || b.priority - a.priority || a.title.localeCompare(b.title, 'uk'))), ...undatedEditorial];
const yearCounts = Object.fromEntries(YEARS.map((year) => [year, verifiedByYear[year].size]));
const data = { updatedAt: new Date().toISOString(), source: 'Steam Store · annual upcoming releases', count: games.length, yearCounts, games };
await writeFile('games.json', `${JSON.stringify(data, null, 2)}\n`);
console.log(`Prepared ${games.length} upcoming games: ${JSON.stringify(yearCounts)}.`);
console.log(`Media coverage: ${games.filter((game) => game.trailers.length).length} trailers, ${games.filter((game) => game.screenshots.length).length} screenshot galleries.`);
