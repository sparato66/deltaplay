import { writeFile } from 'node:fs/promises';

const searchUrl = 'https://store.steampowered.com/search/results/?filter=comingsoon&count=100&infinite=1&json=1&cc=ua&l=ukrainian';
const headers = { 'User-Agent': 'DeltaGameFeed/1.0 (+https://github.com/sparato66/deltaplay)' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Steam returned ${response.status} for ${url}`);
  return response;
}

function appIds(markup) {
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
  try {
    const json = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=ua&l=ukrainian`).then(r => r.json());
    const app = json[id]?.data;
    if (!json[id]?.success || !app || app.type !== 'game' || !app.release_date?.coming_soon) return null;
    const release = releaseDate(app.release_date);
    const description = cleanText(app.short_description || app.about_the_game || '').slice(0, 420);
    return {
      id: String(id), appid: Number(id), title: app.name || 'Без назви',
      description, releaseDate: release.label, sortDate: release.sort,
      comingSoon: true, addedAt: new Date().toISOString(),
      developers: app.developers || [], publishers: app.publishers || [],
      platforms: app.platforms || {}, genres: (app.genres || []).map(x => x.description),
      header: app.header_image || '', poster: app.library_capsule || app.header_image || '',
      hero: app.background_raw || app.background || '', screenshots: app.screenshots || [],
      trailers: (app.movies || []).map(m => ({ name: m.name, mp4: m.mp4?.max || m.mp4?.[480] || '', webm: m.webm?.max || m.webm?.[480] || '' })).filter(m => m.mp4 || m.webm),
      website: app.website || '', storeUrl: `https://store.steampowered.com/app/${id}/`, sourceUrl: `https://store.steampowered.com/app/${id}/`
    };
  } catch (error) {
    console.warn(`Skipping Steam app ${id}: ${error.message}`);
    return null;
  }
}

const search = await get(searchUrl).then(r => r.json());
const html = search.results_html || '';
const ids = appIds(html).slice(0, 72);
if (!ids.length) throw new Error('Steam search returned no upcoming game ids; keeping the last published feed is safer than replacing it with an empty list.');
const games = [];
for (const id of ids) {
  const game = await details(id);
  if (game) games.push(game);
  await sleep(180);
}
if (!games.length) throw new Error('Steam app details did not return any upcoming games; not publishing an empty feed.');
games.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
await writeFile('games.json', `${JSON.stringify({ updatedAt: new Date().toISOString(), source: 'Steam Store', games }, null, 2)}\n`);
console.log(`Prepared ${games.length} upcoming games from ${ids.length} Steam search results.`);
