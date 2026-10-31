// Publish the site to Cloudflare (Workers static assets, project nauvis-field-guide). Copies only what the
// site serves (index.html, pages/, assets/) plus deploy/_headers into .dist/, then deploys .dist/ with
// deploy/wrangler.jsonc. data/, scripts/, docs/ and anything local never ship.
//
//   node scripts/deploy.mjs              # build .dist and deploy to production
//   node scripts/deploy.mjs --dry-run    # build .dist only, print what would ship
//   (first time: npx wrangler login)
import { spawnSync } from 'node:child_process'
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, '.dist')
const skip = src => basename(src) === '.DS_Store'

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist)
for (const path of ['index.html', 'pages', 'assets']) cpSync(resolve(root, path), resolve(dist, path), { recursive: true, filter: src => !skip(src) })
cpSync(resolve(root, 'deploy/_headers'), resolve(dist, '_headers'))

const files = []
const walk = dir => readdirSync(dir).forEach(name => (statSync(resolve(dir, name)).isDirectory() ? walk(resolve(dir, name)) : files.push(resolve(dir, name))))
walk(dist)
const bytes = files.reduce((t, f) => t + statSync(f).size, 0)
const big = files.filter(f => statSync(f).size > 25 * 1024 * 1024)
console.log(`${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in .dist`)
if (big.length || files.length > 20000) {
  console.error(`over the static asset limits (20,000 files, 25 MB each): ${big.join(', ') || files.length}`)
  process.exit(1)
}
if (process.argv.includes('--dry-run')) process.exit(0)

const run = spawnSync('npx', ['wrangler', 'deploy', '--config', resolve(root, 'deploy/wrangler.jsonc')], { cwd: resolve(root, 'deploy'), stdio: 'inherit' })
process.exit(run.status ?? 1)
