import { writeFile } from 'node:fs/promises';

const BASE = 'https://store.steampowered.com/search/results/';
const REQUIRED = 100;
const PAGE_SIZE = 100;
const headers = { 'User-Agent': 'DeltaGameFeed/2.0 (+https://github.com/sparato66/deltaplay)' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJSON(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Steam returned ${response.status} for ${url}`);
  return response.json();
}

function appIds(markup = '') {
  const ids = new Set();
  for (const match of markup.matchAll(/data-ds-appid=["'](\d+)["']/g)) ids.add(match[1]);
  for (const match of markup.matchAll(/data-ds-itemkey=["']App_(\d+)["']/g)) ids.add(match[1]);
  return [...ids];
}

function cleanText(html = '') {
  return html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&quot;/g, "'").replace(/\s+/g, ' ').trim();
}

function releaseDate(raw) {
  const value = raw?.date?.trim() || '';
  const ukrainian = value.match(/(\d{1,2})\s+([А-Яа-яІіЇїЄєҐґ]+)\.?\s+(20\d{2})/u);
  if (ukrainian) {
    const monthKey = ukrainian[2].toLocaleLowerCase('uk').replace(/\.$/, '');
    const months = [['січ', '01'], ['лют', '02'], ['бер', '03'], ['квіт', '04'], ['трав', '05'], ['черв', '06'], ['лип', '07'], ['серп', '08'], ['вер', '09'], ['жовт', '10'], ['листоп', '11'], ['груд', '12']];
    const month = months.find(([prefix]) => monthKey.startsWith(prefix))?.[1];
    if (month) return { label: value, sort: `${ukrainian[3]}-${month}-${ukrainian[1].padStart(2, '0')}` };
  }
  const parsed = Date.parse(value);
  if (!value || /coming soon|to be announced|tba|не визначено/i.test(value)) return { label: 'Дата виходу уточнюється', sort: '9999-12-31' };
  if (!Number.isNaN(parsed)) return { label: new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed), sort: new Date(parsed).toISOString().slice(0, 10) };
  const year = value.match(/20\d{2}/)?.[0];
  return { label: value, sort: year ? `${year}-12-31` : '9999-12-31' };
}

async function details(id) {
  const payload = await getJSON(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=ua&l=ukrainian`);
  const app = payload[id]?.data;
  if (!payload[id]?.success || !app || app.type !== 'game' || !app.release_date?.coming_soon) return null;
  const release = releaseDate(app.release_date);
  const shortDescription = cleanText(app.short_description || '');
  const fullDescription = cleanText(app.about_the_game || '');
  const description = (shortDescription.length >= 120 ? shortDescription : fullDescription || shortDescription).slice(0, 520);
  const releaseDay = new Date().toISOString().slice(0, 10);
  if (release.sort < releaseDay) return null;
  return {
    id: String(id), appid: Number(id), title: app.name || 'Без назви', description,
    releaseDate: release.label, sortDate: release.sort, comingSoon: true,
    addedAt: new Date().toISOString(), developers: app.developers || [], publishers: app.publishers || [],
    platforms: app.platforms || {}, genres: (app.genres || []).map((item) => item.description),
    header: app.header_image || '', poster: app.library_capsule || app.header_image || '',
    hero: app.background_raw || app.background || '', screenshots: app.screenshots || [],
    trailers: (app.movies || []).map((movie) => ({ name: movie.name, mp4: movie.mp4?.max || movie.mp4?.['480'] || '', webm: movie.webm?.max || movie.webm?.['480'] || '' })).filter((movie) => movie.mp4 || movie.webm),
    website: app.website || '', storeUrl: `https://store.steampowered.com/app/${id}/`, sourceUrl: `https://store.steampowered.com/app/${id}/`
  };
}

const candidates = new Set();
async function collectSearch(parameters, label, limit = 1000) {
  let total = Infinity;
  const initial = candidates.size;
  for (let start = 0; start < limit && start < 5000; start += PAGE_SIZE) {
    const query = new URLSearchParams({ ...parameters, count: PAGE_SIZE, start, infinite: 1, json: 1, cc: 'ua', l: 'ukrainian' });
    const page = await getJSON(`${BASE}?${query}`);
    const ids = appIds(page.results_html);
    ids.forEach((id) => candidates.add(id));
    total = Number(page.total_count) || total;
    console.log(`Steam ${label}: ${candidates.size - initial}/${Math.min(total, limit)} candidates scanned.`);
    if (!page.results_html || !ids.length || start + PAGE_SIZE >= total) break;
    await sleep(300);
  }
}

// Steam's high price sort surfaces scheduled pre-orders and named projects
// beyond the next few weeks. Popular Upcoming supplies additional near-term titles.
await collectSearch({ filter: 'comingsoon', category1: 998, os: 'win', sort_by: 'Price_DESC' }, 'announced future releases', 1500);
await collectSearch({ filter: 'popularcomingsoon' }, 'Popular Upcoming', 1000);
if (!candidates.size) throw new Error('Steam returned no upcoming game candidates; preserving the previous published catalogue.');

const all = [...candidates];
const verified = new Map();
const currentYear = new Date().getUTCFullYear();
for (let offset = 0; offset < all.length; offset += 5) {
  const batch = all.slice(offset, offset + 5);
  const results = await Promise.all(batch.map(async (id) => {
    try { return await details(id); }
    catch (error) { console.warn(`Skipping Steam app ${id}: ${error.message}`); return null; }
  }));
  for (const game of results) {
    if (game && !verified.has(game.id)) verified.set(game.id, game);
  }
  const yearCounts = [...verified.values()].reduce((summary, game) => {
    const year = Number(game.sortDate.slice(0, 4));
    if (year > currentYear && year <= currentYear + 4) summary.later++;
    else if (year === currentYear) summary.current++;
    return summary;
  }, { later: 0, current: 0 });
  if (yearCounts.later >= 55 && yearCounts.current >= 45) {
    console.log(`Release window target reached: ${yearCounts.later} later-year and ${yearCounts.current} current-year projects verified.`);
    break;
  }
  if (offset + 5 < all.length) await sleep(300);
}

const verifiedGames = [...verified.values()];
const byDate = (a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title);
const laterYears = verifiedGames.filter((game) => {
  const year = Number(game.sortDate.slice(0, 4));
  return year > currentYear && year <= currentYear + 4;
}).sort(byDate);
const currentYearGames = verifiedGames.filter((game) => game.sortDate.startsWith(String(currentYear))).sort(byDate);
const undated = verifiedGames.filter((game) => game.sortDate === '9999-12-31').sort((a, b) => a.title.localeCompare(b.title, 'uk'));
const games = [...laterYears.slice(0, Math.min(55, laterYears.length)), ...currentYearGames, ...undated, ...verifiedGames.filter((game) => !laterYears.includes(game) && !currentYearGames.includes(game) && !undated.includes(game))]
  .slice(0, REQUIRED)
  .sort(byDate);
if (games.length !== REQUIRED) throw new Error(`Expected exactly ${REQUIRED} verified upcoming games, received ${games.length}. Preserving the last published catalogue.`);
const data = { updatedAt: new Date().toISOString(), source: 'Steam Store · announced upcoming games', count: games.length, games };
await writeFile('games.json', `${JSON.stringify(data, null, 2)}\n`);
const yearSummary = games.reduce((summary, game) => { const year = game.sortDate.slice(0, 4); summary[year] = (summary[year] || 0) + 1; return summary; }, {});
console.log(`Prepared exactly ${games.length} verified upcoming games from ${candidates.size} Steam search candidates.`);
console.log(`Release years: ${JSON.stringify(yearSummary)}.`);
console.log(`Media coverage: ${games.filter((game) => game.trailers.length).length} trailers, ${games.filter((game) => game.screenshots.length).length} screenshot galleries.`);
