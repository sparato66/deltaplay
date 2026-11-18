import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile('games.js', 'utf8');
const games = [...source.matchAll(/\{id:'([^']+)'[^{}]*?\bappid:(\d+)/g)]
  .map(([, id, appid]) => ({ id, appid }));
const manifest = { generatedAt: new Date().toISOString(), games: {} };

for (let offset = 0; offset < games.length; offset += 4) {
  const batch = games.slice(offset, offset + 4);
  await Promise.all(batch.map(async ({ id, appid }) => {
    const url = new URL('https://store.steampowered.com/api/appdetails');
    url.searchParams.set('appids', appid);
    url.searchParams.set('l', 'english');
    url.searchParams.set('cc', 'us');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const game = payload[appid]?.data;
      manifest.games[id] = {
        screenshots: (game?.screenshots || []).slice(0, 4).map(item => item.path_full).filter(Boolean),
        storeUrl: `https://store.steampowered.com/app/${appid}/`
      };
      if (!manifest.games[id].screenshots.length) console.warn(`No screenshots returned for ${id}`);
    } catch (error) {
      console.warn(`Steam media lookup failed for ${id}: ${error.message}`);
      manifest.games[id] = { screenshots: [], storeUrl: `https://store.steampowered.com/app/${appid}/` };
    }
  }));
}

await writeFile('steam-media.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote Steam screenshot manifest for ${games.length} catalogue entries.`);
