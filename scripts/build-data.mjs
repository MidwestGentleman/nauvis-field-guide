#!/usr/bin/env node
// Optional: writes data/game.json, a local cache of the game data, so the site works offline.
// Without it the site builds the same data in the visitor's browser from GitHub.
// data/game.json is git-ignored: the game's source licence forbids redistributing its files.
//
//   node scripts/build-data.mjs                      # latest release tag on GitHub
//   node scripts/build-data.mjs --ref edge           # any branch, tag or commit
//   node scripts/build-data.mjs --src ../aresrpg-src # a local clone
//
// No dependencies. Node 18+.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGameData, latestTag, rawReader } from '../assets/source.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const src = flag('--src')
const ref = src ? null : (flag('--ref') ?? (await latestTag()))

const read = src ? path => readFile(join(src, path), 'utf8') : rawReader(ref)
const data = await buildGameData(read, src ? `local clone ${src}` : `github.com/aresrpg/aresrpg@${ref}`)

await mkdir(join(root, 'data'), { recursive: true })
const file = join(root, 'data', 'game.json')
await writeFile(file, JSON.stringify(data))
console.log(
  `wrote ${file} from ${data.source}: ${data.classes.length} classes, ${data.mobs.length} mobs, ` +
    `${Object.keys(data.items).length} items, ${data.recipes.length} recipes`
)
