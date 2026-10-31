// Renders the zones around the world centre with the game's own terrain sampler and minimap painter,
// plus the Thebes city footprint drawn the way the world map draws it.
//
//   bun scripts/render-zone-grid.mjs [--src ../aresrpg-src] [--span 3] [--px 128] [--name zone-grid]
//
// Zone labels follow the world map: the zone holding the world centre is 0, 0 (map_layers.ts).
// Output: assets/minimap/<name>.png, plus <name>.json with each zone's biome (the game's own
// world_biome_at_zone sampler) and the city areas in range, for the mob pages' spawn maps.
// The map page uses the defaults; the mob pages use --span 12 --px 40 --name nauvis-area.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const opt = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const src = resolve(opt('src', resolve(here, '../../aresrpg-src')))
const SPAN = Number(opt('span', 3)) // zones each side of 0, 0
const NAME = opt('name', 'zone-grid')
const out = resolve(here, '../assets/minimap')

const engine = await import(`${src}/packages/engine/src/data.ts`)
const render = await import(`${src}/packages/frontend/src/game/hud/minimap_render.ts`)

const ZONE = 512
const CENTER = 50_000
const ORIGIN = Math.floor(CENTER / ZONE) // the zone labelled 0
const zoneMin = label => (ORIGIN + label) * ZONE - CENTER // client-space west/north edge
const ZONES = SPAN * 2 + 1
const PX = Number(opt('px', 128)) // pixels per zone
const SIZE = ZONES * PX
const radius = (ZONES * ZONE) / 2
const center = zoneMin(-SPAN) + radius
const samples = ZONES * Math.min(64, PX) // up to one sample per 8 blocks

// paint_relief only uses fillStyle/fillRect; collect those into an RGB raster.
const px = new Uint8Array(SIZE * SIZE * 3)
const rgba = s => s.match(/[\d.]+/g).map(Number)
const context = {
  fillStyle: '',
  fillRect(x, y, w, h) {
    const [r, g, b, a = 1] = rgba(this.fillStyle)
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(SIZE, Math.ceil(y + h)); j++)
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(SIZE, Math.ceil(x + w)); i++) {
        const k = (j * SIZE + i) * 3
        px[k] = px[k] * (1 - a) + r * a
        px[k + 1] = px[k + 1] * (1 - a) + g * a
        px[k + 2] = px[k + 2] * (1 - a) + b * a
      }
  },
}

const name = 'nauvis'
const world = engine.compile_runtime_world_recipe(engine.world_terrain(name))
render.paint_relief(context, render.sample_relief_grid(world, center, center, radius, samples), SIZE)

// City structures, with the world map's colours (map_layers.ts).
const COLORS = [
  ['_road', 'rgba(185, 139, 85, 0.88)'],
  ['_field', 'rgba(137, 139, 63, 0.58)'],
  ['_garden', 'rgba(60, 125, 79, 0.68)'],
  ['_river', 'rgba(45, 122, 176, 0.82)'],
  ['_bridge', 'rgba(112, 76, 48, 0.9)'],
  ['_plaza', 'rgba(216, 200, 155, 0.92)'],
  ['_ruin', 'rgba(112, 119, 119, 0.86)'],
  ['_temple', 'rgba(47, 127, 134, 0.9)'],
  ['_gate', 'rgba(168, 95, 63, 0.9)'],
]
const toPx = v => ((v - (center - radius)) / (radius * 2)) * SIZE
for (const city of engine.city_map_overlays(world))
  for (const s of city.structures) {
    const { min_x, max_x, min_z, max_z } = s.bounds
    context.fillStyle = COLORS.find(([suffix]) => s.type.endsWith(suffix))?.[1] ?? 'rgba(216, 200, 155, 0.78)'
    context.fillRect(toPx(min_x), toPx(min_z), Math.max(1, toPx(max_x + 1) - toPx(min_x)), Math.max(1, toPx(max_z + 1) - toPx(min_z)))
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
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr.set([8, 2, 0, 0, 0], 8)
const rows = Buffer.alloc(SIZE * (SIZE * 3 + 1))
for (let y = 0; y < SIZE; y++) rows.set(px.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), y * (SIZE * 3 + 1) + 1)

mkdirSync(out, { recursive: true })
writeFileSync(
  `${out}/${NAME}.png`,
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]),
)
// Each zone's biome, sampled the way the game's world map does (content/worlds.ts), rows north to south.
const biomeWorld = engine.compile_runtime_world_recipe(engine.world_terrain(name), { structures: false })
const biomes = []
for (let z = -SPAN; z <= SPAN; z++) {
  const row = []
  for (let x = -SPAN; x <= SPAN; x++) row.push(biomeWorld.biomes[engine.sample_biome_cell(biomeWorld, ORIGIN + x, ORIGIN + z, { world_center: CENTER, cell_size: ZONE })]?.name ?? null)
  biomes.push(row)
}
const label = v => Math.floor((v + CENTER) / ZONE) - ORIGIN
const cities = engine
  .world_city_areas(name)
  .map(c => ({ id: c.id, x: label(c.min_x), z: label(c.min_z), w: 3, h: 3 }))
  .filter(c => c.x + 3 > -SPAN && c.x <= SPAN && c.z + 3 > -SPAN && c.z <= SPAN)
writeFileSync(`${out}/${NAME}.json`, JSON.stringify({ span: SPAN, cities, biomes }) + '\n')
console.log(`${NAME}: ${ZONES}×${ZONES} zones, ${SIZE}px`)
