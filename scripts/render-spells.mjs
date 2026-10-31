// Records a short looping clip of a class spell with the game's own spell-effect shader.
//
//   bun scripts/render-spells.mjs --class shugo --spell "Natural Attack"
//   bun scripts/render-spells.mjs --class iyashi                 # all 20 spells of one class
//   bun scripts/render-spells.mjs --all                          # all 240
//   options: [--src ../aresrpg-src] [--size 320x180] [--fps 15] [--format webp|mp4|gif|all]
//
// Needs a local clone of aresrpg/aresrpg with its dependencies installed (Playwright and its
// Chromium come from that clone) and ffmpeg with libwebp/libx264. Fully offline: every network
// request is blocked.
//
// The game's spell visuals are authored in one self-contained WebGL page,
// seed/content/spell_effects/source.html; scripts/generate_spell_effects.mjs compiles that same
// shader and timeline into the in-game effect layer. This script opens that page in headless
// Chromium, freezes its clock (the page's own ?c=&s=&t= controls), steps it frame by frame, and
// encodes the frames. What you see is the real effect for that exact spell (element palette,
// path, area, push, steal, buff, trap, seed), staged on the page's own caster and target figures
// on a plain floor, not on the game's character models or a fight board.
// Output: assets/spells/stage/<class>-<spell-slug>.<ext> and assets/spells/stage/index.json.
// For footage in the real game client (character and mob models on a fight board) use
// render-spells-game.mjs, which writes assets/spells/<class>-<spell-slug>.<ext>.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const src = resolve(opt('src', resolve(here, '../../aresrpg-src')))
const out = resolve(here, '../assets/spells/stage')
const [W, H] = opt('size', '320x240').split('x').map(Number)
// The page's camera is fixed and composes a 16:9 stage (caster left of centre, target right of it).
// Narrower sizes keep the full height and crop the sides: 4:3 still holds the caster and target of
// nearly every spell; only a few long pushes (target ends past 4 cells right of centre) slide partly out.
const RW = Math.max(W, Math.round((H * 16) / 9))
const FPS = Number(opt('fps', 15))
const SS = 2 // render at 2x, downscale for clean edges
const formats = (f => (f === 'all' ? ['webp', 'mp4', 'gif'] : f.split(',')))(opt('format', 'webp,mp4'))
const page_file = resolve(src, 'seed/content/spell_effects/source.html')
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const { create_source } = await import(`${src}/packages/engine/src/generated/claude_spell_source.js`)
const source = create_source()
const HOLD = 3.2 // source.html: the effect stays this long after impact, then the cycle restarts

const wanted_class = opt('class'),
  wanted_spell = opt('spell')
const jobs = Object.entries(source.catalog).flatMap(([cls, rows]) =>
  rows.map((row, index) => ({ cls, index, name: row.name }))
).filter(job => argv.includes('--all') || (job.cls === wanted_class && (!wanted_spell || job.name === wanted_spell)))
if (!jobs.length) {
  console.error('No spell matches. Classes:', Object.keys(source.catalog).join(', '))
  process.exit(1)
}

const require = createRequire(resolve(src, 'package.json'))
const { chromium } = require('@playwright/test')
// Playwright's own Chromium if installed, else the newest headless shell already in its cache, or --chrome <path>
const cache = resolve(process.env.HOME, 'Library/Caches/ms-playwright')
const cached = () => {
  try {
    const dir = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort((a, b) => b.split('-')[1] - a.split('-')[1])[0]
    const bin = dir && readdirSync(resolve(cache, dir)).find(d => d.startsWith('chrome-headless-shell'))
    return bin ? resolve(cache, dir, bin, 'chrome-headless-shell') : undefined
  } catch { return undefined }
}
const executablePath = opt('chrome') ?? (existsSync(chromium.executablePath()) ? undefined : cached())
// --gl swiftshader forces the CPU rasteriser (portable, ~1 s a frame); default lets ANGLE use the GPU
const gl_args = opt('gl', 'gpu') === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
const browser = await chromium.launch({ executablePath, args: gl_args })
const page = await browser.newPage({ viewport: { width: RW * SS + 40, height: H * SS + 40 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
// Assemble the page as the game's generator expects it: the art sheets and synth the shader samples
// are spliced in at the /*NAME*/ markers. Audio stays off, so the Dofus recordings are left empty.
const data_url = file => `data:image/webp;base64,${readFileSync(resolve(src, 'seed/icons/spell_effects', file)).toString('base64')}`
const html = readFileSync(page_file, 'utf8')
  .replace('/*SYNTH*/', () => readFileSync(resolve(src, 'seed/content/spell_effects/synth.js'), 'utf8'))
  .replace('/*DOFUS*/', 'const DOFUS = {};')
  .replace('/*SWORDS*/', () => `const SWORDS = '${data_url('swords.webp')}';`)
  .replace('/*ICONS*/', () => `const ICONS = '${data_url('tomoda.webp')}';`)
  .replace('/*ROJIN*/', () => `const ROJIN_ART = '${data_url('rojin.webp')}';`)
  .replace('/*PROPS*/', () => `const PROPS = '${data_url('props.webp')}';`)
const ORIGIN = 'http://spellcap.invalid/'
// nothing leaves the machine: the page itself is served from memory, every other request is refused
await page.route('**/*', route =>
  route.request().url().startsWith(ORIGIN) ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort()
)
mkdirSync(out, { recursive: true })
const index_file = resolve(out, 'index.json')
const index = existsSync(index_file) ? JSON.parse(readFileSync(index_file, 'utf8')) : {}

for (const job of jobs) {
  const started = Date.now()
  // the page's draw() sizes the canvas from clientWidth × min(devicePixelRatio, 1.25)
  const row = source.select(job.cls, job.name)
  const land = row.cast + row.fly + (row.trap ? source.trap_wait : 0)
  const length = land + HOLD
  await page.goto(`${ORIGIN}source.html?c=${job.cls}&s=${job.index}&t=0`)
  await page.addStyleTag({
    content: `body{margin:0;padding:0;background:#000} main{max-width:none;gap:0} main>:not(.stage){display:none!important}
      .hud{display:none} .stage{border:0} #stage{width:${RW * SS}px;height:${H * SS}px;aspect-ratio:auto}`,
  })
  const failed = await page.locator('.err').count()
  if (failed) throw new Error(await page.locator('.err').innerText())
  const frames = resolve(tmpdir(), `spellcap-${process.pid}`)
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames)
  const count = Math.round(length * FPS)
  const canvas = page.locator('#stage')
  for (let i = 0; i < count; i++) {
    // state is the page's own clock; it stays paused because ?t= was given
    await page.evaluate(t => new Promise(done => {
      state.clock = t
      requestAnimationFrame(() => requestAnimationFrame(done))
    }), i / FPS)
    await canvas.screenshot({ path: resolve(frames, `${String(i).padStart(4, '0')}.png`) })
  }
  const base = resolve(out, `${job.cls}-${slug(job.name)}`)
  // the caster stands at about 14% of the stage width and most targets end by 80%: hold the window 6% in
  const scale = `crop=w=iw*${W / RW}:h=ih:x=iw*${Math.min(0.06, 1 - W / RW)},scale=${W}:${H}:flags=lanczos`
  const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', resolve(frames, '%04d.png'), ...a])
  const sizes = {}
  if (formats.includes('webp')) {
    ff('-vf', scale, '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '70', '-compression_level', '6', '-loop', '0', `${base}.webp`)
    sizes.webp = statSync(`${base}.webp`).size
  }
  if (formats.includes('mp4')) {
    ff('-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '26', '-movflags', '+faststart', '-an', `${base}.mp4`)
    sizes.mp4 = statSync(`${base}.mp4`).size
  }
  if (formats.includes('gif')) {
    ff('-vf', `${scale},split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', `${base}.gif`)
    sizes.gif = statSync(`${base}.gif`).size
  }
  rmSync(frames, { recursive: true, force: true })
  index[`${job.cls}/${job.name}`] = { file: `${job.cls}-${slug(job.name)}`, seconds: +length.toFixed(2), fps: FPS, size: [W, H], bytes: sizes }
  const kb = Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join(', ')
  console.log(`${job.cls} · ${job.name}: ${count} frames, ${length.toFixed(2)} s, ${kb} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
}
writeFileSync(index_file, JSON.stringify(index, null, 2))
await browser.close()
