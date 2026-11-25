import { readFile, writeFile } from 'node:fs/promises';

const editorial = JSON.parse(await readFile(new URL('../editorial-games.json', import.meta.url), 'utf8'));
if (editorial.resources?.length !== 20) throw new Error('Редакційний каталог має містити рівно 20 джерел.');
for (const source of editorial.resources) new URL(source.url);
const ids = new Set();
for (const game of editorial.games) {
  if (!game.id || ids.has(game.id)) throw new Error(`Missing or duplicate game id: ${game.id}`);
  ids.add(game.id);
  if (!game.title || !game.description || !game.developers?.length || !game.sources?.length) throw new Error(`Incomplete editorial entry: ${game.id}`);
  if (!['2026', '2027', '2028', '2029', '2030', 'TBA'].includes(String(game.releaseYear))) throw new Error(`Unexpected release year for ${game.id}`);
  for (const source of game.sources) new URL(source.url);
}
const output = { updatedAt: new Date().toISOString(), source: 'Редакційна перевірка: офіційні видавці, студії, платформи та ігрові медіа', sources: editorial.resources, games: editorial.games };
await writeFile(new URL('../games.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Зібрано ${output.games.length} перевірених проєктів без агрегатора магазинів.`);
