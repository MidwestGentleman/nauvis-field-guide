// Records a spell being cast inside the real game client: the class's character model, the mob's
// model, a fight board, the cast animation, the in-game spell effect and the damage/heal number,
// all rendered locally.
//
//   bun scripts/render-spells-game.mjs --class shugo --spell "Natural Attack"
//   bun scripts/render-spells-game.mjs --class iyashi --spell "Healing Word"     # ally spells: a hurt ally
//   bun scripts/render-spells-game.mjs --class shugo                             # every spell of a class
//   bun scripts/render-spells-game.mjs --all [--skip-existing]                   # every spell of every class
//   ranks: --rank N (1–6) for one rank; --ranks 1-6 (a range or list, e.g. 1,6). A single spell defaults to
//          rank 1, --class/--all default to every rank 1-6. The caster gets that spell rank through the Fight
//          lab's own spell-point screen (simulator/spell_level_set) and a character level that can afford it.
//   bun scripts/render-spells-game.mjs --merge                                   # only rebuild index.json
//   bun scripts/render-spells-game.mjs --changed [--dry-run] [--shard i/n] [--retry-failed]  # stale/missing only
//   bun scripts/render-spells-game.mjs --prune [--dry-run]                       # drop removed spells/ranks
//   bun scripts/render-spells-game.mjs --stamp                                   # fingerprint unstamped clips
//   mob spells: --mobs crab[,nook] | --mobs all | --family fuwa[,ant] (with --spell "Backwash" for one): the
//          mob casts the spell at a character (or on itself, or on a second mob of its kind for ally spells)
//   (after a game release use scripts/update-spell-clips.mjs; see scripts/README-spell-clips.md)
//   options: [--src ../aresrpg-src] [--mob fuwa__white] [--size 480x270] [--pad 1.3] [--fps 15] [--port 5199]
//            [--format mp4,webp,gif] [--rings] (keep the team rings under the fighters) [--board 16]
//
// Needs a local clone of aresrpg/aresrpg with its dependencies installed, ffmpeg, and a Mac/PC whose
// headless Chromium exposes WebGPU (the game renders with WebGPU only). Fully offline: it starts the
// clone's own Vite dev server on 127.0.0.1, opens the developer Fight lab (/demo#fight, a local
// deterministic fight simulator with no wallet or chain), and refuses every request that is not to
// that local server. Nothing in the clone is modified: the only change is made in flight, in the
// headless browser, to the overlay projection module, so the board paints no movement tiles/path or
// team rings. The spell's own aiming overlay stays: before the cast the script selects the spell and
// hovers the target cell through the fight screen's own interaction state, so the game paints the
// cast range, the targetable cells and the area the spell will hit; that preview is held while the
// effect plays (the game itself drops it during a presentation). Framing includes the whole area.
//
// Per spell: it builds the local fight setup from the app's own simulator state, then puts the caster
// and the target 2–4 cells apart near the middle of the board, laid out across the screen rather
// than in depth (target type from the game's spell data: enemy, ally, self, or an empty cell for
// glyphs, traps and teleports). An ally starts at half HP so a heal shows its +N. It zooms and pans
// the game's own fight camera onto them, records from just before the cast until the number has
// faded, and crops a 4:3 window around the fighters (before and after the cast, so pushes stay in).
// Mob spells run the other way round: the mob's kit is cut down to the one spell, it gets that spell's AP
// and no MP, and the character ends its turn, so the game's own mob AI casts it. The mob's range, the
// targetable cells and the area are painted with the same overlay presets (the game shows none for mobs).
// A mob heal needs a wounded ally, so the character hits that mob once before the recording starts.
// Output: assets/spells/<class>-<spell-slug>-r<rank>.<ext> (mob-<mob>-<spell-slug>.<ext> for mobs), a sidecar
// assets/spells/.meta/<file>.json, and (merged from all sidecars, so parallel workers on different --port
// never clobber it) an entry "<class>/<Spell Name>/<rank>" ("mob:<mob_type>/<Spell Name>/1") in
// assets/spells/index.json. Merging also drops old rank-less entries
// and their files once the r1 clip exists. Failures go to assets/spells/.meta/failures/<file>.json.
// (render-spells.mjs, the deterministic stage renderer, writes to assets/spells/stage/ instead.)
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync, existsSync, renameSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const flag = name => argv.includes(`--${name}`)
const src = resolve(opt('src', resolve(here, '../../aresrpg-src')))
const out = resolve(opt('out', resolve(here, '../assets/spells'))) // --out DIR: write somewhere else (stills, experiments)
const [W, H] = opt('size', '480x270').split('x').map(Number)
const PAD = Number(opt('pad', '1.3')) // extra room around the fighters (1 = tight)
const FPS = Number(opt('fps', 15))
const PORT = Number(opt('port', 5199))
const MOB = opt('mob', 'fuwa__white')
// fight_boards.boards[seed % count]: the Fight lab starts on seed 1 and rerolls to this board
// (16: 13×11, no rocks or holes, so area spells keep their whole shape)
const BOARD = Number(opt('board', 16))
// mob clips: the character the mob casts at, high enough to take a level-max hit
const TARGET_CLASS = 'shugo',
  TARGET_LEVEL = 100,
  PRE_HIT = 'Natural Attack' // the character's hit that wounds the mob a mob heal is aimed at
const formats = opt('format', 'mp4').split(',')
const KEEP_RINGS = flag('rings')
const ORIGIN = `http://127.0.0.1:${PORT}`
const VW = 1600,
  VH = 900 // viewport; the clip is a 16:9 window around the fighters, scaled down to --size
const PRE_ROLL = 0.8 // seconds kept before the cast (the aimed range + area show the whole time)
const TAIL = 1.25 // seconds kept after the presentation ends (the number lives ~1.1 s after impact)
const MAX_SECONDS = 4.5
const MOB_MAX_SECONDS = 6 // a mob cast waits for the turn to pass to the mob first
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// bump when a change here alters the pictures (layout, framing, timing, overlays); not for metadata-only changes
const SCRIPT_VERSION = 4

// spell facts straight from the aresrpg-src checkout (seed/content/spells.json is what the game publishes),
// so a game release is picked up without rebuilding the wiki's data/game.json first
const { create_source } = await import(`${src}/packages/engine/src/generated/claude_spell_source.js`)
const catalog = create_source().catalog
const read_json = path => JSON.parse(readFileSync(resolve(src, path), 'utf8'))
const src_spells = read_json('seed/content/spells.json')
const src_mobs = read_json('seed/content/mobs.json')
const BOARD_COUNT = read_json('seed/content/fight_boards.json').boards.length
// a mob job's "class" is mob:<mob_type>; its spells have one level, shaped like a class spell's
const mob_of = cls => (cls.startsWith('mob:') ? src_mobs.find(m => m.mob_type === cls.slice(4)) : null)
const src_spell = (cls, spell) => {
  if (!cls.startsWith('mob:')) return src_spells.find(x => x.classe === cls && x.name === spell)
  const s = mob_of(cls)?.spells.find(x => x.name === spell)
  return s && { classe: cls, name: spell, unlock_level: 1, levels: s.levels }
}
const class_ids = [...new Set(src_spells.map(x => x.classe))]
const mob_ids = src_mobs.map(m => `mob:${m.mob_type}`)
const spells_of = cls => (cls.startsWith('mob:') ? (mob_of(cls)?.spells ?? []).map(s => s.name) : src_spells.filter(x => x.classe === cls).map(x => x.name))

// --- fingerprints: what a clip depends on, so a release re-renders only what changed ---
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? String(v) : v))).digest('hex').slice(0, 16)
const git = (...args) => {
  try {
    return execFileSync('git', ['-C', src, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}
const SRC = { commit: git('rev-parse', 'HEAD'), describe: git('describe', '--tags', '--always', '--dirty') }
// shared VFX sources (the spell-effect page and its synth, compiled into the in-game effect layer) and the mob
const VFX_FILES = ['seed/content/spell_effects/source.html', 'seed/content/spell_effects/synth.js', 'packages/engine/src/generated/claude_spell_source.js']
const vfx_hash = sha(VFX_FILES.map(f => (existsSync(resolve(src, f)) ? readFileSync(resolve(src, f), 'utf8') : '')).join('\0'))
const mob_hash = sha(read_json('seed/content/mobs.json').find(m => m.mob_type === MOB) ?? MOB)
const RENDER = { W, H, PAD, FPS, VW, VH, PRE_ROLL, TAIL, MAX_SECONDS, MOB, formats: [...formats].sort(), KEEP_RINGS, SCRIPT_VERSION, BOARD }
const fingerprint = (cls, spell, rank) => {
  const s = src_spell(cls, spell)
  const caster = mob_of(cls)
  return sha({
    spell: s && { classe: s.classe, name: s.name, unlock_level: s.unlock_level, level: s.levels[rank - 1] ?? null },
    row: catalog[cls]?.find(r => r.name === spell) ?? null, // per-spell VFX parameters (path, shape, palette, seed)
    vfx: vfx_hash,
    // a mob clip depends on its own mob's row (stats, model, the rest of its kit) and the character it hits
    mob: caster ? sha(caster) : mob_hash,
    render: caster ? { ...RENDER, MOB: null, MAX_SECONDS: MOB_MAX_SECONDS, TARGET_CLASS, TARGET_LEVEL, PRE_HIT } : RENDER,
  })
}

const parse_ranks = text =>
  text.split(',').flatMap(part => {
    const [a, b = a] = part.split('-').map(Number)
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  })
// --mobs a,b | all, --family f,g: mob jobs (one rank each)
const families = (opt('family') ?? '').split(',').filter(Boolean)
const mobs_picked = opt('mobs') === 'all' ? mob_ids : (opt('mobs') ?? '').split(',').filter(Boolean).map(m => `mob:${m}`)
for (const id of mobs_picked) if (!mob_of(id)) throw new Error(`unknown mob ${id.slice(4)}`)
const mob_jobs = [...new Set([...mobs_picked, ...mob_ids.filter(id => families.includes(mob_of(id).family))])]
const single = Boolean((opt('class') || mob_jobs.length === 1) && opt('spell'))
const RANKS = opt('rank') ? [Number(opt('rank'))] : parse_ranks(opt('ranks', single ? '1' : '1-6'))
if (!RANKS.length || RANKS.some(r => !Number.isInteger(r) || r < 1 || r > 6)) throw new Error('ranks are 1 to 6')
const classes = (opt('class') ?? '').split(',').filter(Boolean)
const jobs = []
const add_jobs = (cls, spell) => RANKS.forEach(rank => src_spell(cls, spell)?.levels[rank - 1] && jobs.push([cls, spell, rank]))
const CHANGED = flag('changed')
if (flag('merge') || flag('prune') || flag('stamp')) jobs.length = 0
// --all and a bare --changed cover every class spell and every mob spell
else if (flag('all') || (CHANGED && !classes.length && !mob_jobs.length)) for (const id of [...class_ids, ...mob_ids]) for (const name of spells_of(id)) add_jobs(id, name)
else if (single) add_jobs(opt('class') ?? mob_jobs[0], opt('spell'))
else if (classes.length || mob_jobs.length) for (const id of [...classes, ...mob_jobs]) for (const name of spells_of(id)) add_jobs(id, name)
else throw new Error('use --class X --spell "Name", --class X[,Y], --mobs X[,Y]|all, --family F, --all, --changed, --merge, --prune or --stamp')
const index_file = resolve(out, 'index.json')
const meta_dir = resolve(out, '.meta')
const fail_dir = resolve(meta_dir, 'failures')
const file_of = (cls, spell, rank) => (cls.startsWith('mob:') ? `mob-${slug(cls.slice(4))}-${slug(spell)}` : `${cls}-${slug(spell)}-r${rank}`)
const read_index = () => (existsSync(index_file) ? JSON.parse(readFileSync(index_file, 'utf8')) : {})
// index.json = every sidecar, plus older entries not superseded; written atomically (tmp + rename)
const merge_index = () => {
  const index = read_index()
  if (existsSync(meta_dir))
    for (const name of readdirSync(meta_dir).filter(n => n.endsWith('.json'))) {
      try {
        const { key, entry } = JSON.parse(readFileSync(resolve(meta_dir, name), 'utf8'))
        index[key] = entry
      } catch {}
    }
  for (const key of Object.keys(index)) {
    const [cls, spell, rank] = key.split('/')
    if (rank !== undefined) continue
    // a rank-less clip from before ranks: gone once its r1 version exists
    if (existsSync(resolve(out, `${file_of(cls, spell, 1)}.mp4`)) && index[`${cls}/${spell}/1`]) {
      for (const ext of ['mp4', 'webp', 'gif']) rmSync(resolve(out, `${index[key].file}.${ext}`), { force: true })
      delete index[key]
    }
  }
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
  const tmp = `${index_file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(sorted, null, 2))
  renameSync(tmp, index_file)
  return Object.keys(sorted).length
}
const key_of = (cls, spell, rank) => `${cls}/${spell}/${rank}`
const sidecar = (cls, spell, rank) => resolve(meta_dir, `${file_of(cls, spell, rank)}.json`)
const read_sidecar = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
if (flag('merge')) {
  console.log(`index.json: ${merge_index()} entries`)
  process.exit(0)
}
// --stamp: record fingerprints on clips rendered before fingerprints existed (assumes the current checkout made them)
if (flag('stamp')) {
  let n = 0
  for (const id of class_ids)
    for (const name of spells_of(id))
      for (let rank = 1; rank <= 6; rank++) {
        const meta = read_sidecar(sidecar(id, name, rank))
        if (!meta || meta.entry.fp || !existsSync(resolve(out, `${meta.entry.file}.mp4`))) continue
        meta.entry = { ...meta.entry, fp: fingerprint(id, name, rank), src: SRC }
        writeFileSync(sidecar(id, name, rank), JSON.stringify(meta))
        n++
      }
  console.log(`stamped ${n} clips with ${SRC.describe}; index.json: ${merge_index()} entries`)
  process.exit(0)
}
// --prune: drop clips (files, sidecars, manifest entries) whose spell or rank no longer exists in the checkout
if (flag('prune')) {
  const index = read_index()
  const gone = Object.keys(index).filter(key => {
    const [cls, spell, rank] = key.split('/')
    return !src_spell(cls, spell)?.levels[Number(rank ?? 1) - 1]
  })
  for (const key of gone) {
    const [cls, spell, rank] = key.split('/')
    console.log(`${flag('dry-run') ? 'would prune' : 'prune'} ${key}`)
    if (flag('dry-run')) continue
    for (const ext of ['mp4', 'webp', 'gif']) rmSync(resolve(out, `${index[key].file}.${ext}`), { force: true })
    if (rank) rmSync(sidecar(cls, spell, rank), { force: true }), rmSync(resolve(fail_dir, `${file_of(cls, spell, rank)}.json`), { force: true })
    delete index[key]
  }
  if (!flag('dry-run')) {
    writeFileSync(index_file, JSON.stringify(index, null, 2))
    console.log(`pruned ${gone.length}; index.json: ${merge_index()} entries`)
  } else console.log(`${gone.length} to prune`)
  process.exit(0)
}
if (flag('skip-existing')) {
  const done = read_index()
  jobs.splice(0, jobs.length, ...jobs.filter(([c, s, r]) => !done[key_of(c, s, r)] && !existsSync(sidecar(c, s, r))))
}
// stable partitioning for parallel workers (--shard i/n, i from 0): by a hash of the key, so a worker's share
// never depends on what the others have already finished
jobs.sort((a, b) => key_of(...a).localeCompare(key_of(...b), 'en', { numeric: true }))
if (opt('shard')) {
  const [i, n] = opt('shard').split('/').map(Number)
  jobs.splice(0, jobs.length, ...jobs.filter(j => parseInt(sha(key_of(...j)).slice(0, 8), 16) % n === i))
}
// --changed: only clips that are missing or whose fingerprint differs from the current checkout + settings
// (a recorded failure with the same fingerprint is not retried unless --retry-failed)
const why_stale = ([c, s, r]) => {
  const meta = read_sidecar(sidecar(c, s, r))
  const fp = fingerprint(c, s, r)
  if (!meta || !existsSync(resolve(out, `${meta.entry.file}.mp4`))) {
    const failure = read_sidecar(resolve(fail_dir, `${file_of(c, s, r)}.json`))
    return failure?.fp === fp && !flag('retry-failed') ? null : failure ? 'failed before' : 'missing'
  }
  return meta.entry.fp === fp ? null : meta.entry.fp ? 'changed' : 'unstamped'
}
if (CHANGED) {
  const stale = jobs.map(j => [j, why_stale(j)]).filter(([, why]) => why)
  jobs.splice(0, jobs.length, ...stale.map(([j]) => j))
  const counts = stale.reduce((t, [, why]) => ({ ...t, [why]: (t[why] ?? 0) + 1 }), {})
  console.log(`${stale.length} stale clips vs ${SRC.describe} (${JSON.stringify(counts)})`)
  if (flag('dry-run')) for (const [[c, s, r], why] of stale) console.log(`  ${why.padEnd(13)} ${key_of(c, s, r)}`)
}
if (flag('dry-run')) {
  if (!CHANGED) for (const j of jobs) console.log(`  ${key_of(...j)}`)
  console.log(`${jobs.length} clips would be rendered`)
  process.exit(0)
}
if (!jobs.length) {
  console.log('nothing to render')
  merge_index()
  process.exit(0)
}

// a mob spell, read the way the mob AI (packages/fight/src/turns.ts) picks its anchor: only-caster rows aim at
// itself, only-ally rows at a second mob (at itself when the range is 0), anything else at the character
const mob_plan = (cls, spell) => {
  const raw = src_spell(cls, spell)?.levels[0]
  if (!raw) throw new Error(`Unknown mob spell ${cls} / ${spell}`)
  const rows = [...raw.effects, ...raw.crit_effects]
  const only = filters => rows.length > 0 && rows.every(r => filters.includes(r.target_filter)) // 3 not_enemy, 4 only_caster
  const heal = raw.effects.some(r => r.kind === 4 && r.stat === 12)
  const target = only([4]) || (only([3, 4]) && raw.range_max === 0) ? 'self' : only([3, 4]) ? 'ally' : 'enemy'
  return {
    mob: cls.slice(4),
    target,
    rank: 1,
    char_level: TARGET_LEVEL,
    range_min: raw.range_min,
    range_max: raw.range_max,
    line: Boolean(raw.line_launch),
    los: Boolean(raw.line_of_sight),
    ap: raw.ap_cost,
    push: raw.effects.reduce((t, f) => t + (f.kind === 8 ? f.value : f.kind === 9 ? -f.value : 0), 0),
    teleport: false,
    area: 0,
    whole: rows.some(r => r.area_shape === 6),
    // a heal is aimed at the most wounded mob of its side: that one (the caster itself for a range-0 heal) is hit first
    wound: heal ? (target === 'ally' ? 'ally' : 'caster') : null,
  }
}

const spell_plan = (cls, spell, rank = 1) => {
  if (cls.startsWith('mob:')) return mob_plan(cls, spell)
  const row = catalog[cls]?.find(r => r.name === spell)
  if (!row) throw new Error(`Unknown spell ${cls} / ${spell}`)
  const facts = src_spell(cls, spell)
  const raw = facts?.levels[rank - 1]
  if (!raw) throw new Error(`no rank ${rank} for ${cls} / ${spell}`)
  const level = { ap: raw.ap_cost, range: [raw.range_min, raw.range_max], line: raw.line_launch, los: raw.line_of_sight, fx: raw.effects }
  const kinds = (level?.fx ?? []).map(f => f.kind)
  // 10 teleport, 12 trap, 13 glyph: aimed at an empty cell
  // a rank with range 0 can only be cast on the caster's own cell (e.g. Regenerating Word r1–2)
  const target = row.path === 'self' || level.range[1] === 0 ? 'self' : row.on === 'ally' ? 'ally' : row.trap || kinds.some(k => k === 10 || k === 12 || k === 13) ? 'cell' : 'enemy'
  const area = Math.max(0, ...(level?.fx ?? []).filter(f => f.kind === 12 || f.kind === 13).map(f => f.area_size))
  const unlock = facts?.unlock_level ?? 1
  return {
    target,
    rank,
    unlock,
    // spell points: rank r costs r(r-1)/2, a character has level − 1 of them
    char_level: Math.max(unlock, (rank * (rank - 1)) / 2 + 1),
    range_min: level?.range[0] ?? 1,
    range_max: level?.range[1] ?? 4,
    line: Boolean(level?.line),
    los: Boolean(level?.los),
    // cells pushed (+) or pulled (−) at this level (kind 8 push, 9 pull)
    ap: level.ap,
    push: (level?.fx ?? []).reduce((t, f) => t + (f.kind === 8 ? f.value : f.kind === 9 ? -f.value : 0), 0),
    teleport: kinds.includes(10),
    area,
    // a whole-board area (shape 6) is painted but not framed: the fighters stay the subject
    whole: (level?.fx ?? []).some(f => f.area_shape === 6),
  }
}

// --- the clone's own dev server, only for the length of this run ---
const vite = spawn(resolve(src, 'packages/frontend/node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: resolve(src, 'packages/frontend'),
  stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('vite did not start')), 60000)
  const watch = chunk => String(chunk).includes(`127.0.0.1:${PORT}`) && (clearTimeout(timer), ok())
  vite.stdout.on('data', watch)
  vite.stderr.on('data', chunk => process.stderr.write(chunk))
  vite.on('exit', code => fail(new Error(`vite exited ${code}`)))
})
const stop = () => vite.kill('SIGTERM')
process.on('exit', stop)

const require = createRequire(resolve(src, 'package.json'))
const { chromium } = require('@playwright/test')
const cache = resolve(process.env.HOME, 'Library/Caches/ms-playwright')
const cached = () => {
  try {
    const dir = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort((a, b) => b.split('-')[1] - a.split('-')[1])[0]
    const bin = dir && readdirSync(resolve(cache, dir)).find(d => d.startsWith('chrome-headless-shell'))
    return bin ? resolve(cache, dir, bin, 'chrome-headless-shell') : undefined
  } catch { return undefined }
}
const executablePath = opt('chrome') ?? (existsSync(chromium.executablePath()) ? undefined : cached())
const browser = await chromium.launch({ executablePath, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })

// Runs in the page: lay out the local fight for candidate #attempt and start it.
const setup = async ({ cls, mob, plan, attempt, fs, spell, board_index, board_count, pre_hit }) => {
  const S = await import('/src/store.ts')
  const sim = await import('/src/modules/simulator.ts')
  const { simulator_fight_setup } = await import('/src/simulator/fight_setup.ts')
  const F = await import(`/@fs${fs}/packages/fight/src/index.ts`)
  const { line_of_sight } = await import(`/@fs${fs}/packages/fight/src/combat_grid.ts`)
  const { target, range_min, range_max, line, los, push, teleport, area } = plan
  // a mob job: the mob casts, the character is what it casts at (or stands by), a second mob is the ally
  const mob_cast = Boolean(plan.mob)
  if (mob_cast) mob = plan.mob
  // the Fight lab's own board reroll, until fight_boards.boards[seed % count] is the chosen board
  for (let i = 0; i < board_count && S.read_app_state().simulator.seed % BigInt(board_count) !== BigInt(board_index); i++)
    S.dispatch_app({ type: 'simulator/board_rerolled' })
  // the app's own simulator builds the characters (class, level, spells, stats); we only move them
  const base = S.read_app_state().simulator
  const board0 = sim.simulator_board(base)
  const add = name => {
    const id = sim.next_simulator_character_id(S.read_app_state().simulator.characters)
    S.dispatch_app({ type: 'simulator/character_added', character_id: id, classe: cls, name, male: name === 'Caster' })
    S.dispatch_app({ type: 'simulator/level_set', character_id: id, level: plan.char_level })
    if (name === 'Caster' && plan.rank > 1)
      S.dispatch_app({ type: 'simulator/spell_level_set', character_id: id, spell_name: spell, level: plan.rank, max_level: 6 })
    return id
  }
  const caster_id = add(mob_cast ? 'Target' : 'Caster')
  S.dispatch_app({ type: 'simulator/character_placed', cell: board0.start_cells_a[0], character_id: caster_id })
  const ally_id = target === 'ally' && !mob_cast ? add('Ally') : null
  if (ally_id) S.dispatch_app({ type: 'simulator/character_placed', cell: board0.start_cells_a[1], character_id: ally_id })
  // the mob at the top of its level range, so a high-rank hit rarely ends the fight mid-clip
  const { encyclopedia_catalog } = await import('/src/content/catalog.ts')
  const seed_mob = encyclopedia_catalog.mobs.find(m => m.mob_type === mob)
  const mob_level = seed_mob?.level_max ?? 1
  S.dispatch_app({ type: 'simulator/mob_placed', cell: board0.start_cells_b[0], mob_type: mob, level: mob_level, level_min: seed_mob?.level_min ?? 1, level_max: mob_level })
  const state = S.read_app_state().simulator
  const fight_setup = simulator_fight_setup(state)
  const caster_row = fight_setup.players.find(p => p.character === caster_id)
  const rank_set = Number(caster_row?.source?.spell_levels?.[spell] ?? 1n)
  if (!mob_cast && rank_set !== plan.rank) {
    const ch = state.characters.find?.(c => c.id === caster_id) ?? state.characters[caster_id]
    return { done: true, error: `spell rank ${plan.rank} not applied (got ${rank_set}; level ${ch?.level}, ${JSON.stringify(ch?.spell_levels)})` }
  }
  const board = fight_setup.board
  const cells = F.project_board_cells(board).filter(c => c.kind !== 'hole' && c.kind !== 'obstacle')
  const at = new Map(cells.map(c => [`${c.x},${c.y}`, c]))
  // obstacles (rock blocks) on the camera side of a fighter hide its legs
  const rocks = new Set(F.project_board_cells(board).filter(c => c.kind === 'obstacle').map(c => `${c.x},${c.y}`))
  const hidden = list => list.reduce((t, c) => t + [[1, 0], [0, 1], [1, 1]].filter(([u, v]) => rocks.has(`${c.x + u},${c.y + v}`)).length, 0)
  const mx = cells.reduce((t, c) => t + c.x, 0) / cells.length,
    my = cells.reduce((t, c) => t + c.y, 0) / cells.length
  const d = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
  const lo = Math.max(range_min, Math.min(2, range_max), 1), // melee-only ranks (range 1) stand adjacent
    hi = Math.max(lo, Math.min(range_max, 4))
  const ideal = push < 0 ? Math.min(hi, 1 - push) : lo // a pull needs room to pull; else two cells across the screen frames tightest; the number and the flight still read
  const reach = (a, g) => d(a, g) >= range_min && d(a, g) <= range_max && (!line || a.x === g.x || a.y === g.y) && (!los || line_of_sight(a.cell, g.cell, board.obstacles))
  // screen layout of the fight camera (azimuth 45°): screen-x grows with dx − dy, depth with dx + dy
  const across = (a, g) => {
    const sx = g.x - a.x - (g.y - a.y),
      depth = g.x - a.x + (g.y - a.y)
    return Math.abs(depth) / (Math.abs(sx) + 1) + (sx < 0 ? 0.5 : 0)
  }
  const centre = list => {
    const x = list.reduce((t, c) => t + c.x, 0) / list.length,
      y = list.reduce((t, c) => t + c.y, 0) / list.length
    return Math.hypot(x - mx, y - my)
  }
  const options = []
  for (const a of cells) {
    for (const g of cells) {
      if (g === a) continue
      const dg = d(a, g)
      if (target === 'self' ? dg < 2 || dg > 3 : dg < lo || dg > hi || !reach(a, g)) continue
      let m = g,
        extra = 0,
        steps = 0,
        subjects = [a, g],
        ally = null
      // the character's pre-recording hit on the mob a heal will go to: in its range, in sight
      const can_hit = (c, mob_cell) => d(c, mob_cell) >= 1 && d(c, mob_cell) <= 6 && line_of_sight(c.cell, mob_cell.cell, board.obstacles)
      if (target === 'self' && plan.wound === 'caster' && !can_hit(g, a)) continue
      if (target === 'ally' && mob_cast && plan.wound === 'ally') {
        ally = g
        // the character stands a few cells off the wounded mob, outside the heal's own reach
        m = cells.filter(c => d(c, a) >= 3 && d(c, g) >= 3 && can_hit(c, g)).sort((p, q) => Math.abs(d(p, g) - 4) - Math.abs(d(q, g) - 4) || d(p, a) - d(q, a))[0]
        if (!m) continue
        subjects = [a, g, m]
      } else if (target === 'ally') {
        ally = g
        // the mob (for a mob's ally spell: the character) stands well away, out of the shot
        m = cells.filter(c => d(c, a) >= 6 && d(c, g) >= 6).sort((p, q) => d(p, a) - d(q, a))[0]
        if (!m) continue
      } else if (target === 'cell') {
        // a glyph/trap lands next to the mob so it is caught in it; a teleport lands near the mob
        const near = cells.filter(c => c !== a && c !== g && d(c, g) === (area > 0 || !teleport ? 1 : 2) && d(c, a) >= 2)
        m = near.sort((p, q) => across(a, p) - across(a, q))[0]
        if (!m) continue
        subjects = [a, g, m]
      } else if (push !== 0 && target === 'enemy') {
        // the pushed/pulled path must be free floor so the whole move shows
        const sx = Math.sign(g.x - a.x),
          sy = Math.sign(g.y - a.y)
        steps = push > 0 ? push : -Math.min(-push, dg - 1)
        let free = true
        for (let i = 1; i <= Math.abs(steps); i++) if (!at.get(`${g.x + Math.sign(steps) * sx * i},${g.y + Math.sign(steps) * sy * i}`)) free = false
        if (!free) extra += 6
        const land = at.get(`${g.x + steps * sx},${g.y + steps * sy}`)
        if (land) subjects = [a, g, land]
      }
      const score = hidden(subjects) * 0.8 + centre(subjects) * 0.15 + Math.abs(dg - ideal) * 1.5 + across(a, g) * 4 + extra
      options.push({ a: a.cell, g: g.cell, m: m.cell, ally: ally?.cell ?? null, score, steps, dg, why: [a.x, a.y, g.x, g.y, centre(subjects).toFixed(1), across(a, g).toFixed(2)].join(' ') })
    }
  }
  options.sort((x, y) => x.score - y.score)
  const pick = options[attempt]
  if (!pick) return { done: true, error: 'no layout fits this spell' }
  if (mob_cast) {
    const players = fight_setup.players.map(p => ({ ...p, cell: pick.m }))
    const base_mob = fight_setup.mobs[0]
    // the one spell, its AP (level scaling adds at most 30%: still one cast) and no MP, so it casts from where it stands
    const caster_mob = { ...base_mob, cell: pick.a, template: { ...base_mob.template, ap: BigInt(plan.ap), mp: 0n, spells: base_mob.template.spells.filter(s => s.name === spell) } }
    const mobs = [caster_mob, ...(pick.ally !== null ? [{ ...base_mob, cell: pick.ally, template: { ...base_mob.template, mp: 0n, spells: [] } }] : [])]
    S.dispatch_app({ type: 'fight/opened', mode: 'local', setup: { ...fight_setup, players, mobs }, seed: state.seed })
    S.dispatch_app({ type: 'fight/input', fight: null, input: { type: 'start' }, origin: 'local' })
    const checkpoint = S.read_app_state().fight.checkpoint
    const seat_of = cell => checkpoint.contract.fighters.findIndex(f => String(f.cell) === String(cell))
    const seat = seat_of(pick.a),
      char_seat = seat_of(pick.m)
    // what the AI anchors on: itself, the second mob, or the character
    const goal = target === 'self' ? pick.a : pick.g
    const level = checkpoint.contract.fighters[seat]?.kind.snapshot?.kit[0]?.level
    if (!level) return { done: true, error: `${mob} has no ${spell} in its kit` }
    const hit_area = [...new Set(level.effects.flatMap(row => F.spell_effect_area_cells(checkpoint, BigInt(seat), BigInt(goal), row).map(Number)))]
    // the aiming overlay a player's spell gets: range, targetable cells (in line / in sight) and the area
    const from = cells.find(c => c.cell === pick.a)
    const range = cells.filter(c => d(c, from) >= range_min && d(c, from) <= range_max && (!line || c.x === from.x || c.y === from.y))
    const targetable = range.filter(c => !los || line_of_sight(from.cell, c.cell, board.obstacles))
    window.__cap = {
      seat,
      turn_seat: char_seat,
      goal: String(goal),
      subjects: [seat, target === 'self' ? char_seat : seat_of(goal)],
      shift: pick.steps / pick.dg,
      area: plan.whole ? [] : hit_area,
      mob_aim: { range: range.map(c => Number(c.cell)), targetable: targetable.map(c => Number(c.cell)), area: hit_area, origin: Number(pick.a), target: Number(goal) },
      wound: plan.wound === 'ally' ? String(pick.ally) : plan.wound === 'caster' ? String(pick.a) : null,
      pre_hit,
    }
    return { done: false, error: null, seat, goal: String(goal), grid_w: Number(F.CONTRACT_CONSTANTS.grid_w), top: options.slice(0, 5).map(o => `${o.score.toFixed(2)} ${o.why}`), centre: [mx, my] }
  }
  const players = fight_setup.players.map(p => {
    const is_ally = p.character === ally_id
    // a few spells cost 7–8 AP, more than the base 6: the caster gets the missing AP as an (invisible) gear bonus
    const extra = p.character === caster_id ? BigInt(Math.max(0, plan.ap - 6)) : 0n
    const source = extra ? { ...p.source, folded_stats: { ...p.source.folded_stats, action: p.source.folded_stats.action + extra } } : p.source
    return { ...p, source, cell: is_ally ? pick.ally : pick.a, hp: is_ally ? (p.hp + 1n) / 2n : p.hp }
  })
  const mobs = fight_setup.mobs.map(x => ({ ...x, cell: pick.m }))
  const final_setup = { ...fight_setup, players, mobs }
  S.dispatch_app({ type: 'fight/opened', mode: 'local', setup: final_setup, seed: state.seed })
  S.dispatch_app({ type: 'fight/input', fight: null, input: { type: 'start' }, origin: 'local' })
  const checkpoint = S.read_app_state().fight.checkpoint
  const seat_of = cell => checkpoint.contract.fighters.findIndex(f => String(f.cell) === String(cell))
  const seat = seat_of(pick.a)
  const goal = target === 'self' ? pick.a : pick.g
  const subjects = [seat, ...(target === 'self' ? [seat_of(pick.m)] : target === 'cell' ? [seat_of(pick.m)] : [seat_of(target === 'ally' ? pick.ally : pick.m)])]
  // a push/pull moves the target `steps` cells along the caster→target line: framed up front
  const hit_area = F.spell_area_cells(checkpoint, BigInt(seat), spell, BigInt(goal)) ?? []
  window.__cap = { seat, goal: String(goal), subjects, shift: pick.steps / pick.dg, area: plan.whole ? [] : hit_area.map(Number) }
  return { done: false, error: null, seat, goal: String(goal), grid_w: Number(F.CONTRACT_CONSTANTS.grid_w), top: options.slice(0, 5).map(o => `${o.score.toFixed(2)} ${o.why}`), centre: [mx, my] }
}

// Runs in the page: is it our caster's turn yet? End an ally's turn if it came first.
const turn_state = async () => {
  const S = await import('/src/store.ts')
  const f = S.read_app_state().fight
  const c = f.checkpoint?.contract
  if (!c || c.round === 0n) return 'wait'
  const active = Number(c.queue[Number(c.turn_ptr)])
  if (active === (window.__cap.turn_seat ?? window.__cap.seat)) return 'ours'
  const fighter = c.fighters[active]
  if (fighter?.kind.type === 'player' && f.presentations.length === 0)
    S.dispatch_app({ type: 'fight/input', fight: null, origin: 'local', input: { type: 'end_turn', fighter: BigInt(active) } })
  return 'wait'
}
const targetable = async ({ spell, fs }) => {
  const S = await import('/src/store.ts')
  if (window.__cap.mob_aim) return window.__cap.mob_aim.targetable.includes(Number(window.__cap.goal)) ? null : 'target not in the mob spell\'s targetable cells'
  const { spell_target_cells } = await import(`/@fs${fs}/packages/fight/src/effects.ts`)
  const checkpoint = S.read_app_state().fight.checkpoint
  const cells = spell_target_cells(checkpoint, BigInt(window.__cap.seat), spell)
  if (cells.targetable.some(c => String(c) === window.__cap.goal)) return null
  const me = checkpoint.contract.fighters[window.__cap.seat]
  return `target not reachable (${cells.targetable.length} targetable cells, ${cells.range.length} in range, AP ${me.ap})`
}

// where the fighters are on screen (head-top anchors from the game's own projection) and how tall
const project = page =>
  page.evaluate(async () => {
    const S = await import('/src/store.ts')
    const { fight_entity_id } = await import('/src/game/fight/fight_cue_projection.ts')
    let scene = window.__capScene
    if (!scene)
      for (const el of document.querySelectorAll('*')) {
        const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
        for (let f = key && el[key], i = 0; f && i < 60 && !scene; f = f.return, i++) if (f.memoizedProps?.scene?.project_entity) scene = f.memoizedProps.scene
        if (scene) break
      }
    window.__capScene = scene
    const checkpoint = S.read_app_state().fight.checkpoint ?? window.__capCheckpoint
    window.__capCheckpoint = checkpoint
    return window.__cap.subjects.map(seat => {
      const id = fight_entity_id(checkpoint, BigInt(seat))
      const p = scene?.project_entity(id)
      const f = checkpoint.contract.fighters[seat]
      return p && { x: p.x, y: p.y, h: scene.entity_height?.(id) ?? 1.8, cell: Number(f.cell) }
    })
  })
const shift_of = page => page.evaluate(() => window.__cap.shift || 0)
// screen box of the spell's area cells, sampled with the board's own cell picker
const area_box = page =>
  page.evaluate(() => {
    const area = new Set(window.__cap.area ?? [])
    const scene = window.__capScene
    if (!area.size || !scene?.pick_fight_cell) return null
    let box = null
    for (let y = 0; y < innerHeight; y += 10)
      for (let x = 0; x < innerWidth; x += 10) {
        const cell = scene.pick_fight_cell(x, y)
        if (cell === null || !area.has(Number(cell))) continue
        box = box ? { x0: Math.min(box.x0, x), x1: Math.max(box.x1, x), y0: Math.min(box.y0, y), y1: Math.max(box.y1, y) } : { x0: x, x1: x, y0: y, y1: y }
      }
    return box
  })
// select the spell and hover its target through FightLayer's own interaction reducer (no pointer)
const aim = (page, spell) =>
  page.evaluate(async ({ spell }) => {
    const S = await import('/src/store.ts')
    const fight = S.read_app_state().fight.checkpoint.contract.id
    let dispatch = null
    for (const el of document.querySelectorAll('*')) {
      const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
      for (let f = key && el[key], i = 0; f && i < 80 && !dispatch; f = f.return, i++)
        for (let h = f.memoizedState, j = 0; h && typeof h === 'object' && j < 80 && !dispatch; h = h.next, j++)
          if (h.queue?.lastRenderedReducer?.name === 'reduce_fight_interaction') dispatch = h.queue.dispatch
      if (dispatch) break
    }
    if (!dispatch) return false
    dispatch({ type: 'action', action: { type: 'spell', name: spell } })
    dispatch({ type: 'hover', hover: { fight, type: 'cell', cell: BigInt(window.__cap.goal) } })
    return true
  }, { spell })
// mob clips: paint the mob's aim, then re-render the fight screen once (a hover through its own reducer)
const aim_mob = page =>
  page.evaluate(async () => {
    const S = await import('/src/store.ts')
    globalThis.__capMobAim = window.__cap.mob_aim
    const fight = S.read_app_state().fight.checkpoint.contract.id
    for (const el of document.querySelectorAll('*')) {
      const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
      for (let f = key && el[key], i = 0; f && i < 80; f = f.return, i++)
        for (let h = f.memoizedState, j = 0; h && typeof h === 'object' && j < 80; h = h.next, j++)
          if (h.queue?.lastRenderedReducer?.name === 'reduce_fight_interaction') {
            h.queue.dispatch({ type: 'hover', hover: { fight, type: 'cell', cell: BigInt(window.__cap.goal) } })
            return true
          }
    }
    return false
  })
// Runs in the page: is a presentation (or a turn witness) still playing?
const busy = async () => {
  const f = (await import('/src/store.ts')).read_app_state().fight
  return Boolean(f && (f.presentations?.length > 0 || f.awaiting_turn_witness))
}
// Runs in the page: the character's hit on the mob a heal will go to; returns an error or null
const pre_hit = async () => {
  const S = await import('/src/store.ts')
  const { turn_seat, wound, pre_hit } = window.__cap
  const before = S.read_app_state().fight.checkpoint.contract.fighters.find(f => String(f.cell) === wound)?.hp
  S.dispatch_app({ type: 'fight/input', fight: null, origin: 'local', input: { type: 'cast_spell', fighter: BigInt(turn_seat), spell: pre_hit, target_cell: BigInt(wound) } })
  const f = S.read_app_state().fight
  const after = f.checkpoint.contract.fighters.find(x => String(x.cell) === wound)?.hp
  if (f.error) return `pre-hit refused: ${JSON.stringify(f.error, (k, v) => (typeof v === 'bigint' ? String(v) : v))}`
  return after < before ? null : 'pre-hit did not wound the mob'
}
// the anchors plus where a pushed/pulled target will end up (same screen line, `shift` × the gap)
const with_landing = (anchors, shift, s) => {
  if (!shift || anchors.length < 2) return anchors
  const [a, b] = grounded(anchors, s) // feet to feet: the move is along the ground
  return [...anchors, { ...b, x: b.x + (b.x - a.x) * shift, y: b.y + (b.fy - a.fy) * shift }]
}

// pixels per metre on screen, from two fighters a known number of cells apart (cell = 1.33 m)
let GRID_W = 20 // CONTRACT_CONSTANTS.grid_w, read back from the page
const scale_of = anchors => {
  const [a, b] = anchors
  const dx = (b.cell % GRID_W) - (a.cell % GRID_W),
    dy = Math.floor(b.cell / GRID_W) - Math.floor(a.cell / GRID_W)
  const k = 1.33 * Math.SQRT1_2
  // screen-x is free of the fighters' different heights (the anchors are head-tops); depth is not
  if (dx !== dy) return Math.abs(b.x - a.x) / (Math.abs(dx - dy) * k)
  // pure depth: Δhead = s × (Δdepth × sin 40° − Δheight × cos 40°)
  const per_metre = (dx + dy) * k * Math.sin((40 * Math.PI) / 180) - (b.h - a.h) * 0.766
  return Math.abs(per_metre) > 0.2 ? Math.abs((b.y - a.y) / per_metre) : 100
}
// head-top anchors -> feet too (vertical metres show at cos 40° on the fixed fight camera)
const grounded = (anchors, s) => anchors.map(p => ({ ...p, fy: p.y + p.h * 0.766 * s }))
// the --size-shaped window (padded by --pad) that holds every anchor's head (plus the rising number) down to its feet
const frame_of = (anchors, s, box = null) => {
  // the caster needs room for its weapon swing; the others for the number, which drifts sideways
  const up = 1.45 * s + 16,
    side = i => (i === 0 ? 0.9 : 1.25) * s,
    down = 0.55 * s
  const m = 0.35 * s // a little floor around the area
  const x0 = Math.min(...anchors.map((p, i) => p.x - side(i)), box ? box.x0 - m : Infinity),
    x1 = Math.max(...anchors.map((p, i) => p.x + side(i)), box ? box.x1 + m : -Infinity)
  const y0 = Math.min(...anchors.map(p => p.y), box ? box.y0 + up - m : Infinity) - up,
    y1 = Math.max(...grounded(anchors, s).map(p => p.fy), box ? box.y1 + m - down : -Infinity) + down
  let w = x1 - x0,
    h = y1 - y0
  if (w / h < W / H) w = (h * W) / H
  else h = (w * H) / W
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: w * PAD, h: h * PAD }
}

const wheel = (page, steps) =>
  page.evaluate(steps => {
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    for (let i = 0; i < Math.abs(steps); i++)
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: steps < 0 ? -100 : 100, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true, cancelable: true }))
  }, steps)
// the fight camera pans on a right-button drag
const pan = async (page, dx, dy) => {
  const x = VW / 2 - Math.sign(dx) * Math.min(Math.abs(dx), VW / 2 - 20) / 2,
    y = VH / 2 - Math.sign(dy) * Math.min(Math.abs(dy), VH / 2 - 20) / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + Math.max(-VW + 40, Math.min(VW - 40, dx)), y + Math.max(-VH + 40, Math.min(VH - 40, dy)), { steps: 12 })
  await page.mouse.up({ button: 'right' })
  await page.mouse.move(2, 2)
}

const open_contexts = new Set()
const record = async (cls, spell, rank) => {
  const started = Date.now()
  const plan = spell_plan(cls, spell, rank)
  const file = file_of(cls, spell, rank)
  let page, ctx, laid
  for (let attempt = 0; attempt < 8; attempt++) {
    ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 })
    open_contexts.add(ctx)
    page = await ctx.newPage()
    // seeded Math.random per clip (anything in the page that draws from it repeats run to run)
    await page.addInitScript(seed => {
      let a = seed >>> 0
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }, parseInt(fingerprint(cls, spell, rank).slice(0, 8), 16))
    await page.addInitScript(keep => {
      // overlay ids: movement-range/-path, spell-range/-targetable/-hover, team:<seat>, zone:<id>
      globalThis.__capOverlay = id => !id.startsWith('movement-') && (keep || !id.startsWith('team:'))
    }, KEEP_RINGS)
    await page.route('**/*', async route => {
      const url = route.request().url()
      if (!url.startsWith(ORIGIN)) return route.abort()
      if (!new URL(url).pathname.endsWith('/game/fight/fight_overlays.ts')) return route.continue()
      const res = await route.fetch()
      const body = (await res.text()).replace('export const project_fight_overlays =', 'const __cap_project_fight_overlays =')
      if (!body.includes('__cap_project_fight_overlays')) return route.fulfill({ response: res })
      return route.fulfill({
        response: res,
        // keep the aimed spell's range/targetable/area overlays up while its presentation plays
        // a mob's aim (globalThis.__capMobAim) is painted with the same three presets a player's aim uses
        body: `${body}\nlet __cap_spell = []\nconst __cap_mob_aim = (m) => {\n  const hit = new Set(m.area)\n  return [\n    { id: 'spell-range', blob: fight_blob_preset('spell_range', { cells: m.range.filter((c) => !hit.has(c)), origin_cell: m.origin }) },\n    { id: 'spell-targetable', blob: fight_blob_preset('spell_targetable', { cells: m.targetable.filter((c) => !hit.has(c)), origin_cell: m.origin }) },\n    { id: 'spell-hover', blob: fight_blob_preset('spell_hover', { cells: m.area, origin_cell: m.target }) },\n  ]\n}\nexport const project_fight_overlays = (args) => {\n  const all = __cap_project_fight_overlays(args)\n  const spell = all.filter((o) => o.id.startsWith('spell-'))\n  if (spell.length) __cap_spell = spell\n  const kept = all.filter((o) => globalThis.__capOverlay?.(o.id) ?? true)\n  if (globalThis.__capMobAim) return [...kept.filter((o) => !o.id.startsWith('spell-')), ...__cap_mob_aim(globalThis.__capMobAim)]\n  return args.presentation_active && globalThis.__capHold && !spell.length ? [...kept, ...__cap_spell] : kept\n}\n`,
      })
    })
    await page.goto(`${ORIGIN}/demo?quality=high#fight`, { timeout: 120000 })
    await page.waitForFunction(() => document.body.innerText.includes('START FIGHT') || document.body.innerText.includes('Start fight'), null, { timeout: 120000 })
    laid = await page.evaluate(setup, { cls: plan.mob ? TARGET_CLASS : cls, mob: MOB, plan, attempt, fs: src, spell, board_index: BOARD, board_count: BOARD_COUNT, pre_hit: PRE_HIT })
    if (laid.error) throw new Error(laid.error)
    GRID_W = laid.grid_w
    let turn = 'wait'
    for (let i = 0; i < 60 && turn !== 'ours'; i++) {
      turn = await page.evaluate(turn_state)
      if (turn !== 'ours') await page.waitForTimeout(500)
    }
    const why = turn === 'ours' ? await page.evaluate(targetable, { spell, fs: src }) : 'turn never came'
    if (!why) break
    laid.error = why
    await ctx.close()
  }
  if (laid.error) throw new Error(laid.error)
  // a mob heal: the character hits the mob it will go to, before the recording (and waits for that to play out)
  if (plan.wound) {
    const hurt = await page.evaluate(pre_hit)
    if (hurt) throw new Error(hurt)
    await page.waitForTimeout(800)
    for (let i = 0; i < 60 && (await page.evaluate(busy)); i++) await page.waitForTimeout(250)
  }

  await page.waitForTimeout(2500) // models, board reveal
  // a cold page (first clip of a run) can take longer to put every fighter on screen
  for (let i = 0; i < 30 && (await project(page)).some(p => !p); i++) await page.waitForTimeout(500)
  // game UI off (HUD, timeline, labels): only the WebGPU canvas stays visible
  await page.addStyleTag({ content: '*{visibility:hidden!important} canvas{visibility:visible!important}' })
  await page.mouse.move(2, 2)
  // centre, then zoom until the fighters' window fills ~80% of the viewport, then centre again
  const shift = await shift_of(page)
  let anchors = await project(page)
  let box = null
  const view = async () => {
    anchors = await project(page)
    box = await area_box(page)
    const s = scale_of(anchors)
    return { s, f: frame_of(with_landing(anchors, shift, s), s, box) }
  }
  const centre = async () => {
    for (let i = 0; i < 4; i++) {
      const { s, f } = await view()
      const dx = VW / 2 - f.cx,
        dy = VH / 2 - f.cy
      if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return
      const gain = 0.015 * s // content moves ~gain px per dragged px
      await pan(page, dx / gain, dy / gain)
      await page.waitForTimeout(250)
    }
  }
  await centre()
  for (let i = 0, stuck = 0; i < 40 && stuck < 3; i++) {
    const before = (await view()).f.w / VW
    if (before > 0.72 && before < 0.88) break
    await wheel(page, before < 0.72 ? -1 : 1)
    await page.waitForTimeout(150)
    const after = (await view()).f.w / VW
    stuck = Math.abs(after - before) < 0.002 ? stuck + 1 : 0 // at the zoom limit
    if (i % 5 === 4) await centre()
  }
  await centre()
  await page.mouse.move(2, 2)
  await page.waitForTimeout(300)
  anchors = await project(page)
  box = await area_box(page)
  // aim: the game paints the cast range, the targetable cells and the area under the hovered target
  if (!(await (plan.mob ? aim_mob(page) : aim(page, spell)))) throw new Error('could not select the spell on the fight screen')
  await page.evaluate(() => (globalThis.__capHold = true))
  await page.waitForTimeout(400)
  if (process.env.SPELLCAP_DEBUG) {
    await page.screenshot({ path: resolve(process.env.SPELLCAP_DEBUG, `${file}-view.png`) })
    console.log(JSON.stringify({ top: laid.top, centre: laid.centre, anchors, s: scale_of(anchors), frame: frame_of(with_landing(anchors, shift, scale_of(anchors)), scale_of(anchors), box), box, shift, grid_w: GRID_W }))
  }

  // record with Chrome's screencast, cast, keep recording until the number has faded
  const frames = resolve(tmpdir(), `spellcap-game-${process.pid}`)
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames)
  const shots = []
  const cdp = await ctx.newCDPSession(page)
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = resolve(frames, `${String(shots.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    shots.push({ file, t: metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: VW, maxHeight: VH })
  await page.waitForTimeout(PRE_ROLL * 1000 + 400)
  const hp_before = await page.evaluate(async () => (await import('/src/store.ts')).read_app_state().fight.checkpoint.contract.fighters.map(f => String(f.hp ?? '')))
  const t_cast = Date.now() / 1000
  const max_seconds = plan.mob ? MOB_MAX_SECONDS : MAX_SECONDS
  await page.evaluate(
    async ({ spell }) => {
      const S = await import('/src/store.ts')
      const { seat, goal, turn_seat } = window.__cap
      // a mob spell: the character ends its turn and the mob AI casts the only spell it has
      if (turn_seat !== undefined) S.dispatch_app({ type: 'fight/input', fight: null, origin: 'local', input: { type: 'end_turn', fighter: BigInt(turn_seat) } })
      else S.dispatch_app({ type: 'fight/input', fight: null, origin: 'local', input: { type: 'cast_spell', fighter: BigInt(seat), spell, target_cell: BigInt(goal) } })
    },
    { spell }
  )
  // the cue queue drains when the effect and its hit have played
  await page.waitForTimeout(600)
  for (let i = 0; i < 60; i++) {
    if (!(await page.evaluate(busy)) || Date.now() / 1000 - t_cast > max_seconds - TAIL) break
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(TAIL * 1000)
  const t_end = Math.min(Date.now() / 1000, t_cast + max_seconds)
  await cdp.send('Page.stopScreencast')
  const after = await project(page)
  const result = await page.evaluate(async () => {
    const f = (await import('/src/store.ts')).read_app_state().fight
    const fighters = (f.checkpoint ?? window.__capCheckpoint).contract.fighters
    // a mob that cast spent AP (refilled only at its next turn)
    const me = fighters[window.__cap.seat]
    const spent = me?.kind.type === 'mob' ? me.ap < me.kind.snapshot.ap : true
    return { hp: fighters.map(x => String(x.hp ?? '')), spent, error: f.error ? JSON.stringify(f.error, (k, v) => (typeof v === 'bigint' ? String(v) : v)) : null }
  })
  await ctx.close()
  if (result.error) throw new Error(`cast refused: ${result.error}`)
  if (!result.spent) throw new Error('the mob did not cast (its AI found no cast from where it stands)')

  // crop: the window around the fighters before and after the cast
  const s = scale_of(anchors)
  const f = frame_of([...anchors, ...after.filter(Boolean).slice(1)], s, box)
  // snapped to a coarse grid so sub-pixel differences in the measured anchors give the same crop
  const cw = Math.min(VW, Math.round(f.w / 32) * 32),
    ch = Math.min(VH, Math.round((cw * H) / W / 2) * 2)
  const crop_x = Math.floor(Math.max(0, Math.min(VW - cw, f.cx - cw / 2)) / 8) * 8,
    crop_y = Math.floor(Math.max(0, Math.min(VH - ch, f.cy - ch / 2)) / 8) * 8

  // variable-rate screencast frames, trimmed to [cast − pre-roll, end] -> constant fps clip
  const t0 = t_cast - PRE_ROLL
  const kept = shots.filter((x, i) => x.t >= t0 - 0.2 && x.t <= t_end && (shots[i + 1]?.t ?? Infinity) >= t0)
  const list = resolve(frames, 'list.txt')
  writeFileSync(list, kept.map((x, i) => `file '${x.file}'\nduration ${(Math.min(kept[i + 1]?.t ?? t_end, t_end) - Math.max(x.t, t0)).toFixed(4)}`).join('\n'))
  const seconds = Math.round((t_end - t0) * 10) / 10
  const base = resolve(out, file)
  mkdirSync(out, { recursive: true })
  const vf = `fps=${FPS},crop=${cw}:${ch}:${crop_x}:${crop_y},scale=${W}:${H}:flags=lanczos`
  // bit-exact muxing: no encoder/version tags, no creation time, no inherited metadata
  const ff = (...a) => {
    const target = a.pop()
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-t', String(seconds), ...a, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', target])
  }
  const sizes = {}
  if (formats.includes('mp4')) {
    ff('-vf', `${vf},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '27', '-x264-params', 'threads=1', '-bsf:v', 'filter_units=remove_types=6', '-movflags', '+faststart', '-an', `${base}.mp4`)
    sizes.mp4 = statSync(`${base}.mp4`).size
  }
  if (formats.includes('webp')) {
    ff('-vf', vf, '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '50', '-compression_level', '6', '-loop', '0', `${base}.webp`)
    sizes.webp = statSync(`${base}.webp`).size
  }
  if (formats.includes('gif')) {
    ff('-vf', `${vf},split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', `${base}.gif`)
    sizes.gif = statSync(`${base}.gif`).size
  }
  if (process.env.SPELLCAP_DEBUG) {
    const mid = kept.find(x => x.t >= t_cast + 1.5) ?? kept.at(-1)
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mid.file, '-vf', `drawbox=${crop_x}:${crop_y}:${cw}:${ch}:red:3`, resolve(process.env.SPELLCAP_DEBUG, `${file}-raw.png`)])
    console.log(JSON.stringify({ after }))
  }
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(meta_dir, { recursive: true })
  // class clips: mob = the foe; mob clips: mob = the caster, vs = the character's class
  const who = plan.mob ? { mob: plan.mob, vs: TARGET_CLASS } : { mob: MOB }
  const entry = { file, scene: 'game', ...who, target: plan.target, seconds, fps: FPS, size: [W, H], bytes: sizes, fp: fingerprint(cls, spell, rank), src: SRC }
  writeFileSync(resolve(meta_dir, `${file}.json`), JSON.stringify({ key: `${cls}/${spell}/${rank}`, entry }))
  rmSync(resolve(fail_dir, `${file}.json`), { force: true })
  const kb = Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join(', ')
  console.log(`${cls} · ${spell} r${rank} (${plan.target}, L${plan.char_level}): ${seconds} s, crop ${cw}x${ch}@${crop_x},${crop_y}, hp ${hp_before.join('/')} → ${result.hp.join('/')}, ${kb} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
}

const failed = []
let n = 0
// a failed clip must not leave its WebGPU page running (they pile up and starve the next clips)
const close_all = () => Promise.all([...open_contexts].map(c => c.close().catch(() => {}))).then(() => open_contexts.clear())
for (const [cls, spell, rank] of jobs) {
  try {
    await record(cls, spell, rank)
  } catch (error) {
    failed.push(`${cls}/${spell}/${rank}: ${error.message}`)
    console.error(`FAILED ${cls} · ${spell} r${rank}: ${error.message}`)
    mkdirSync(fail_dir, { recursive: true })
    writeFileSync(resolve(fail_dir, `${file_of(cls, spell, rank)}.json`), JSON.stringify({ key: `${cls}/${spell}/${rank}`, reason: error.message, fp: fingerprint(cls, spell, rank), src: SRC, at: new Date().toISOString() }))
  }
  await close_all()
  if (++n % 10 === 0) merge_index() // progress shows in index.json as the batch runs
}
merge_index()
await browser.close()
stop()
if (failed.length) console.error(`${failed.length}/${jobs.length} failed:\n  ${failed.join('\n  ')}`)
process.exit(failed.length === jobs.length ? 1 : 0)
