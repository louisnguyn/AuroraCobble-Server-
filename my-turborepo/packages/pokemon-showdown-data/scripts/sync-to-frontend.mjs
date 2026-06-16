import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const publicDir = path.join(__dirname, '..', '..', '..', 'apps', 'Frontend', 'public', 'showdown-data')

const FILES = ['pokedex.json', 'moves.json', 'learnsets.json']

await mkdir(publicDir, { recursive: true })

for (const name of FILES) {
  await copyFile(path.join(dataDir, name), path.join(publicDir, name))
  process.stdout.write(`Copied ${name} → apps/Frontend/public/showdown-data/\n`)
}

console.log('Frontend static assets updated.')
