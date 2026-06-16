import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')

const FILES = {
  'pokedex.json': 'https://play.pokemonshowdown.com/data/pokedex.json',
  'moves.json': 'https://play.pokemonshowdown.com/data/moves.json',
  'learnsets.json': 'https://play.pokemonshowdown.com/data/learnsets.json',
}

await mkdir(dataDir, { recursive: true })

for (const [name, url] of Object.entries(FILES)) {
  process.stdout.write(`Downloading ${name}… `)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  const text = await res.text()
  await writeFile(path.join(dataDir, name), text, 'utf8')
  process.stdout.write(`${text.length.toLocaleString()} bytes\n`)
}

console.log('Done — data saved to packages/pokemon-showdown-data/data/')
