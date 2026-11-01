// Screenshots of the game's tournament window for pages/tournaments.html, taken from the game's own UI test
// page (packages/frontend/e2e/fixtures/tournament.html) with its mock events: no chain, no live game. The
// fixture pins the clock, so a re-run of the same game release gives the same pictures.
//
//   bun scripts/render-tournament-shots.mjs [--src ../aresrpg-src] [--port 5214] [--chrome PATH]
//
// Writes assets/scenes/tournament-registration.webp and assets/scenes/tournament-podium.webp.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const src = resolve(opt('src', resolve(here, '../../aresrpg-src')))
const PORT = Number(opt('port', 5214))
const out = resolve(here, '../assets/scenes')

const vite = spawn(resolve(src, 'packages/frontend/node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: resolve(src, 'packages/frontend'),
  stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('vite did not start')), 60000)
  vite.stdout.on('data', chunk => String(chunk).includes(`127.0.0.1:${PORT}`) && (clearTimeout(timer), ok()))
  vite.on('exit', code => fail(new Error(`vite exited ${code}`)))
})
process.on('exit', () => vite.kill('SIGTERM'))

// the game's Playwright, with the newest cached headless shell if its own browser isn't downloaded
const { chromium } = createRequire(resolve(src, 'package.json'))('@playwright/test')
const cache = resolve(process.env.HOME, 'Library/Caches/ms-playwright')
const cached = () => {
  try {
    const dir = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort((a, b) => b.split('-')[1] - a.split('-')[1])[0]
    const bin = dir && readdirSync(resolve(cache, dir)).find(d => d.startsWith('chrome-headless-shell'))
    return bin ? resolve(cache, dir, bin, 'chrome-headless-shell') : undefined
  } catch {
    return undefined
  }
}
const executablePath = opt('chrome') ?? (existsSync(chromium.executablePath()) ? undefined : cached())
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
const base = `http://127.0.0.1:${PORT}/e2e/fixtures/tournament.html`
const work = mkdtempSync(resolve(tmpdir(), 'tourney-'))
const save = async name => {
  await page.waitForTimeout(800)
  const png = resolve(work, `${name}.png`)
  await page.screenshot({ path: png })
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-vf', 'scale=1600:-1', '-c:v', 'libwebp', '-quality', '82', resolve(out, `${name}.webp`)])
  console.log(`assets/scenes/${name}.webp`)
}

// an event open for registration: teams, open seats, scheduled start and prize pool
await page.goto(base)
await page.locator('.tourney-panel').waitFor()
await save('tournament-registration')

// a finished event: open its results card, then bring the 1st–3rd pedestals into view
await page.goto(`${base}?hud&scenario=finished`)
await page.locator('.tourney-results-card').click()
await page.locator('.tourney-pedestal.is-place-1').waitFor()
await page.locator('.tourney-pedestal.is-place-1').evaluate(e => e.scrollIntoView({ block: 'center' }))
await save('tournament-podium')

rmSync(work, { recursive: true, force: true })
await browser.close()
process.exit(0)
