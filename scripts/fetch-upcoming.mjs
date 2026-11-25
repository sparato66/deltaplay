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
let total = Infinity;
for (let start = 0; candidates.size < 1000 && start < 5000; start += PAGE_SIZE) {
  const query = new URLSearchParams({ filter: 'popularcomingsoon', count: PAGE_SIZE, start, infinite: 1, json: 1, cc: 'ua', l: 'ukrainian' });
  const page = await getJSON(`${BASE}?${query}`);
  for (const id of appIds(page.results_html)) candidates.add(id);
  total = Number(page.total_count) || total;
  console.log(`Steam upcoming search: ${candidates.size}/${Math.min(total, 1000)} candidates scanned.`);
  if (!page.results_html || !appIds(page.results_html).length || start + PAGE_SIZE >= total) break;
  await sleep(300);
}
if (!candidates.size) throw new Error('Steam returned no upcoming game candidates; preserving the previous published catalogue.');

const all = [...candidates];
const found = new Map();
for (let offset = 0; offset < all.length && found.size < REQUIRED; offset += 5) {
  const batch = all.slice(offset, offset + 5);
  const results = await Promise.all(batch.map(async (id) => {
    try { return await details(id); }
    catch (error) { console.warn(`Skipping Steam app ${id}: ${error.message}`); return null; }
  }));
  for (const game of results) {
    if (game && !found.has(game.id)) found.set(game.id, game);
    if (found.size === REQUIRED) break;
  }
  if (offset + 5 < all.length && found.size < REQUIRED) await sleep(300);
}

const games = [...found.values()].sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
if (games.length !== REQUIRED) throw new Error(`Expected exactly ${REQUIRED} verified upcoming games, received ${games.length}. Preserving the last published catalogue.`);
const data = { updatedAt: new Date().toISOString(), source: 'Steam Store · popular upcoming', count: games.length, games };
await writeFile('games.json', `${JSON.stringify(data, null, 2)}\n`);
console.log(`Prepared exactly ${games.length} verified upcoming games from ${candidates.size} Steam search candidates.`);
console.log(`Media coverage: ${games.filter((game) => game.trailers.length).length} trailers, ${games.filter((game) => game.screenshots.length).length} screenshot galleries.`);
