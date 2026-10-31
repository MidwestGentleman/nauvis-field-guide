// Re-render only the spell clips a game release changed, in parallel, then rebuild the manifest and
// contact sheets. Pulls nothing: it reads whatever the aresrpg-src checkout is at (git pull it first).
//
//   bun scripts/update-spell-clips.mjs                 # stale + missing clips, 3 workers, then sheets
//   bun scripts/update-spell-clips.mjs --dry-run       # list what is stale and why, render nothing
//   bun scripts/update-spell-clips.mjs --prune         # also delete clips of spells/ranks that no longer exist
//   options: [--workers 3] (max 4: one GPU) [--port 5211] [--src ../aresrpg-src] [--retry-failed]
//            [--class shugo,yogan] [--mobs crab,nook|all] [--family fuwa] [--no-sheets] [--sheets-only] [--logs DIR]
//   (no --class/--mobs/--family: every class spell and every mob spell)
//
// "Stale" = the clip's fingerprint (that rank's spell data, the spell's VFX row, the shared VFX sources,
// the mob, the render settings and SCRIPT_VERSION) differs from what render-spells-game.mjs computes now.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const flag = name => argv.includes(`--${name}`)
const WORKERS = Math.min(4, Math.max(1, Number(opt('workers', 3))))
const PORT = Number(opt('port', 5211))
const src = resolve(opt('src', resolve(here, '../../aresrpg-src')))
const out = resolve(here, '../assets/spells')
const logs = resolve(opt('logs', mkdtempSync(resolve(tmpdir(), 'spell-clips-'))))
mkdirSync(logs, { recursive: true })
const render = resolve(here, 'render-spells-game.mjs')
const pick = ['class', 'mobs', 'family'].flatMap(name => (opt(name) ? [`--${name}`, opt(name)] : []))
const common = ['--src', src, ...pick, ...(flag('retry-failed') ? ['--retry-failed'] : [])]
const run = (args, log) =>
  new Promise(done => {
    const child = spawn(process.execPath, [render, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    const sink = []
    const take = chunk => {
      sink.push(chunk)
      if (!log) process.stdout.write(chunk)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('exit', code => {
      if (log) writeFileSync(log, Buffer.concat(sink))
      done({ code, text: Buffer.concat(sink).toString() })
    })
  })

if (!flag('sheets-only')) {
  if (flag('prune')) await run(['--prune', ...(flag('dry-run') ? ['--dry-run'] : []), '--src', src])
  const plan = await run(['--changed', '--dry-run', ...common])
  const stale = Number(plan.text.match(/^(\d+) stale clips/m)?.[1] ?? 0)
  if (flag('dry-run')) process.exit(0)
  if (stale) {
    const workers = Math.min(WORKERS, stale)
    console.log(`rendering ${stale} clips with ${workers} workers; logs in ${logs}`)
    const started = Date.now()
    // workers start a little apart so their dev servers don't optimise dependencies at the same moment
    const results = await Promise.all(
      Array.from({ length: workers }, (_, i) =>
        new Promise(r => setTimeout(r, i * 20000)).then(() => run(['--changed', '--shard', `${i}/${workers}`, '--port', String(PORT + i), ...common], resolve(logs, `worker-${i}.log`)))
      )
    )
    const ok = results.reduce((t, r) => t + (r.text.match(/ s, crop /g) ?? []).length, 0)
    const failed = results.flatMap(r => r.text.split('\n').filter(l => l.startsWith('FAILED')))
    console.log(`rendered ${ok}, failed ${failed.length} in ${((Date.now() - started) / 60000).toFixed(1)} min`)
    for (const line of failed) console.log(`  ${line}`)
  }
  await run(['--merge', '--src', src])
}

// contact sheets: one frame ~0.8 s after the cast, rank 1 and rank 6 of every class spell (one per mob spell,
// grouped by family), 8 per row
if (!flag('no-sheets')) {
  const index = JSON.parse(readFileSync(resolve(out, 'index.json'), 'utf8'))
  const spells = JSON.parse(readFileSync(resolve(src, 'seed/content/spells.json'), 'utf8'))
  const mobs = JSON.parse(readFileSync(resolve(src, 'seed/content/mobs.json'), 'utf8'))
  const only_mobs = Boolean(opt('mobs') || opt('family'))
  const classes = only_mobs ? [] : (opt('class')?.split(',') ?? [...new Set(spells.map(s => s.classe))])
  // mob sheets: one per family, every spell of every mob in it (one rank each), keyed like the manifest
  const picked = opt('mobs') === 'all' || (!opt('class') && !only_mobs) ? mobs : mobs.filter(m => opt('mobs')?.split(',').includes(m.mob_type) || opt('family')?.split(',').includes(m.family))
  const families = opt('class') ? [] : [...new Set(picked.map(m => m.family))]
  const font = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(existsSync)
  const sheets = resolve(logs, 'sheets')
  mkdirSync(sheets, { recursive: true })
  const sheet_rows = [
    ...classes.map(cls => [cls, spells.filter(x => x.classe === cls).flatMap(s => [1, 6].map(rank => [`${cls}/${s.name}/${rank}`, `${s.name} r${rank}`]))]),
    ...families.map(f => [`mobs-${f}`, picked.filter(m => m.family === f).flatMap(m => m.spells.map(s => [`mob:${m.mob_type}/${s.name}/1`, `${m.name}: ${s.name}`]))]),
  ]
  for (const [cls, keys] of sheet_rows) {
    const work = mkdtempSync(resolve(tmpdir(), 'sheet-'))
    let n = 0
    for (const [key, name] of keys) {
      const entry = index[key]
      const clip = entry && resolve(out, `${entry.file}.mp4`)
      const label = resolve(work, `${n}.txt`)
      writeFileSync(label, `${name}${clip && existsSync(clip) ? '' : ' MISSING'}`)
      const text = font ? `,drawtext=fontfile=${font}:textfile=${label}:x=4:y=4:fontsize=13:fontcolor=white:box=1:boxcolor=black@0.6` : ''
      const input = clip && existsSync(clip) ? ['-ss', key.startsWith('mob:') ? '2.6' : '1.6', '-i', clip] : ['-f', 'lavfi', '-i', 'color=c=0x141414:s=240x135']
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-frames:v', '1', '-vf', `scale=240:135${text}`, resolve(work, `${String(n).padStart(3, '0')}.png`)])
      n++
      }
    const rows = Math.ceil(n / 8)
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', resolve(work, '%03d.png'), '-vf', `tile=8x${rows}:padding=2:color=0x141414`, '-frames:v', '1', resolve(sheets, `sheet-${cls}.png`)])
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`contact sheets: ${sheets}`)
}
