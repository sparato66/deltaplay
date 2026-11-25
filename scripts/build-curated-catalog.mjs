import { readFile, writeFile } from 'node:fs/promises';

const editorial = JSON.parse(await readFile(new URL('../editorial-games.json', import.meta.url), 'utf8'));
const ids = new Set();
for (const game of editorial.games) {
  if (!game.id || ids.has(game.id)) throw new Error(`Missing or duplicate game id: ${game.id}`);
  ids.add(game.id);
  if (!game.title || !game.description || !game.developers?.length || !game.sources?.length) throw new Error(`Incomplete editorial entry: ${game.id}`);
}
const output = { updatedAt: new Date().toISOString(), source: 'Редакційна перевірка: офіційні видавці, студії, платформи та ігрові медіа', sources: editorial.resources, games: editorial.games };
await writeFile(new URL('../games.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Зібрано ${output.games.length} перевірених проєктів без агрегатора магазинів.`);
