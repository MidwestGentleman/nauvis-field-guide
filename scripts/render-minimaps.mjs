// Renders one minimap sample per biome with the game's own engine and minimap painter.
//
//   bun scripts/render-minimaps.mjs [--src ../aresrpg-src]
//
// Needs a local clone of aresrpg/aresrpg with its dependencies installed. For each biome it scans
// the world around spawn, picks the spot where that biome fills the most of one minimap view, and
// paints that view exactly as the in-game minimap does (same sampler, radius, sample count, size
// and hill shading; no markers), away from cities. Output: assets/minimap/<world>-<biome>.png and index.json.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const arg = process.argv.indexOf('--src')
const src = resolve(arg > 0 ? process.argv[arg + 1] : resolve(here, '../../aresrpg-src'))
const out = resolve(here, '../assets/minimap')

const engine = await import(`${src}/packages/engine/src/data.ts`)
const render = await import(`${src}/packages/frontend/src/game/hud/minimap_render.ts`)
const { VIEW_RADIUS_BLOCKS: RADIUS, SAMPLE_N } = render
const SIZE = 288 // Minimap.tsx
const SCAN = 6000 // blocks around spawn to search
const STEP = 96 // coarse scan spacing
const WINDOW = Math.round((RADIUS * 2) / STEP) // coarse cells across one minimap view

// paint_relief draws through fillStyle/fillRect; collect those into an RGB raster.
const raster = () => {
  const px = new Uint8Array(SIZE * SIZE * 3)
  const context = {
    fillStyle: '',
    fillRect(x, y, w, h) {
      const [r, g, b] = this.fillStyle.match(/\d+/g).map(Number)
      for (let j = Math.max(0, Math.floor(y)); j < Math.min(SIZE, Math.ceil(y + h)); j++)
        for (let i = Math.max(0, Math.floor(x)); i < Math.min(SIZE, Math.ceil(x + w)); i++) px.set([r, g, b], (j * SIZE + i) * 3)
    },
  }
  return { px, context }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = buf => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length)
  head.write(type, 4)
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), data])))
  return Buffer.concat([head, data, tail])
}
const png = (px, size) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  const rows = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) rows.set(px.subarray(y * size * 3, (y + 1) * size * 3), y * (size * 3 + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync(out, { recursive: true })
const index = {}
for (const { world: name } of engine.worlds_source) {
  const terrain = engine.world_terrain(name)
  if (!terrain) continue
  const world = engine.compile_runtime_world_recipe(terrain)
  const n = Math.floor((SCAN * 2) / STEP)
  const cells = new Int16Array(n * n)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const col = engine.sample_world_column(world, -SCAN + i * STEP, -SCAN + j * STEP)
      cells[j * n + i] = world.biomes.indexOf(col.biome)
    }
  // City areas repave the terrain, so a sample must not overlap one.
  const cities = engine.world_city_areas(name)
  const clear = (cx, cz) =>
    !cities.some(c => c.max_x >= cx - RADIUS && c.min_x <= cx + RADIUS && c.max_z >= cz - RADIUS && c.min_z <= cz + RADIUS)
  index[name] = {}
  for (const [b, biome] of world.biomes.entries()) {
    let best = null
    for (let j = 0; j + WINDOW <= n; j++)
      for (let i = 0; i + WINDOW <= n; i++) {
        let hits = 0
        for (let y = j; y < j + WINDOW; y++) for (let x = i; x < i + WINDOW; x++) hits += cells[y * n + x] === b
        const share = hits / WINDOW ** 2
        const cx = -SCAN + (i + WINDOW / 2) * STEP
        const cz = -SCAN + (j + WINDOW / 2) * STEP
        const dist = Math.hypot(cx, cz)
        if (!clear(cx, cz)) continue
        if (!best || share > best.share + 1e-9 || (Math.abs(share - best.share) < 1e-9 && dist < best.dist)) best = { share, cx, cz, dist }
      }
    if (!best || best.share === 0) {
      console.warn(`${name}/${biome.name}: not found within ${SCAN} blocks`)
      continue
    }
    const grid = render.sample_relief_grid(world, best.cx, best.cz, RADIUS, SAMPLE_N)
    const { px, context } = raster()
    render.paint_relief(context, grid, SIZE)
    writeFileSync(`${out}/${name}-${biome.name}.png`, png(px, SIZE))
    index[name][biome.name] = { x: best.cx, z: best.cz, share: Math.round(best.share * 100) }
    console.log(`${name}/${biome.name}: ${Math.round(best.share * 100)}% at ${best.cx},${best.cz}`)
  }
}
writeFileSync(`${out}/index.json`, JSON.stringify({ radius: RADIUS, index }, null, 2) + '\n')
