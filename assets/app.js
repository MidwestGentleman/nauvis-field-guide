// Nauvis Field Guide: hash router, sidebar, data pages, widgets and search. No build step.
const { list, el, cube } = window.Effects
let SPELL_CLIPS = null // assets/spells/index.json, filled by scripts/render-spells-game.mjs

const OFFICIAL = 'https://aresrpg.world/encyclopedia'
const NAV = [
  {
    group: 'Start here',
    steps: true,
    pages: [
      ['welcome', 'What AresRPG is'],
      ['account', 'Wallet, login and gas'],
      ['character', 'Create your character'],
      ['first-hour', 'Your first hour'],
      ['jobs', 'Gathering, jobs and crafting'],
      ['fights', 'Your first fights'],
      ['first-dungeon', 'Your first dungeon'],
    ],
  },
  {
    group: 'The world',
    pages: [
      ['map', 'Map and biomes'],
      ['regions', 'Regional spawn rules'],
      ['encounters', 'How you meet mobs'],
      ['bestiary', 'Bestiary'],
      ['dungeons', 'Dungeons and keys'],
    ],
  },
  { group: 'Classes', pages: [['classes', 'Choosing a class']], classes: true },
  {
    group: 'Crafting and trade',
    pages: [
      ['items', 'Item finder'],
      ['recipes', 'Recipe list'],
      ['recipe-map', 'Recipe map'],
      ['craft-with', 'What can I craft with…'],
      ['planner', 'Craft planner'],
      ['market', 'Marketplace and trading'],
    ],
  },
  {
    group: 'Reference',
    pages: [
      ['features', 'Controls and handy features'],
      ['combat', 'Stats, elements and damage'],
      ['faq', 'Beginner FAQ'],
      ['glossary', 'Glossary'],
      ['data', 'How this site stays current'],
      ['about', 'About this guide'],
    ],
  },
]
const DATA_PAGES = new Set(['bestiary', 'items', 'recipes', 'recipe-map', 'craft-with', 'planner'])
const FLAT = NAV.flatMap(g => g.pages.map(([slug, title]) => ({ slug, title, group: g.group })))

const $ = sel => document.querySelector(sel)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const titleCase = s => String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

let G = null // data/game.json
const fragments = new Map()

/* ---------- lookups ---------- */
const item = id => G.items[id] ?? { name: titleCase(id), category: 'unknown', level: null }
const mob = id => G.mobs.find(m => m.id === id)
const cls = id => G.classes.find(c => c.id === id)
const CITY = { thebes: 'Thebes', the_ruins: 'The Ruins', fuwage: 'Fuwage' }
const cityName = id => CITY[id] ?? titleCase(id)
const biomeName = id => titleCase(id)
/* ---------- game art ----------
   The game's own icons and screenshots, loaded from the official repository at the same release
   as the data. None of them are copied into this site (see pages/data.html#licence). */
let artRef = 'edge' // set in boot: the release the data came from, or the latest release for a local cache
const artRoot = () => `https://raw.githubusercontent.com/aresrpg/aresrpg/${artRef}/`
const spellFile = (classe, name) =>
  `${classe}_${name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
const ART = {
  item: id => `seed/icons/items/${id}.png`,
  itemhd: id => `seed/icons/items/${id}_hd.png`,
  mob: id => `seed/icons/mobs/${id}.png`,
  spell: (c, n) => `seed/icons/spells/${spellFile(c, n)}.webp`,
  portrait: (c, sex = 'female') => `seed/icons/characters/${c}_${sex}.png`,
  world: id => `packages/frontend/src/assets/worlds/${id}.webp`,
  scene: id => `seed/icons/loading/${id}.webp`,
  currency: id => `seed/icons/currency/${id}.png`,
  ui: id => `packages/ui/src/assets/${id}.png`,
}
const artUrl = (kind, ...args) => artRoot() + ART[kind](...args)
// Decorative next to a visible name, so alt is empty unless the picture stands alone.
const pic = (kind, args, cls, alt = '') =>
  `<img class="art ${cls}" src="${artUrl(kind, ...args)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.remove()">`
// Sui's droplet logo, the same path the game draws (packages/ui/src/sui.ts).
const suiLogo = () => `<svg class="wc-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.636 10.009a7.16 7.16 0 0 1 1.565 4.474 7.2 7.2 0 0 1-1.608 4.53l-.087.106-.023-.135a7 7 0 0 0-.07-.349c-.502-2.21-2.142-4.106-4.84-5.642-1.823-1.034-2.866-2.278-3.14-3.693-.177-.915-.046-1.834.209-2.62.254-.787.631-1.446.953-1.843l1.05-1.284a.46.46 0 0 1 .713 0l5.28 6.456zm1.66-1.283L12.26.123a.336.336 0 0 0-.52 0L4.704 8.726l-.023.029a9.33 9.33 0 0 0-2.07 5.872C2.612 19.803 6.816 24 12 24s9.388-4.197 9.388-9.373a9.32 9.32 0 0 0-2.07-5.871zM6.389 9.981l.63-.77.018.142q.023.17.055.34c.408 2.136 1.862 3.917 4.294 5.297 2.114 1.203 3.345 2.586 3.7 4.103a5.3 5.3 0 0 1 .109 1.801l-.004.034-.03.014A7.2 7.2 0 0 1 12 21.67c-3.976 0-7.2-3.218-7.2-7.188 0-1.705.594-3.27 1.587-4.503z"/></svg>`
// A few lucide icons (ISC), as the game's windows draw them.
const LUCIDE = {
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  bank: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  out: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>',
}
// Made-up address for the wallet pictures: sha256 of a phrase, so nobody holds its key.
const EXAMPLE_ADDRESS = '0x343cf56a41ddfb838204eaab9a32f603f39dd22995e9a8676642bfd98616911c'
const lucide = (name, cls = '') =>
  `<svg class="lucide ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name]}</svg>`
const artName = (kind, id) => (kind === 'mob' ? mob(id)?.name : kind.startsWith('item') ? item(id).name : null) ?? titleCase(id)
const artHref = (kind, id) => (kind === 'mob' ? `#/mob/${id}` : kind.startsWith('item') ? `#/item/${id}` : null)

const itemLink = id => `<a class="ilink" href="#/item/${encodeURIComponent(id)}">${pic('item', [id], 'ico')}${esc(item(id).name)}</a>`
const mobLink = id => `<a class="ilink" href="#/mob/${encodeURIComponent(id)}">${pic('mob', [id], 'ico mob')}${esc(mob(id)?.name ?? titleCase(id))}</a>`
const biomeChip = b => `<a class="biome-chip b-${b}" href="#/map#biome-${b}">${esc(biomeName(b))}</a>`
const official = (kind, id, text = 'Open in the official encyclopedia') =>
  `<a href="${OFFICIAL}/${kind}/${encodeURIComponent(id)}" target="_blank" rel="noopener" title="Opens inside the game, which loads its world first">${text}</a>`
const elTag = e => (e ? el(e) : '<span class="el el-neutral">neutral</span>')
// head: 'Label' | ['Label', 'num'] | ['Label', '', false] (not sortable). A row is an array of cells
// (html or [html, 'num']) or { cells, attrs }. opts: sortable, stack (cards under 560px), bodyId.
const tableRow = r => {
  const { cells, attrs = '' } = Array.isArray(r) ? { cells: r } : r
  return `<tr${attrs ? ` ${attrs}` : ''}>${cells.map(c => (Array.isArray(c) ? `<td class="${c[1]}">${c[0]}</td>` : `<td>${c}</td>`)).join('')}</tr>`
}
const table = (head, rows, opts = {}) =>
  `<div class="table-wrap${opts.stack ? ' stack-wrap' : ''}"><table${opts.stack ? ' class="stack"' : ''}${opts.sortable ? ' data-sortable' : ''}><thead><tr>${head
    .map(h => {
      const [label, cls = '', sort = true] = Array.isArray(h) ? h : [h]
      return `<th class="${cls}"${opts.sortable && sort ? ' data-sort' : ''}>${label}</th>`
    })
    .join('')}</tr></thead><tbody${opts.bodyId ? ` id="${opts.bodyId}"` : ''}>${rows.map(tableRow).join('')}</tbody></table></div>`

// Stacked tables label each cell from its column header; call again after redrawing a tbody.
const labelCells = root =>
  (root.closest('table') ? [root.closest('table')] : [...root.querySelectorAll('table')]).forEach(t => {
    const heads = [...(t.tHead?.rows[0]?.cells ?? [])].map(th => th.textContent.trim())
    for (const tr of t.tBodies[0]?.rows ?? []) for (const td of tr.cells) if (td.colSpan === 1) td.dataset.label = heads[td.cellIndex] ?? ''
  })
// Scrollable tables fade at the edge that has more to see.
const fadeEdges = w => {
  const max = w.scrollWidth - w.clientWidth
  w.classList.toggle('fade-r', max > 1 && w.scrollLeft < max - 1)
  w.classList.toggle('fade-l', max > 1 && w.scrollLeft > 1)
}
const enhanceTables = root => {
  labelCells(root)
  root.querySelectorAll('.table-wrap').forEach(w => {
    if (w.dataset.fade) return fadeEdges(w)
    w.dataset.fade = 1
    w.addEventListener('scroll', () => fadeEdges(w), { passive: true })
    new ResizeObserver(() => fadeEdges(w)).observe(w.querySelector('table') ?? w)
    fadeEdges(w)
  })
}
const spawnsOf = mobId =>
  G.worlds.flatMap(w => w.mobs.filter(m => m.mob_type === mobId).map(m => ({ world: w.id, ...m })))
const resourceSpawns = itemId =>
  G.worlds.flatMap(w => w.resources.filter(r => r.item_type === itemId).map(r => ({ world: w.id, ...r })))
const dropsOf = itemId =>
  G.mobs.flatMap(m => m.loot.filter(l => l.item_type === itemId).map(l => ({ mob: m, ...l })))
const recipeOf = itemId => G.recipes.find(r => r.output_type === itemId)
const usedIn = itemId => G.recipes.filter(r => itemId in r.inputs)
// Crafting rules (job_xp.move): distinct ingredients set the job level needed (2→1, 3→10, 4→20,
// 5→40, 6→60, 7→80, 8→100); success = 50% + 0.5% per job level above 1, max 99%. A failed
// attempt still burns its ingredients (crafting.move).
const CRAFT_LEVEL = [1, 1, 1, 10, 20, 40, 60, 80, 100]
const craftLevel = r => CRAFT_LEVEL[Math.min(Object.keys(r.inputs).length, 8)]
const craftSuccess = level => Math.min(99, Math.floor(50 + (Math.max(1, level) - 1) / 2))
// "3× Water" lists with the counts in their own right-aligned column (recipes, dungeon rooms).
const countList = (entries, link) => `<ul class="ing">${entries.map(([k, n]) => `<li><span class="ing-n">${n}×</span>${link(k)}</li>`).join('')}</ul>`
// Unbulleted list of links with <small> notes, for table cells and short link lists.
const cellList = (xs, cls = '') => (xs.length ? `<ul class="cell-list ${cls}">${xs.map(x => `<li>${x}</li>`).join('')}</ul>` : '—')
const ingredientList = r => countList(Object.entries(r.inputs), itemLink)
const dungeonsWith = mobId => G.dungeons.filter(d => d.rooms.some(r => r.some(m => m.mob_type === mobId)))
const gatherOf = id => G.gatherables?.[id] ?? null
const rareParent = id => Object.values(G.gatherables ?? {}).find(g => g.rare === id) ?? null
const guardOf = mobId => Object.values(G.gatherables ?? {}).find(g => g.protector === mobId) ?? null
const jobName = job => titleCase(job.toLowerCase())
// Gathering odds from the gathering contract: a guardian ambushes 2% of gathers, a rare variant drops on 0.1%.
const AMBUSH = '2%'
const RARE = '0.1%'
const contentsOf = id => G.items[id]?.contents?.map(c => `${c.amount} × ${itemLink(c.item_type)}`).join(', ')
// Zone search: every member of a normal pack has a 1% chance to be swapped for its family's archimob (zone_math.move).
const ARCHI = '1%'
const archiFor = mobId => {
  const m = mob(mobId)
  return m?.role === 'normal' ? G.mobs.find(x => x.role === 'archi' && x.family === m.family) ?? null : null
}
const archiStandIns = archiId => G.mobs.filter(x => x.role === 'normal' && archiFor(x.id)?.id === archiId && spawnsOf(x.id).length)
const orList = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}` : xs[0] ?? '')
// How you meet a mob: short label for tables, plus where.
const encounterOf = mobId => {
  const m = mob(mobId)
  const g = guardOf(mobId)
  const dz = dungeonsWith(mobId)
  const dungeon = dz.length ? `dungeon: ${dz.map(d => `<a href="#/dungeons#${d.dungeon}">${titleCase(d.dungeon)}</a>`).join(', ')}` : ''
  if (g) return { how: `${AMBUSH} per gather`, where: `ambushes ${itemLink(g.item_type)} gatherers (${jobName(g.job)} ${g.level}+)` }
  if (m?.role === 'archi') {
    const ins = archiStandIns(mobId)
    return { how: `${ARCHI} per member`, where: ins.length ? `swaps in for ${orList(ins.map(x => mobLink(x.id)))} in a pack` : '—' }
  }
  const s = spawnsOf(mobId)
  if (s.length) return { how: 'pack spawn', where: s.map(where).join('; ') }
  return { how: dz.length ? 'dungeon room' : '—', where: dungeon || '—' }
}
const guardianHtml = g => {
  const p = mob(g.protector)
  if (!p) return ''
  const weak = Object.entries(p.res).filter(([, v]) => v < 0)
  const drops = p.loot.map(l => `${itemLink(l.item_type)}${contentsOf(l.item_type) ? ` (opens into ${contentsOf(l.item_type)})` : ''}`).join(', ')
  return `<h2 id="guardian">Guardian</h2>
    <a class="boss-card" href="#/mob/${p.id}">${pic('mob', [p.id], 'boss-art')}<span><small>Guards ${esc(G.items[g.item_type].name)}</small><b>${esc(p.name)}</b></span></a>
    <p>Every ${esc(G.items[g.item_type].name)} node is guarded by ${mobLink(p.id)}, a level ${p.lvl[0]}–${p.lvl[1]} ${elTag(p.element)} protector. Each gather has a ${AMBUSH} chance that it ambushes you in a solo fight. You keep what you gathered either way, but you can't walk off: your character stays rooted until the fight is played, and starts it with the HP it had when it gathered.</p>
    <p>It resists ${titleCase(p.element)} most${weak.length ? ` and is weak to ${weak.map(([e]) => titleCase(e)).join(' and ')}` : ' and has no weakness, so hit it with any other element'}. ${drops ? `Beating it drops ${drops}.` : ''}</p>`
}
const pct = bp => `${+(bp / 100).toFixed(2)}%`

// Outside cities a row spawns by biome; inside a city area only that city's rows spawn.
const where = s => {
  const cities = (s.cities ?? []).map(c => `<b>${cityName(c)}</b>`).join(', ')
  const biomes = (s.biomes ?? []).map(biomeChip).join(' ')
  const world = s.world !== 'nauvis' ? ` (${titleCase(s.world)})` : ''
  const the = /^<b>The /.test(cities) ? '' : 'the '
  if (biomes && cities) return `${biomes} anywhere, plus ${the}${cities} city area${world}`
  if (cities) return `only ${the}${cities} city area${world}`
  return `${biomes}${world}`
}

// A class's elements = the elements its damage spells use, weighted by count.
const classElements = c => {
  const tally = {}
  for (const s of c.spells)
    for (const f of s.levels[0].fx)
      if ([0, 1, 3, 6].includes(f.kind) && f.element && f.target_filter !== 4) tally[f.element] = (tally[f.element] ?? 0) + 1
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([e, n]) => ({ e, n }))
}

/* ---------- widgets (placeholders inside the hand-written pages) ---------- */
const WIDGETS = {
  'class-grid': () =>
    `<div class="class-grid">${G.classes
      .map(c => {
        const els = classElements(c).slice(0, 3)
        return `<a class="class-card" href="#/class/${c.id}">${pic('portrait', [c.id], 'portrait')}<span class="stack">${els.map(x => `<span class="el-${x.e}">${cube()}</span>`).join('')}</span><b>${titleCase(c.id)}</b><span>${esc(c.title ?? '')}</span></a>`
      })
      .join('')}</div>`,
  // Every class at a glance: both portraits, a summary, its damaging spells split by element, the level-1 spells.
  'class-overview': () =>
    `<div class="class-overview">${G.classes
      .map(c => {
        const name = titleCase(c.id)
        const split = spellSplit(c).filter(([e]) => e !== 'none')
        return `<article class="co-card">
          <a class="co-pics" href="#/class/${c.id}" aria-label="${name}">${pic('portrait', [c.id, 'female'], 'portrait', `${name}, female`)}${pic('portrait', [c.id, 'male'], 'portrait', `${name}, male`)}</a>
          <h3><a href="#/class/${c.id}">${name}</a> <span>${esc(c.title ?? '')}</span></h3>
          <p class="co-sum">${CLASS_SUMMARY[c.id] ?? ''}</p>
          <div class="co-split">
            <div class="co-bar" role="img" aria-label="Damaging spells by element: ${split.map(([e, n]) => `${n} ${e}`).join(', ')}">${split.map(([e, n]) => `<span class="el-${e}" style="flex:${n}"></span>`).join('')}</div>
            <p>${split.map(([e, n]) => `<span>${el(e)}<b>${n}</b></span>`).join('')}</p>
          </div>
          <p class="co-start"><small>Starts with</small>${c.spells
            .filter(sp => sp.unlock <= 1)
            .map(sp => `<span>${pic('spell', [c.id, sp.name], 'ico')}${esc(sp.name)}</span>`)
            .join('')}</p>
          <a class="co-more" href="#/class/${c.id}">All 20 spells</a>
        </article>`
      })
      .join('')}</div>`,
  'class-compare': () =>
    table(
      ['Class', 'Role', 'Damage elements (spells per element)', ['Spells at level 1', 'num']],
      G.classes.map(c => [
        `<a class="ilink" href="#/class/${c.id}">${pic('portrait', [c.id], 'ico mob')}${titleCase(c.id)}</a>`,
        esc(c.title ?? ''),
        classElements(c)
          .map(x => `${el(x.e)} ${x.n}`)
          .join(' &nbsp;') || '—',
        [c.spells.filter(s => s.unlock <= 1).length, 'num'],
      ]),
      { sortable: true, stack: true }
    ),
  'biome-grid': (worldId = 'nauvis') => {
    const w = G.worlds.find(x => x.id === worldId)
    const s = w.biome_slots
    const rows = ['low', 'mid', 'high']
    return `<div class="biome-grid" role="table" aria-label="${titleCase(worldId)} climate slots">
      <div class="axis"></div>${rows.map(r => `<div class="axis">${WET[r]}</div>`).join('')}
      ${rows
        .map(
          t =>
            `<div class="axis">${HEAT[t]}</div>${rows
              .map(h => `<a class="biome-tile b-${s[`${t}_${h}`]}" href="#/map#biome-${s[`${t}_${h}`]}">${biomeName(s[`${t}_${h}`])}</a>`)
              .join('')}`
        )
        .join('')}
    </div>`
  },
  // The zones from -3 to 3 around the world centre over scripts/render-zone-grid.mjs's terrain render.
  // Labels follow the world map: the zone holding the world centre is 0, 0, x grows east and z grows south.
  'zone-grid': () => {
    const SPAN = 3
    const N = SPAN * 2 + 1
    const ORIGIN = Math.floor(50000 / 512)
    const zone = chain => Math.floor(chain / 512) - ORIGIN
    const at = v => `${((v + SPAN) / N) * 100}%` // zone units → percent of the picture
    const cells = []
    for (let z = -SPAN; z <= SPAN; z++) for (let x = -SPAN; x <= SPAN; x++) cells.push(`<span class="zg-cell${x === 0 && z === 0 ? ' origin' : ''}">${x}, ${z}</span>`)
    const cities = G.worlds
      .find(w => w.id === 'nauvis')
      .cities.map(c => ({ c, x: zone(c.x) - 1, z: zone(c.z) - 1 }))
      .filter(({ x, z }) => x >= -SPAN && x + 3 <= SPAN + 1 && z >= -SPAN && z + 3 <= SPAN + 1)
      .map(({ c, x, z }) => `<span class="zg-city" style="left:${at(x)};top:${at(z)};width:${(3 / N) * 100}%;height:${(3 / N) * 100}%"><b>${cityName(c.id)}</b></span>`)
    const gate = (50000 % 512) / 512 // the Star Gate's offset inside zone 0, 0
    return `<figure class="zone-grid">
      <div class="zg-map"><img src="assets/minimap/zone-grid.webp" alt="Terrain of the 49 zones from -3, -3 to 3, 3, with Thebes east of the centre" width="896" height="896" loading="lazy">
        <div class="zg-cells" style="--n:${N}">${cells.join('')}</div>${cities.join('')}
        <span class="zg-gate" style="left:${at(gate)};top:${at(gate)}" title="Star Gate">Star Gate</span></div>
      <figcaption>The 49 zones from −3, −3 to 3, 3, drawn with the game's own map painter. North is up, x grows to the east and z to the south. Each square is one 512-block zone; the gold box is the Thebes city area (3 × 3 zones).</figcaption>
    </figure>`
  },
  // Renders made with the game's engine by scripts/render-minimaps.mjs: one minimap view per biome.
  'minimap-gallery': (worldId = 'nauvis') =>
    `<div class="minimap-gallery">${G.worlds
      .find(x => x.id === worldId)
      .biomes.map(
        b =>
          `<a class="minimap-card" href="#/map#biome-${b}"><img src="assets/minimap/${worldId}-${b}.png" alt="${biomeName(b)} on the minimap" width="288" height="288" loading="lazy" onerror="this.parentNode.remove()"><span class="biome-chip b-${b}">${biomeName(b)}</span></a>`
      )
      .join('')}</div>`,
  // One row per biome: its mobs by level and its resources with the job level to gather them.
  'biome-table': (worldId = 'nauvis') => {
    const w = G.worlds.find(x => x.id === worldId)
    const anyMobs = w.biomes.some(b => w.mobs.some(m => m.biomes.includes(b)))
    const only = cs => (cs ? ` <small class="city-tag">+ ${cs.map(cityName).join(', ')}</small>` : '')
    const rows = w.biomes.map(b => {
      const mobs = w.mobs
        .filter(m => m.biomes.includes(b))
        .map(m => ({ m, lvl: mob(m.mob_type)?.lvl ?? [0, 0] }))
        .sort((x, y) => x.lvl[0] - y.lvl[0] || x.lvl[1] - y.lvl[1])
        .map(({ m, lvl }) => `${mobLink(m.mob_type)} <small>L${lvl[0]}–${lvl[1]}</small>${only(m.cities)}`)
      const res = w.resources
        .filter(r => r.biomes.includes(b))
        .map(r => ({ r, g: gatherOf(r.item_type) }))
        .sort((x, y) => (x.g?.job ?? '').localeCompare(y.g?.job ?? '') || (x.g?.level ?? 0) - (y.g?.level ?? 0))
        .map(({ r, g }) => `${itemLink(r.item_type)}${g ? ` <small>${jobName(g.job)} ${g.level}</small>` : ''}${only(r.cities)}`)
      return `<tr class="biome-row"><th colspan="2" id="biome-${b}"><span class="biome-chip b-${b}">${biomeName(b)}</span></th></tr>
        <tr>${anyMobs ? `<td>${cellList(mobs, 'cols')}</td>` : ''}<td>${cellList(res, anyMobs ? '' : 'cols')}</td></tr>`
    })
    // Yakutia has no mob spawns yet, so its table drops the empty mob column.
    return `<div class="table-wrap"><table class="biome-table"><thead><tr>${anyMobs ? '<th>Mobs (by level)</th>' : ''}<th>Resources (job level to gather)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  },
  // Archimobs: who they stand in for, at what level, and their likeliest drops.
  'archi-table': () =>
    table(
      ['Archimob', ['Level', 'num'], 'Swaps in for', 'Likeliest drops'],
      G.mobs
        .filter(m => m.role === 'archi')
        .map(m => [
          mobLink(m.id),
          [`${m.lvl[0]}–${m.lvl[1]}`, 'num'],
          cellList(archiStandIns(m.id).map(x => mobLink(x.id))),
          cellList(
            [...m.loot]
              .sort((a, b) => b.chance_bp - a.chance_bp)
              .slice(0, 3)
              .map(l => `${itemLink(l.item_type)} <small>${pct(l.chance_bp)}</small>`)
          ),
        ]),
      { stack: true }
    ),
  // One row per job, in the game's own groups (packages/immutable/src/identity.ts).
  'job-table': () => {
    const KIND = { gathering: 'Gathering', weapon_craft: 'Weapons', equipment_craft: 'Equipment', consumable_craft: 'Consumables' }
    const CAT = { sword: 'swords', daggers: 'daggers', axe: 'axes', bow: 'bows', spear: 'spears', hat: 'hats', cloak: 'cloaks', boots: 'boots', belt: 'belts', ring: 'rings', amulet: 'amulets', key: 'dungeon keys', tool_farmer: 'tools', tool_miner: 'tools', tool_herbalist: 'tools' }
    const byLevel = (a, b) => (item(a).level ?? 0) - (item(b).level ?? 0)
    const rows = Object.entries(G.jobs).flatMap(([kind, jobs]) =>
      jobs.map(job => {
        const rs = G.recipes.filter(r => r.job === job)
        if (kind === 'gathering') {
          const tiers = Object.values(G.gatherables).filter(g => g.job === job).sort((a, b) => a.tier - b.tier)
          const tool = Object.keys(G.items).filter(id => item(id).category === `tool_${job.toLowerCase()}`).sort(byLevel)[0]
          return [`<b>${jobName(job)}</b>`, KIND[kind], `${tiers.length} tiers from ${itemLink(tiers[0].item_type)} up, and refines them`, [rs.length, 'num'], tool ? `${itemLink(tool)}` : '—']
        }
        const made = rs.map(r => r.output_type).filter(id => item(id).category !== 'resource')
        const cats = [...new Set(made.map(id => item(id).category))]
        // Small jobs list their items; gear jobs list the slots they cover.
        const makes = cats.every(c => CAT[c]) ? [...new Set(cats.map(c => CAT[c]))].join(', ').replace(/^\w/, c => c.toUpperCase()) : cellList(made.sort(byLevel).map(itemLink))
        const first = made.filter(id => item(id).category in CAT).sort(byLevel)[0] ?? made.sort(byLevel)[0]
        return [`<b>${jobName(job)}</b>`, KIND[kind], makes, [rs.length, 'num'], first ? `${itemLink(first)}` : '—']
      })
    )
    return table(['Job', 'Kind', ['Makes', '', false], ['Recipes', 'num'], ['Start with', '', false]], rows, { sortable: true, stack: true })
  },
  // Each gathering tier by job, with the biomes and city areas it grows in. Tiers no world places yet share one row.
  'tier-table': () => {
    const JOBS = ['FARMER', 'MINER', 'HERBALIST']
    const where = id => {
      for (const w of G.worlds) {
        const r = w.resources.find(x => x.item_type === id)
        if (r) return [...r.biomes.map(biomeName), ...(r.cities ?? []).map(cityName)].join(', ') + (w.id === 'nauvis' ? '' : ` (${titleCase(w.id)})`)
      }
      return null
    }
    const tiers = [...new Set(Object.values(G.gatherables).map(g => g.tier))].sort((a, b) => a - b)
    const at = (tier, job) => Object.values(G.gatherables).find(g => g.tier === tier && g.job === job)
    const placed = tiers.filter(t => JOBS.some(j => where(at(t, j)?.item_type)))
    const rest = tiers.filter(t => !placed.includes(t))
    const rows = placed.map(t => [
      [at(t, JOBS[0]).level, 'num'],
      ...JOBS.map(j => {
        const g = at(t, j)
        return g ? `${itemLink(g.item_type)}<br><small>${where(g.item_type) ?? 'not in the world yet'}</small>` : '—'
      }),
    ])
    if (rest.length) {
      const lv = rest.map(t => at(t, JOBS[0]).level)
      rows.push({ attrs: 'class="tier-later"', cells: [[`${lv[0]}–${lv.at(-1)}`, 'num'], ...JOBS.map(j => `${cellList(rest.map(t => itemLink(at(t, j).item_type)))}<small>not in the world yet</small>`)] })
    }
    return table([['Job level', 'num'], 'Farmer', 'Miner', 'Herbalist'], rows, { stack: true })
  },
  // Every resource guardian with the resource it guards and the job level that unlocks the gather.
  'guardian-table': () =>
    table(
      ['Guardian', ['Level', 'num'], 'Element', 'Guards', 'Gather needs'],
      Object.values(G.gatherables ?? {})
        .map(g => ({ g, m: mob(g.protector) }))
        .filter(x => x.m)
        .sort((a, b) => a.g.job.localeCompare(b.g.job) || a.g.level - b.g.level)
        .map(({ g, m }) => [mobLink(m.id), [`${m.lvl[0]}–${m.lvl[1]}`, 'num'], elTag(m.element), itemLink(g.item_type), `${jobName(g.job)} ${g.level}`]),
      { sortable: true, stack: true }
    ),
  'region-table': () => {
    const w = G.worlds.find(x => x.id === 'nauvis')
    const rows = []
    for (const c of w.cities) {
      const ms = w.mobs.filter(m => m.cities?.includes(c.id))
      const rs = w.resources.filter(r => r.cities?.includes(c.id))
      rows.push([
        `<b>${cityName(c.id)}</b>`,
        cellList(ms.map(m => `${mobLink(m.mob_type)} <small>${m.biomes.length ? `also roams ${m.biomes.map(biomeName).join(', ')}` : '<b>nowhere else</b>'}</small>`)),
        cellList(rs.map(r => `${itemLink(r.item_type)} <small>${r.biomes.length ? `also grows in ${r.biomes.map(biomeName).join(', ')}` : '<b>nowhere else</b>'}</small>`)),
        c.dungeon ? `<a href="#/dungeons#${c.dungeon}">${titleCase(c.dungeon)}</a>` : '—',
      ])
    }
    return table(['City area', 'Mobs that spawn inside it', 'Resources that grow inside it', 'Dungeon'], rows, { stack: true })
  },
  'dungeon-list': only =>
    G.dungeons
      .filter(d => !only || d.dungeon === only)
      .map(d => {
        const city = G.worlds.flatMap(w => w.cities).find(c => c.dungeon === d.dungeon)
        const all = d.rooms.flat().map(m => m.mob_type)
        const lv = all.map(id => mob(id)?.lvl ?? [0, 0])
        const keyRecipe = recipeOf(d.key)
        const boss = [...new Set(all)].find(id => mob(id)?.role === 'boss')
        return `<h3 id="${d.dungeon}">${titleCase(d.dungeon)}</h3>
          ${boss ? `<a class="boss-card" href="#/mob/${boss}">${pic('mob', [boss], 'boss-art')}<span><small>Final boss</small><b>${esc(mob(boss).name)}</b></span></a>` : ''}
          <div class="stat-strip"><div><span>Entrance</span><b>${city ? cityName(city.id) : '?'}</b></div><div><span>Rooms</span><b>${d.rooms.length}</b></div><div><span>Mob levels</span><b>${Math.min(...lv.map(x => x[0]))}–${Math.max(...lv.map(x => x[1]))}</b></div><div><span>Key</span><b>${itemLink(d.key)}</b></div></div>
          ${keyRecipe ? `<p>The key is crafted (${jobName(keyRecipe.job)}) from:</p>${ingredientList(keyRecipe)}` : ''}
          ${table(
            [['Room', 'num'], 'Mobs'],
            d.rooms.map((r, i) => {
              const counts = {}
              r.forEach(m => (counts[m.mob_type] = (counts[m.mob_type] ?? 0) + 1))
              return [[i + 1, 'num'], countList(Object.entries(counts), mobLink)]
            })
          )}`
      })
      .join(''),
  // data-arg="scene:thebes|Caption": one large picture.
  figure: arg => {
    const [ref, caption = ''] = arg.split('|')
    const [kind, id] = ref.split(':')
    const wide = kind === 'scene' || kind === 'world'
    return `<figure class="art-figure${wide ? ' wide' : ''}">${pic(kind, [id], 'big', caption.replace(/<[^>]+>/g, '') || artName(kind, id))}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`
  },
  // data-arg="mob:tinker,item:old_hoe": named picture cards linking to their pages.
  gallery: arg =>
    `<div class="art-gallery">${arg
      .split(',')
      .map(ref => {
        const [kind, id] = ref.trim().split(':')
        const href = artHref(kind, id)
        const inner = `${pic(kind === 'item' ? 'itemhd' : kind, [id], 'card-art')}<span>${esc(artName(kind, id))}</span>`
        return href ? `<a class="art-card" href="${href}">${inner}</a>` : `<div class="art-card">${inner}</div>`
      })
      .join('')}</div>`,
  // The game has no fixed element cycle: each mob carries its own resistances. This draws the
  // pattern they make. An arrow A → B counts the mobs of element B with negative A resistance.
  'element-web': () => {
    const STAT = { earth: 'strength', fire: 'intelligence', water: 'chance', air: 'agility' }
    const POS = { fire: [110, 92], water: [410, 92], earth: [110, 318], air: [410, 318] }
    const R = 52
    const edges = []
    for (const hit of Object.keys(POS))
      for (const host of Object.keys(POS)) {
        if (hit === host) continue
        const mobs = G.mobs.filter(m => m.element === host && m.res[hit] < 0).sort((a, b) => a.res[hit] - b.res[hit])
        if (mobs.length) edges.push({ hit, host, mobs })
      }
    edges.sort((a, b) => b.mobs.length - a.mobs.length)
    const curve = ({ hit, host, mobs }) => {
      const [x1, y1] = POS[hit]
      const [x2, y2] = POS[host]
      const d = Math.hypot(x2 - x1, y2 - y1)
      const [ux, uy] = [(x2 - x1) / d, (y2 - y1) / d]
      const [cx, cy] = [(x1 + x2) / 2 - uy * 34, (y1 + y2) / 2 + ux * 34]
      const trim = (x, y, tx, ty, by) => {
        const l = Math.hypot(tx - x, ty - y)
        return [x + ((tx - x) / l) * by, y + ((ty - y) / l) * by]
      }
      const [sx, sy] = trim(x1, y1, cx, cy, R + 4)
      const [ex, ey] = trim(x2, y2, cx, cy, R + 10)
      const t = 0.4 // label nearer the attacker so the two crossing diagonals don't collide
      const [mx, my] = [(1 - t) ** 2 * sx + 2 * t * (1 - t) * cx + t * t * ex, (1 - t) ** 2 * sy + 2 * t * (1 - t) * cy + t * t * ey]
      const n = mobs.length
      return `<g class="ew-edge" style="--c: var(--${hit})"><title>${n} ${host} mob${n > 1 ? 's take' : ' takes'} extra damage from ${hit} attacks</title>
        <path d="M${sx},${sy} Q${cx},${cy} ${ex},${ey}" stroke-width="${1.5 + n * 1.1}" marker-end="url(#ew-head-${hit})"/>
        <circle cx="${mx}" cy="${my}" r="12"/><text x="${mx}" y="${my}">${n}</text></g>`
    }
    const node = e => {
      const [x, y] = POS[e]
      return `<g class="ew-node" style="--c: var(--${e})"><circle cx="${x}" cy="${y}" r="${R}"/>
        <text class="ew-name" x="${x}" y="${y - 18}">${titleCase(e)}</text>
        <image href="${artUrl('ui', `stat_${STAT[e]}`)}" x="${x - 10}" y="${y - 4}" width="20" height="20"/>
        <text class="ew-stat" x="${x}" y="${y + 32}">${titleCase(STAT[e])}</text></g>`
    }
    const heads = Object.keys(POS)
      .map(e => `<marker id="ew-head-${e}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--${e})"/></marker>`)
      .join('')
    return `<figure class="element-web">
      <svg viewBox="0 0 520 410" role="img" aria-label="Which element each element's mobs are weak to">
        <defs>${heads}</defs>${edges.map(curve).join('')}${Object.keys(POS).map(node).join('')}
      </svg>
      <figcaption>Read each arrow as “attacks of this element hurt mobs of that element more”. The number on it counts the mobs in the game with that weakness: Earth → Air with 8 means 8 different air mobs take extra damage from earth attacks. A thicker arrow means more mobs. The stat under each element is the one that powers its damage. The table below names every mob.</figcaption>
      </figure>
      ${table(
        ['Hit with', 'Mobs weak to it (most extra damage first)'],
        edges.map(({ hit, host, mobs }) => [
          `${el(hit)} <small>${titleCase(STAT[hit])}</small><br><small>against ${host} mobs</small>`,
          cellList(mobs.map(m => `${mobLink(m.id)} <small>${m.res[hit]}%</small>`), 'cols'),
        ])
      )}`
  },
  sources: id => sourcesHtml(id),
  // How to get a crafted tool: for each ingredient, the lowest-level mob that drops it → the ingredient ×qty → the tool.
  // data-arg="old_hoe". The mob is picked from the drop tables (lowest level first, then best odds).
  // Opts (from code): out = the output card's note; tail = a pet that eats the output, drawn as a feed step.
  'drop-flow': (id, { out = 'Tool', tail = null } = {}) => {
    const r = recipeOf(id)
    if (!r) return ''
    const card = (kind, key, name, href, note = '') =>
      `<a class="df-card" href="${href}">${pic(kind, [key], 'df-art')}<b>${esc(name)}</b>${note ? `<small>${note}</small>` : ''}</a>`
    const rows = Object.entries(r.inputs).map(([k, n]) => {
      const d = dropsOf(k).sort((a, b) => a.mob.lvl[0] - b.mob.lvl[0] || b.chance_bp - a.chance_bp)[0]
      // Golden rares come from gathering their parent resource rather than from mobs.
      const g = !d && rareParent(k)
      const from = d
        ? `${card('mob', d.mob.id, d.mob.name, `#/mob/${d.mob.id}`, `Level ${d.mob.lvl[0]}–${d.mob.lvl[1]}`)}<span class="df-arrow">${lucide('arrow')}<small>${Math.round(d.chance_bp / 100)}% drop</small></span>`
        : g
          ? `${card('itemhd', g.item_type, item(g.item_type).name, `#/item/${g.item_type}`, `${jobName(g.job)} ${g.level}`)}<span class="df-arrow">${lucide('arrow')}<small>${RARE} per gather</small></span>`
          : `<span class="df-card df-none">${esc(shortSources(k))}</span><span class="df-arrow">${lucide('arrow')}</span>`
      return `<div class="df-row">${from}${card('itemhd', k, item(k).name, `#/item/${k}`, `Need ${n}`)}</div>`
    })
    return `<div class="drop-flow" role="img" aria-label="${esc(`${item(id).name}: ${Object.entries(r.inputs).map(([k, n]) => `${n} ${item(k).name}`).join(' and ')}`)}">
      <div class="df-rows">${rows.join('')}</div>
      <span class="df-arrow df-join">${lucide('arrow')}<small>Craft (${jobName(r.job)} ${craftLevel(r)})</small></span>
      ${card('itemhd', id, item(id).name, `#/item/${id}`, out)}
      ${tail ? `<div class="df-tail">${card('itemhd', id, item(id).name, `#/item/${id}`, out)}<span class="df-arrow">${lucide('arrow')}<small>Feed 1 a day, 60 times</small></span>${card('itemhd', tail, item(tail).name, `#/item/${tail}`, 'Full power')}</div>` : ''}
    </div>`
  },
  recipe: id => {
    const r = recipeOf(id)
    if (!r) return `<p>${itemLink(id)} has no recipe.</p>`
    return table(
      ['Ingredient', ['Qty', 'num'], 'Where it comes from'],
      Object.entries(r.inputs).map(([k, n]) => [itemLink(k), [n, 'num'], shortSources(k)]),
      { stack: true }
    )
  },
  'mob-where': id => {
    const s = spawnsOf(id)
    return s.length ? `<p>${mobLink(id)} spawns in ${s.map(where).join('; ')}.</p>` : ''
  },
  // The game's wallet button (top right of the HUD): SUI and KARES balances, styled like world_chrome.css.
  wallet: arg => {
    const [sui = '2.48', kares = '1,250'] = (arg ?? '').split('|').filter(Boolean)
    return `<span class="wallet-chip" role="img" aria-label="The wallet button: ${esc(sui)} SUI and ${esc(kares)} KARES"><span class="wc-sui">${suiLogo()}${esc(sui)}</span><span class="wc-kares">${pic('currency', ['kares'], 'wc-icon')}${esc(kares)}</span></span>`
  },
  // The game's Add funds window rebuilt from AddFundsModal.tsx + account.css, with a made-up example address
  // (a hash, so no one owns it). data-arg words: "sui:0" sets the game balance (under 0.2 SUI adds the game's
  // comfortable-play note), "address" shows only the address button, "copied" its state after a click.
  'funds-window': arg => {
    const opts = (arg ?? '').split(/\s+/)
    const sui = opts.find(o => o.startsWith('sui:'))?.slice(4) ?? '2.48'
    const copied = opts.includes('copied')
    const address = `<div class="fw-address">${lucide('wallet')}<span>${EXAMPLE_ADDRESS}</span>${copied ? lucide('check', 'fw-ok') : lucide('copy', 'fw-dim')}</div>`
    if (opts.includes('address')) return `<div class="funds-window fw-solo" role="img" aria-label="${copied ? 'The address button after clicking it: the copy icon turns into a green check.' : 'The SUI address button.'}">${address}</div>`
    const low = Number(sui) < 0.2
    return `<div class="funds-window" role="img" aria-label="The game's Add funds window: your SUI address with a copy button, a game balance of ${esc(sui)} SUI, a Privy row to connect an Ethereum or Solana wallet, and three card providers.">
      <div class="fw-head">${lucide('wallet')}<b>Add Funds</b>${lucide('x', 'fw-dim')}</div>
      <div class="fw-body">
        <div><h4>SUI address</h4><p>Send SUI on the Sui network. Click to copy.</p>${address}</div>
        <div class="fw-balance"><small>Game balance</small><b>${esc(sui)} SUI</b></div>
        ${low ? '<p class="fw-note">For comfortable play: 0.20 SUI.</p>' : ''}
        <div class="fw-from"><small>From</small><div class="fw-row"><span class="fw-row-icon">P</span><span><b>Privy</b><small>EVM · Solana</small></span><em>Connect</em></div></div>
        <div class="fw-card"><h5>${lucide('card')}Credit card</h5><div>${['MoonPay', 'Transak', 'Guardarian'].map(n => `<span>${n}${lucide('out')}</span>`).join('')}</div></div>
      </div>
    </div>`
  },
  // The popup under the wallet button (WalletCard.tsx + app_layout.css). data-arg="SUI|KARES" balances.
  'wallet-popover': arg => {
    const [sui = '0', kares = '0'] = (arg ?? '').split('|').filter(Boolean)
    const short = `${EXAMPLE_ADDRESS.slice(0, 8)}…${EXAMPLE_ADDRESS.slice(-5)}`
    return `<div class="wallet-pop" role="img" aria-label="The wallet popup: your address, ${esc(sui)} SUI and ${esc(kares)} KARES, and the Send and Add funds buttons.">
      <div class="wp-id">${lucide('wallet')}<b>${short}</b>${lucide('copy', 'fw-dim')}</div>
      <div class="wp-bal"><div>${suiLogo()}<span>SUI</span><b>${esc(sui)}</b></div><div>${pic('currency', ['kares'], 'wc-icon')}<span>KARES</span><b>${esc(kares)}</b></div></div>
      <div class="wp-act"><span class="wp-btn">${lucide('send')}Send</span><span class="wp-btn wp-primary">${lucide('plus')}Add funds</span></div>
      <div class="wp-gas"><span>Gas spent (24h)</span><b>0.0000 SUI</b></div>
      <span class="wp-btn">${lucide('logout')}Disconnect</span>
    </div>`
  },
  // Funding pictures as boxes and arrows. Default: an exchange sends SUI to the game address.
  // data-arg="bridge": an Ethereum or Solana wallet pays through NEAR Intents, which delivers SUI.
  'send-diagram': arg => {
    const box = (icon, title, note) => `<div class="sd-box">${lucide(icon)}<b>${title}</b><small>${note}</small></div>`
    const arrow = note => `<div class="sd-arrow">${lucide('arrow')}<small>${note}</small></div>`
    const game = box('wallet', 'Your game address', `${EXAMPLE_ADDRESS.slice(0, 8)}…${EXAMPLE_ADDRESS.slice(-5)}`)
    return arg === 'bridge'
      ? `<div class="send-diagram sd-bridge" role="img" aria-label="Your Ethereum or Solana wallet, connected through Privy, sends a coin to NEAR Intents, which converts it and delivers SUI to your game address.">${box('link', 'Your Ethereum or Solana wallet', 'Connected through Privy')}${arrow('Your coin')}${box('swap', 'NEAR Intents', 'Converts it to SUI')}${arrow('SUI')}${game}</div>`
      : `<div class="send-diagram" role="img" aria-label="An exchange such as Coinbase sends SUI on the Sui network to your game address.">${box('bank', 'Your exchange', 'Coinbase, Binance, Kraken…')}${arrow('SUI, on the Sui network')}${game}</div>`
  },
}
const HEAT = { low: 'Cold', mid: 'Temperate', high: 'Hot' }
const WET = { low: 'Dry', mid: 'Moderate', high: 'Wet' }
const shortSources = id => {
  const bits = []
  const r = recipeOf(id)
  if (r) bits.push(`Crafted (${jobName(r.job)})`)
  const d = dropsOf(id).sort((a, b) => b.chance_bp - a.chance_bp)
  if (d.length)
    bits.push(`Dropped by${cellList([...d.slice(0, 3).map(x => `${mobLink(x.mob.id)} <small>${pct(x.chance_bp)}</small>`), ...(d.length > 3 ? [`<small>and ${d.length - 3} more</small>`] : [])])}`)
  const g = resourceSpawns(id)
  if (g.length) bits.push(`Gathered in ${g.map(where).join('; ')}`)
  return bits.length ? cellList(bits) : 'See the item page'
}

const sourcesHtml = id => {
  const r = recipeOf(id)
  const d = dropsOf(id).sort((a, b) => b.chance_bp - a.chance_bp)
  const g = resourceSpawns(id)
  let h = ''
  if (r)
    h += `<h3>Craft it</h3><p>Needs <b>${jobName(r.job)} level ${craftLevel(r)}</b> (${Object.keys(r.inputs).length} different ingredients). At that level each attempt succeeds ${craftSuccess(craftLevel(r))}% of the time, and a failed attempt still uses up its ingredients. <a href="#/planner/${encodeURIComponent(id)}">Plan the whole craft</a>, down to the raw resources.</p>${WIDGETS.recipe(id)}`
  if (d.length)
    h += `<h3>Loot it</h3>${table(
      ['Mob', ['Level', 'num'], ['Chance', 'num'], ['Qty', 'num'], 'Where the mob lives'],
      d.map(x => [mobLink(x.mob.id), [`${x.mob.lvl[0]}–${x.mob.lvl[1]}`, 'num'], [pct(x.chance_bp), 'num'], [x.min_qty === x.max_qty ? x.min_qty : `${x.min_qty}–${x.max_qty}`, 'num'], encounterOf(x.mob.id).where]),
      { stack: true }
    )}`
  const gj = gatherOf(id)
  if (g.length)
    h += `<h3>Gather it</h3>${gj ? `<p>Needs <b>${jobName(gj.job)} level ${gj.level}</b> and any ${jobName(gj.job)} tool equipped. The tool's own level doesn't matter. Each gather also has a ${RARE} chance of a bonus ${itemLink(gj.rare)}.</p>` : ''}<p>Grows in: ${g.map(where).join('; ')}.</p>`
  const crates = Object.entries(G.items).filter(([, x]) => x.contents?.some(c => c.item_type === id))
  if (crates.length)
    h += `<h3>Open a crate</h3><p>${crates
      .map(([cid, x]) => {
        const shop = G.mastery?.offers.find(o => o.item_type === cid && o.enabled)
        return `${itemLink(cid)} gives one of ${x.contents.length} possible items, this one included.${shop ? ` It costs ${shop.cost} Mastery points from the <a href="#/first-dungeon#mastery">daily Mastery quest</a>.` : ''}`
      })
      .join(' ')}</p>`
  if (G.items[id]?.category === 'pet' || crates.length) h += '<p>Other players can also sell it on the <a href="#/market">marketplace</a>.</p>'
  if (!h) h = '<p>The source data has no recipe, drop or gathering spot for this item. It may come from crates, rewards or the marketplace.</p>'
  return h
}

/* ---------- data pages ---------- */
// Stat price bars: per stat, how many points one +1 costs from 0 up to `cap` (green cheap → red dear).
const STAT_EL = { strength: 'earth', intelligence: 'fire', chance: 'water', agility: 'air' }
const STAT_ICON = { strength: 'stat_strength', intelligence: 'stat_intelligence', chance: 'stat_chance', agility: 'stat_agility', vitality: 'health_heart', wisdom: 'stat_wisdom' }
// The level axis over the bars: how many points you have in the stat, from 0 to cap.
const costAxis = cap =>
  `<div class="cost-row cost-axis" aria-hidden="true"><span>Points in stat</span><div>${[0, 1, 2, 3, 4].map(i => `<b style="left:${i * 25}%">${(cap / 4) * i}</b>`).join('')}</div></div>`
const costRows = (c, stats, cap = 400, compact = false) =>
  (compact ? '' : costAxis(cap)) +
  stats
    .map(s => {
      const rows = c.ladders[s]
      const segs = rows
        .map((r, i) => {
          const to = Math.min(rows[i + 1]?.from ?? cap, cap)
          if (r.from >= cap) return ''
          const w = ((to - r.from) / cap) * 100
          const shade = r.gain > 1 ? 0 : Math.min(r.cost, 5)
          const label = compact || w <= 9 ? '' : r.gain > 1 ? `1 pt → +${r.gain}` : `${r.cost} pt${r.cost > 1 ? 's' : ''}`
          return `<span style="width:${w}%;background:var(--cost-${shade});--fill-text:var(--cost-${shade}-text)" title="${r.from}+: ${r.cost} point${r.cost > 1 ? 's' : ''} for +${r.gain}">${label}</span>`
        })
        .join('')
      const name = compact ? `${titleCase(s).slice(0, 3)}` : `${pic('ui', [STAT_ICON[s]], 'ico')}${titleCase(s)}${STAT_EL[s] ? ` ${el(STAT_EL[s])}` : ''}`
      return `<div class="cost-row${compact ? ' compact' : ''}"><span>${name}</span><div class="cost-bar">${segs}</div></div>`
    })
    .join('')
// A class's 20 spells by their damage element (a multi-element spell counts under its first); 'none' = no damage.
const spellSplit = c => {
  const tally = {}
  for (const sp of c.spells) {
    const f = sp.levels[0].fx.find(f => [0, 1, 3, 6].includes(f.kind) && f.element && f.target_filter !== 4)
    const e = f?.element ?? 'none'
    tally[e] = (tally[e] ?? 0) + 1
  }
  return Object.entries(tally).sort((a, b) => (a[0] === 'none') - (b[0] === 'none') || b[1] - a[1])
}
// Hand-written from each class's spell list (check them when a release changes a class's spells).
const CLASS_SUMMARY = {
  shugo: 'A tank built on armour. Four armours and several shields protect the team, glyphs lock down the board, and fire attacks finish the job.',
  tomoda: 'A beastmaster who calls on animals. Cries and totems buff allies, venom and claws wear enemies down, and the damage is spread over all four elements.',
  rojin: 'A treasure hunter who throws coins and shovels. Water and earth hits, curses that make enemies clumsy, and luck spells that boost the team.',
  yajin: 'An assassin who wins with traps. Seven traps, invisibility and short dashes set up big earth hits like Lethal Attack.',
  tokei: 'A time mage. Most spells slow enemies down and speed allies up at the same time, with fire and air damage on top.',
  asobi: 'A gambler whose spells roll the dice. Heads or Tails, Roulette and All or Nothing can heal or hurt, backed by solid earth melee.',
  iyashi: 'The team healer. Eight words heal or revive allies, others shield, buff or silence, and a few deal fire, air or water damage.',
  senshi: 'A front-line sword fighter. Jumps in, pumps up their own damage, then hits hard in earth and fire up close.',
  yogan: 'A long-range archer. Arrows reach up to 8 cells and slow, poison or push enemies back, with damage in all four elements.',
  mori: 'A druid of brambles and spores. Poisons and roots hold enemies in place while earth brambles do the damage, with a few heals for the team.',
  ikari: 'A berserker who trades blood for power. Pulls, swaps and life steal keep enemies close, and Punishment spells boost their strength. Gets +2 HP per Vitality point.',
  shusen: 'A brawler with drunken fists. Vulnerability spells weaken enemies against one element, then fire, earth and air punches and shoves cash in.',
}
const renderClass = id => {
  const c = cls(id)
  if (!c) return notFound()
  const els = classElements(c)
  const bars = costRows(c, ['strength', 'intelligence', 'chance', 'agility', 'vitality', 'wisdom'])
  const back = lastSlug === 'character' ? '<a href="#/character#class">← Create your character</a>' : '<a href="#/classes">← Choosing a class</a>'
  return `<p class="crumbs">${back}</p>
    <div class="class-hero"><div class="portraits">${pic('portrait', [c.id, 'female'], 'portrait', `${titleCase(c.id)}, female`)}${pic('portrait', [c.id, 'male'], 'portrait', `${titleCase(c.id)}, male`)}</div><div><h1>${titleCase(c.id)}</h1><p class="lede"><b>${esc(c.title)}.</b> ${CLASS_SUMMARY[c.id] ?? ''}</p></div></div>
    <div class="callout warn"><p><strong>Your class is permanent.</strong> Read the whole spell list before you create a ${titleCase(c.id)}. Stats and spell points can be reset later with scrolls; the class cannot.</p></div>
    <h2 id="elements">Elements and stats</h2>
    <p>Each damage element is scaled by one stat: earth by Strength, fire by Intelligence, water by Chance, air by Agility. ${titleCase(c.id)} spells deal damage in: ${els.map(x => `${el(x.e)} (${x.n} spell${x.n > 1 ? 's' : ''})`).join(', ') || 'none'}.</p>
    <p>You get 5 stat points per level. Each bar runs from 0 to 400 in that stat and shows how many points one +1 costs along the way: green is cheap (1 point), red is expensive (5 points). The stats that stay green longest are the ones the class is built around.</p>
    ${bars}
    <p class="cost-legend">Hover a segment for the exact price. Wisdom always costs 3 points per +1.</p>
    <h2 id="spells">All 20 spells</h2>
    <p>Three spells are ready at level 1; the rest unlock as you level. Each spell has 6 ranks. Rank 1 is free once unlocked; ranks 2–6 cost 1, 2, 3, 4 and 5 spell points (15 to max one spell), and you earn 1 spell point per level. Use the rank buttons on a card to see that spell at another rank, or the buttons below to switch every card.</p>
    <p>Each card's small grid is the board seen from above: the dark square is you, tinted squares are where you can cast, and solid squares are what one cast hits.</p>
    <div class="rank-picker" role="group" aria-label="Spell rank"><span>Show rank</span>${[1, 2, 3, 4, 5, 6].map(r => `<button data-rank="${r}" aria-pressed="${r === 1}">${r}</button>`).join('')}</div>
    <div id="spell-list"></div>
    <p>${official('classes', c.id, `See ${titleCase(c.id)} in the official encyclopedia`)}</p>`
}

// Spell card helpers. Element → stat that scales it (fight_math: damage × (100 + stat) / 100).
const EL_STAT = { earth: 'Strength', fire: 'Intelligence', water: 'Chance', air: 'Agility' }
const SPELL_POINTS = [0, 1, 3, 6, 10, 15] // cumulative points to reach ranks 1–6
const DAMAGE_KINDS = new Set([0, 1, 3])
// Top-level rows only: a trap's or glyph's payload is listed under it, not cast directly.
const castRows = fx => {
  const out = []
  let nested = false
  for (const f of fx) {
    if (!nested) out.push(f)
    if (f.kind === 12 || f.kind === 13) nested = true
  }
  return out
}
const spellTags = l => {
  const rows = castRows(l.fx)
  const all = l.fx
  const tags = []
  const els = [...new Set(all.filter(f => (DAMAGE_KINDS.has(f.kind) || (f.stat === 12 && (f.kind === 5 || f.kind === 6))) && f.element).map(f => f.element))]
  if (els.length) tags.push(...els.map(e => `${el(e)}`))
  const has = pred => all.some(pred)
  if (has(f => f.kind === 4 && f.stat === 12)) tags.push('<span class="tag heal">Heal</span>')
  if (has(f => f.kind === 6 && f.stat === 12)) tags.push('<span class="tag">Life steal</span>')
  if (has(f => f.kind === 5 && f.stat === 12)) tags.push('<span class="tag">Poison</span>')
  if (has(f => (f.kind === 4 && f.stat !== 12) || [7, 15, 17, 18, 19].includes(f.kind))) tags.push('<span class="tag buff">Buff</span>')
  if (has(f => f.kind === 14)) tags.push('<span class="tag buff">Shield</span>')
  if (has(f => (f.kind === 5 && f.stat !== 12) || f.kind === 20 || (f.kind === 6 && f.stat !== 12))) tags.push('<span class="tag debuff">Debuff</span>')
  if (has(f => [8, 9, 10, 11].includes(f.kind))) tags.push('<span class="tag">Movement</span>')
  if (rows.some(f => f.kind === 12)) tags.push('<span class="tag">Trap</span>')
  if (rows.some(f => f.kind === 13)) tags.push('<span class="tag">Glyph</span>')
  if (has(f => f.kind === 16)) tags.push('<span class="tag">Dispel</span>')
  return tags
}
// Who the spell can be aimed at, from its range and the filters on its direct rows.
const spellTarget = l => {
  const rows = castRows(l.fx)
  if (l.range[1] === 0) return 'Cast on yourself'
  const f = new Set(rows.map(r => r.target_filter))
  if (rows.some(r => r.kind === 12 || r.kind === 13)) return 'Cast on any cell in range'
  if (f.size === 1 && f.has(1)) return 'Enemies only'
  if (f.size === 1 && f.has(3)) return 'You and allies only'
  if (f.size === 1 && f.has(4)) return 'Always lands on you'
  return 'Any fighter in range'
}
const rangeText = l => (l.range[0] === l.range[1] ? `${l.range[0]}` : `${l.range[0]}–${l.range[1]}`)
const rowLabel = f => {
  const st = window.Effects.stat(f.stat)
  if (DAMAGE_KINDS.has(f.kind)) return `${titleCase(f.element || 'neutral')} damage${f.kind === 1 ? ' (% of max HP)' : ''}`
  if (f.kind === 4) return f.stat === 12 ? (f.turns ? 'Regeneration per turn' : 'Heal') : `+${st}`
  if (f.kind === 5) return f.stat === 12 ? 'Poison per turn' : `−${st}`
  if (f.kind === 6) return f.stat === 12 ? 'Life steal' : `Stolen ${st}`
  if (f.kind === 20) return `−${st}`
  return { 2: 'Damage to yourself', 8: 'Push (cells)', 9: 'Pull (cells)', 14: 'Shield per hit', 15: 'Reflect per hit' }[f.kind] ?? 'Effect'
}
const valText = f => (f.value === f.value_max ? `${f.value}` : `${f.value}–${f.value_max}`)
// The row whose numbers change most across ranks: what a rank-up buys you.
const keyRow = s => {
  const rows0 = s.levels[0].fx
  let best = -1
  let bestGain = -1
  rows0.forEach((f, i) => {
    const last = s.levels.at(-1).fx[i]
    if (!last || !f.value_max) return
    const gain = last.value_max - f.value_max + (DAMAGE_KINDS.has(f.kind) ? 0.5 : 0)
    if (gain > bestGain) (best = i), (bestGain = gain)
  })
  return best
}
// Clips from scripts/render-spells-game.mjs: the game's own Fight lab, recorded offline.
// Manifest keys are "<class>/<Spell Name>/<rank>" (older rank-less keys still work); a mob's spells are
// "mob:<mob id>/<Spell Name>/1", passed here as the class "mob:<mob id>".
const clipFor = (classe, s, rank) => SPELL_CLIPS?.[`${classe}/${s.name}/${rank}`] ?? SPELL_CLIPS?.[`${classe}/${s.name}`] ?? null
const isMobCaster = classe => Boolean(classe?.startsWith('mob:'))
const spellMedia = (classe, s, rank) => {
  const clip = clipFor(classe, s, rank)
  const icon = classe && !isMobCaster(classe) ? pic('spell', [classe, s.name], 'sp-clip-icon') : ''
  if (!clip) return `<div class="sp-clip empty">${icon}<span>${isMobCaster(classe) ? 'No clip of this spell yet' : 'No clip of this rank yet'}</span></div>`
  const foe = mob(clip.mob)?.name ?? 'a mob'
  const on = isMobCaster(classe)
    ? clip.target === 'self' ? 'itself' : clip.target === 'ally' ? `another ${foe}` : clip.vs ? `a ${titleCase(clip.vs)}` : 'a character'
    : clip.target === 'ally' ? 'a wounded ally' : clip.target === 'self' ? 'the caster' : clip.target === 'cell' ? `the ground next to ${foe}` : foe
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const what = isMobCaster(classe) ? `${foe} casts it on ${on}` : `Rank ${rank} cast on ${on}`
  return `<video class="sp-clip" src="assets/spells/${clip.file}.mp4" ${still ? 'controls' : 'autoplay'} loop muted playsinline preload="metadata" aria-label="${esc(s.name)}: ${esc(what)}" title="${esc(what)} in the game's fight lab"></video>`
}

// Area diagram: a top-down slice of the board. The caster stands in the middle; tinted cells are
// where you can cast, solid cells what one cast hits when aimed at the far edge of the range.
const areaRow = l => {
  const rows = castRows(l.fx)
  return rows.filter(f => f.area_shape).sort((a, b) => b.area_size - a.area_size)[0] ?? null
}
const inShape = (shape, size, dx, dy, dir) => {
  const m = Math.abs(dx) + Math.abs(dy)
  const along = dx * dir[0] + dy * dir[1]
  const across = Math.abs(dx * dir[1] - dy * dir[0])
  switch (shape) {
    case 2: return (dx === 0 || dy === 0) && m <= size // cross
    case 3: return across === 0 && along >= 0 && along <= size // line, away from the caster
    case 4: return along === 0 && across <= size // T: perpendicular bar
    case 5: return m === size // ring
    case 6: return true // whole board
    case 7: return along >= 0 && along <= size && across <= along // cone
    default: return m <= size // circle, podium, blob
  }
}
const areaGlyph = l => {
  const [rmin, rmax] = l.range
  const ar = areaRow(l)
  const shape = ar?.area_shape ?? 0
  const size = ar?.area_size ?? 0
  const R = Math.max(2, Math.min(5, Math.max(rmax, 0) + (shape === 6 ? 0 : size)))
  const cell = 11
  const n = R * 2 + 1
  const tx = rmax > 0 ? Math.min(rmax, R - (shape && shape !== 6 ? Math.min(size, 2) : 0), R) : 0 // aim along +x, near the far edge of range
  const dir = rmax > 0 ? [1, 0] : [1, 0]
  const cells = []
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = Math.abs(x) + Math.abs(y)
      const castable = rmax > 0 && d >= Math.max(rmin, 1) && d <= rmax && (!l.line || x === 0 || y === 0)
      const hit = shape ? inShape(shape, size, x - tx, y, dir) : x === tx && y === 0
      const cls = x === 0 && y === 0 ? 'me' : hit ? 'hit' : castable ? 'can' : ''
      cells.push(`<rect class="${cls}" x="${(x + R) * cell + 0.5}" y="${(y + R) * cell + 0.5}" width="${cell - 1.5}" height="${cell - 1.5}" rx="2"/>`)
    }
  const shapeName = shape ? `${window.Effects.SHAPE[shape]}${shape === 6 ? '' : ` of ${size}`}` : 'one target'
  const label = `${rmax > 0 ? `Cast ${rangeText(l)} cells away` : 'Cast on yourself'}; hits ${shapeName}.`
  return `<figure class="sp-area"><svg viewBox="0 0 ${n * cell} ${n * cell}" role="img" aria-label="${esc(label)}">${cells.join('')}</svg><figcaption>${shape ? `Hits a ${shapeName}` : 'Hits one target'}</figcaption></figure>`
}

const spellHtml = (s, rank, classe, index) => {
  const l = s.levels[Math.min(rank, s.levels.length) - 1]
  const fx = list(l.fx)
  const crit = list(l.crit_fx)
  const ul = (rows, cls = '') => `<ul class="${cls}">${rows.map(r => `<li>${r.text}${r.sub.length ? `<ul>${r.sub.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>`
  const dmgEls = [...new Set(l.fx.filter(f => DAMAGE_KINDS.has(f.kind) && f.element).map(f => f.element))]
  const dmgRow = l.fx.find(f => f.kind === 0 && f.element)
  const k = keyRow(s)
  const element = dmgEls[0] ?? 'neutral'
  const specs = [
    [l.ap, 'AP', l.ap > 3 ? 'once a turn' : `${Math.floor(6 / l.ap)} casts a turn`],
    [rangeText(l), 'range', [l.mod_range ? 'boostable' : 'fixed', l.los ? '' : 'no sight line', l.line ? 'line only' : ''].filter(Boolean).join(', ')],
    [l.cd ? `${l.cd}` : '—', 'cooldown', l.cd ? `turn${l.cd > 1 ? 's' : ''} before recasting` : 'recast every turn'],
    [l.crit ? `1/${l.crit}` : '—', 'crit', l.crit ? 'better with Agility' : "can't crit"],
  ]
  const limits = [l.per_turn && `${l.per_turn}× per turn`, l.per_target && `${l.per_target}× per target`].filter(Boolean)
  const label = k >= 0 && s.levels.length > 1 ? rowLabel(s.levels[0].fx[k]) : 'Effect'
  const ranks = s.levels
    .map((lv, i) => {
      const r = i + 1
      const pts = i ? `${SPELL_POINTS[i]} spell point${SPELL_POINTS[i] > 1 ? 's' : ''} in total` : 'free once unlocked'
      return `<button type="button" data-rank="${r}" aria-pressed="${r === rank}" title="Rank ${r}: ${pts}"><span>Rank ${r}</span>${label !== 'Effect' ? `<b>${valText(lv.fx[k])}</b>` : ''}</button>`
    })
    .join('')
  const scale = dmgRow
    ? `<p class="sp-scale">${titleCase(dmgRow.element)} damage grows 1% per point of <b>${EL_STAT[dmgRow.element]}</b>. With 100, this hit becomes <b>${valText({ value: dmgRow.value * 2, value_max: dmgRow.value_max * 2 })}</b> before resistances.${dmgEls.length > 1 ? ' Each element uses its own stat.' : ''}</p>`
    : l.fx.some(f => f.kind === 4 && f.stat === 12)
      ? '<p class="sp-scale">Heals grow 1% per point of <b>Intelligence</b>.</p>'
      : ''
  return `<section class="sp sp-${element}" id="spell-${slugify(s.name)}" data-spell="${index}">
    <header class="sp-head">${classe && !isMobCaster(classe) ? pic('spell', [classe, s.name], 'sp-icon') : ''}<div>
      <h3>${esc(s.name)}</h3>
      <p class="sp-sub">${s.unlock <= 1 ? 'From level 1' : `From level ${s.unlock}`}. ${spellTarget(l)}. <span class="sp-tags">${spellTags(l).join(' ')}</span></p>
    </div></header>
    <div class="sp-main">
      ${ul(fx, 'sp-fx')}
      ${scale}
      ${limits.length ? `<p class="sp-scale">Limit: ${limits.join(', ')}.</p>` : ''}
      ${crit.length ? `<div class="sp-crit"><h4>On a critical hit</h4>${ul(crit)}</div>` : ''}
    </div>
    <div class="sp-side">
      ${spellMedia(classe, s, rank)}
      <div class="sp-plate">
        ${areaGlyph(l)}
        <dl class="sp-specs">${specs.map(([v, u, note]) => `<div><dt>${u}</dt><dd><b>${v}</b><small>${note}</small></dd></div>`).join('')}</dl>
      </div>
    </div>
    ${s.levels.length > 1 ? `<nav class="sp-ranks" aria-label="${esc(s.name)} rank">${label !== 'Effect' ? `<span class="sp-ranks-label">${label}</span>` : ''}${ranks}</nav>` : ''}
  </section>`
}

const mountClass = async id => {
  const c = cls(id)
  const box = $('#spell-list')
  if (!c || !box) return
  if (!SPELL_CLIPS) SPELL_CLIPS = await fetch('assets/spells/index.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}))
  const draw = rank => (box.innerHTML = c.spells.map((s, i) => spellHtml(s, rank, c.id, i)).join(''))
  draw(1)
  // Rank buttons on a card switch only that card (numbers, area and clip).
  box.addEventListener('click', e => {
    const b = e.target.closest('.sp-ranks button')
    if (!b) return
    const card = b.closest('.sp')
    const i = +card.dataset.spell
    card.outerHTML = spellHtml(c.spells[i], +b.dataset.rank, c.id, i)
    box.querySelector(`[data-spell="${i}"] .sp-ranks button[data-rank="${b.dataset.rank}"]`)?.focus()
  })
  document.querySelectorAll('.rank-picker button').forEach(b =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.rank-picker button').forEach(x => x.setAttribute('aria-pressed', x === b))
      draw(+b.dataset.rank)
    })
  )
}

const renderBestiary = () => {
  const rows = G.mobs.map(m => {
    return {
      attrs: `data-name="${esc(m.name.toLowerCase())}" data-role="${m.role}" data-el="${m.element}"`,
      cells: [
        mobLink(m.id),
        elTag(m.element),
        [`${m.lvl[0]}–${m.lvl[1]}`, 'num'],
        `<span class="tag ${m.role}">${m.role}</span>`,
        encounterOf(m.id).how,
        encounterOf(m.id).where,
      ],
    }
  })
  return `<h1>Bestiary</h1>
    <p class="lede">Every mob in the game data, with its element, level range and where it spawns. Click a mob for its spells, resistances and drops.</p>
    <div class="filters"><input id="mob-q" type="search" placeholder="Filter by name" aria-label="Filter mobs by name">
      <select id="mob-role" aria-label="Filter by role"><option value="">All roles</option>${[...new Set(G.mobs.map(m => m.role))].map(r => `<option>${r}</option>`).join('')}</select>
      <select id="mob-el" aria-label="Filter by element"><option value="">All elements</option>${['earth', 'fire', 'water', 'air'].map(e => `<option>${e}</option>`).join('')}</select></div>
    ${table(['Mob', 'Element', ['Level', 'num'], 'Role', 'Encounter', ['Where', '', false]], rows, { sortable: true, stack: true })}
    <p>Roles: <b>normal</b> mobs roam in packs; <b>archi</b> mobs swap in for a pack member ${ARCHI} of the time; <b>boss</b> mobs guard dungeons; <b>protectors</b> ambush ${AMBUSH} of gathers of the resource they guard. See <a href="#/encounters">how you meet mobs</a>.</p>`
}
const mountBestiary = () => {
  const apply = () => {
    const q = $('#mob-q').value.trim().toLowerCase()
    const r = $('#mob-role').value
    const e = $('#mob-el').value
    document.querySelectorAll('tbody tr').forEach(tr => {
      tr.hidden = (q && !tr.dataset.name.includes(q)) || (r && tr.dataset.role !== r) || (e && tr.dataset.el !== e)
    })
  }
  ;['#mob-q', '#mob-role', '#mob-el'].forEach(s => $(s).addEventListener('input', apply))
}

const mobSpells = m => m.spells.map((sp, i) => spellHtml({ name: sp.name, unlock: 1, levels: sp.levels }, 1, `mob:${m.id}`, i).replace('From level 1. ', '')).join('') || '<p>No spells.</p>'
// the clip manifest loads once; mob cards are drawn without clips first, then again with them
const mountMobSpells = async id => {
  if (!SPELL_CLIPS) SPELL_CLIPS = await fetch('assets/spells/index.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}))
  const box = $('#mob-spells')
  if (box?.isConnected && mob(id)) box.innerHTML = mobSpells(mob(id))
}

const renderMob = id => {
  const m = mob(id)
  if (!m) return notFound()
  const s = spawnsOf(id)
  const dz = dungeonsWith(id)
  const res = Object.entries(m.res)
    .map(([k, v]) => `<div><span>${titleCase(k)} res.</span><b class="el-${k}">${v > 0 ? '+' : ''}${v}%</b></div>`)
    .join('')
  return `<p class="crumbs"><a href="#/bestiary">Bestiary</a></p>
    <div class="art-hero">${pic('mob', [m.id], 'hero-art', m.name)}<div><h1>${esc(m.name)}</h1>
    <p class="lede">${m.role === 'normal' ? 'A' : `A ${m.role}`} ${elTag(m.element)} mob, level ${m.lvl[0]}–${m.lvl[1]}.</p></div></div>
    <div class="stat-strip"><div><span>HP (base)</span><b>${m.hp}</b></div><div><span>AP</span><b>${m.ap}</b></div><div><span>MP</span><b>${m.mp}</b></div><div><span>Agility</span><b>${m.agility}</b></div><div><span>Wisdom</span><b>${m.wisdom}</b></div><div><span>XP</span><b>${m.xp}</b></div>${res}</div>
    ${guardOf(id) ? `<div class="callout tip"><p><strong>Resource guardian.</strong> It doesn't roam. It ambushes ${AMBUSH} of ${itemLink(guardOf(id).item_type)} gathers (${jobName(guardOf(id).job)} level ${guardOf(id).level}+) in a solo fight.</p></div>` : ''}
    <h2 id="where">Where it lives</h2>
    <p>${s.length ? s.map(where).join('; ') + '.' : m.role === 'archi' ? `It never spawns on its own. When a zone rolls its packs, each ${orList(archiStandIns(id).map(x => mobLink(x.id)))} has a ${ARCHI} chance to be this archimob instead, so look wherever those roam. See <a href="#/encounters#archi">archimobs</a>.` : guardOf(id) ? `It only appears through the gathering ambush above. See <a href="#/encounters#protectors">protectors</a>.` : 'It does not spawn in the open world.'}${archiFor(id) && s.length ? ` In a pack, each one has a ${ARCHI} chance to be its archimob ${mobLink(archiFor(id).id)} instead.` : ''}${dz.length ? ` It also appears in ${dz.map(d => `<a href="#/dungeons#${d.dungeon}">${titleCase(d.dungeon)}</a>`).join(', ')}.` : ''}</p>
    ${s.some(x => x.cities?.length) ? `<div class="callout tip"><p><strong>City mob.</strong> ${s.some(x => x.cities?.length && !x.biomes?.length) ? `It spawns in the ${[...new Set(s.flatMap(x => x.cities ?? []))].map(cityName).join(', ')} city area and nowhere else in the open world.` : `Besides its biomes, it's one of the few mobs that spawn inside the ${[...new Set(s.flatMap(x => x.cities ?? []))].map(cityName).join(', ')} city area.`} See <a href="#/regions">regional spawn rules</a>.</p></div>` : ''}
    ${s.some(x => x.world === 'nauvis') ? '<figure class="spawn-map" id="spawn-map"></figure>' : ''}
    <h2 id="drops">Drops</h2>
    ${m.loot.length ? table(['Item', ['Chance', 'num'], ['Qty', 'num']], [...m.loot].sort((a, b) => b.chance_bp - a.chance_bp).map(l => [itemLink(l.item_type), [pct(l.chance_bp), 'num'], [l.min_qty === l.max_qty ? l.min_qty : `${l.min_qty}–${l.max_qty}`, 'num']])) : '<p>No drops.</p>'}
    <h2 id="spells">Spells</h2>
    <div id="mob-spells">${mobSpells(m)}</div>
    <p>Resistances: positive numbers cut that element's damage (capped at 50%), negative numbers make it take extra.</p>
    <p>${official('bestiary', m.id)}</p>`
}

// Where a mob can spawn around Thebes: each zone's biome (scripts/render-zone-grid.mjs --name nauvis-area)
// against the mob's spawn rows. Inside a city area only rows tagged with that city count (regional rules).
let AREA = null
const mountSpawnMap = async id => {
  const box = $('#spawn-map')
  if (!box) return
  AREA ??= await fetch('assets/minimap/nauvis-area.json').then(r => (r.ok ? r.json() : null)).catch(() => null)
  if (!AREA || !box.isConnected) return box.remove()
  const rows = spawnsOf(id).filter(x => x.world === 'nauvis')
  const { span, cities, biomes } = AREA
  const n = span * 2 + 1
  const cityAt = (x, z) => cities.find(c => x >= c.x && x < c.x + c.w && z >= c.z && z < c.z + c.h)
  const cells = []
  const misses = []
  biomes.forEach((row, j) =>
    row.forEach((b, i) => {
      const x = i - span
      const z = j - span
      const c = cityAt(x, z)
      if (c ? rows.some(r => r.cities?.includes(c.id)) : rows.some(r => r.biomes.includes(b))) cells.push([i, j])
      else misses.push([i, j])
    })
  )
  const name = mob(id).name
  const far = [...new Set(rows.flatMap(r => r.cities ?? []))].filter(c => !cities.some(x => x.id === c))
  const farNote = far.length ? ` Further out, it also spawns around ${far.map(cityName).join(' and ')}.` : ''
  if (!cells.length) {
    box.outerHTML = `<p>None of its spawn zones are within ${span} zones of the centre.${farNote}</p>`
    return
  }
  const gate = span + (50000 % 512) / 512
  box.innerHTML = `<div class="sm-map"><img src="assets/minimap/nauvis-area.webp" alt="" width="1000" height="1000">
    <svg viewBox="0 0 ${n} ${n}" role="img" aria-label="${esc(name)} can spawn in ${cells.length} of the ${n * n} zones around Thebes">
      <g class="sm-dim">${misses.map(([i, j]) => `<rect x="${i}" y="${j}" width="1" height="1"/>`).join('')}</g>${cells.map(([i, j]) => `<rect class="sm-hit" x="${i}" y="${j}" width="1" height="1"/>`).join('')}
      ${cities.map(c => `<rect class="sm-city" x="${c.x + span}" y="${c.z + span}" width="${c.w}" height="${c.h}"/>`).join('')}
      <circle class="sm-gate" cx="${gate}" cy="${gate}" r="0.28"/>
    </svg>${cities.map(c => `<b class="sm-label" style="left:${((c.x + span + c.w / 2) / n) * 100}%;top:${((c.z + span + c.h) / n) * 100}%">${cityName(c.id)}</b>`).join('')}</div>
    <figcaption>Highlighted zones are where ${esc(name)} can spawn, within ${span} zones (about ${((span * 512) / 1000).toFixed(1)}k blocks) of the Star Gate (green dot). The gold box is the Thebes city area. Each square is one zone, from ${-span}, ${-span} to ${span}, ${span}. A zone's packs are rolled when it's searched, so a highlighted zone may not have one right now.${farNote}</figcaption>`
}

const renderItems = () => `<h1>Item finder</h1>
  <p class="lede">Type an item to see how to get it: craft it, loot it from a mob, or gather it in a biome.</p>
  <div class="filters"><input id="item-q" type="search" placeholder="e.g. gnawed branch, wheat, key" aria-label="Find an item">
  <select id="item-cat" aria-label="Filter by category"><option value="">All categories</option>${[...new Set(Object.values(G.items).map(i => i.category))].sort().map(c => `<option value="${c}">${titleCase(c)}</option>`).join('')}</select></div>
  ${table(['Item', 'Category', ['Level', 'num'], ['How to get it', '', false]], [], { sortable: true, stack: true, bodyId: 'item-rows' })}`
const mountItems = () => {
  const entries = Object.entries(G.items).sort((a, b) => (a[1].level ?? 0) - (b[1].level ?? 0) || a[1].name.localeCompare(b[1].name))
  const draw = () => {
    const q = $('#item-q').value.trim().toLowerCase()
    const c = $('#item-cat').value
    const hits = entries.filter(([id, i]) => (!q || i.name.toLowerCase().includes(q) || id.includes(q)) && (!c || i.category === c)).slice(0, 80)
    $('#item-rows').innerHTML = hits
      .map(([id, i]) => tableRow([itemLink(id), titleCase(i.category), [i.level ?? '', 'num'], shortSources(id)]))
      .join('') || '<tr><td colspan="4">No item matches. Try a shorter word.</td></tr>'
    labelCells($('#item-rows'))
  }
  ;['#item-q', '#item-cat'].forEach(s => $(s).addEventListener('input', draw))
  draw()
}

const itemLede = (id, i) => {
  const g = gatherOf(id)
  if (g) return `Resource, <b>${jobName(g.job)} level ${g.level}</b>.`
  const r = rareParent(id)
  if (r) return `Rare resource, <b>${jobName(r.job)} level ${r.level}</b>. Each ${itemLink(r.item_type)} gather has a ${RARE} chance to give one as a bonus.`
  if (i.contents) return `A bag that opens into ${contentsOf(id)}.`
  if (i.pet) return `A pet. Fully fed, it gives ${Object.entries(i.pet.stats).map(([k, [lo, hi]]) => `<b>+${lo === hi ? hi : `${lo}–${hi}`} ${PET_STAT[k] ?? titleCase(k)}</b>`).join(' and ')}.`
  return `${titleCase(i.category)}${i.level ? `, item level ${i.level}` : ''}.`
}

const renderItem = id => {
  const i = G.items[id]
  if (!i) return notFound()
  const used = usedIn(id)
  return `<p class="crumbs"><a href="#/items">Item finder</a></p>
    <div class="art-hero">${pic('itemhd', [id], 'hero-art item-art', i.name)}<div><h1>${esc(i.name)}</h1>
    <p class="lede">${itemLede(id, i)}</p></div></div>
    <h2 id="get">How to get it</h2>${sourcesHtml(id)}
    ${gatherOf(id) || rareParent(id) ? guardianHtml(gatherOf(id) ?? rareParent(id)) : ''}
    ${i.pet ? petHtml(i) : ''}
    ${used.length ? `<h2 id="used">Used to craft</h2>${cellList(used.map(r => `${itemLink(r.output_type)} <small>${r.inputs[id]} needed, ${jobName(r.job)}</small>`), 'cols')}` : ''}
    <p>${official('items', id)}</p>`
}

// Pets grow from nothing to their full stats over 60 feeds, one per UTC day; each stat is
// rolled × feeds / 60, rounded down (pet.move, item_stats.move scale_from_center).
const PET_STAT = { action: 'AP', movement: 'MP', range: 'Range', critical: 'Critical', raw_damage: 'Damage', earth_resistance: 'Earth res.', fire_resistance: 'Fire res.', water_resistance: 'Water res.', air_resistance: 'Air res.' }
const petHtml = i => {
  const stats = Object.entries(i.pet.stats)
  const at = (v, n) => Math.trunc((v * n) / 60)
  const name = k => PET_STAT[k] ?? titleCase(k)
  const feeds = [0, 1, 10, 20, 30, 40, 50, 60]
  const first = stats.map(([k, [, max]]) => [k, Array.from({ length: 60 }, (_, n) => n + 1).find(n => at(max, n) !== 0)])
  const food = i.pet.foods.map(itemLink)
  const petId = Object.keys(G.items).find(k => G.items[k] === i)
  const rolled = stats.filter(([, [lo, hi]]) => lo !== hi)
  return `<h2 id="pet">Feeding and growth</h2>
    <p>A new pet has none of its stats yet. Each feed adds 1/60 of its full stats, and you can feed it <b>once per UTC day</b>, so it reaches full power after <b>60 feeds</b>, about two months. It eats ${food.length ? orList(food) : 'nothing in the data'}. The pet keeps its feed count if you sell or trade it.</p>
    ${i.pet.foods.map(f => WIDGETS['drop-flow'](f, { out: 'Pet food', tail: petId })).join('')}
    ${i.pet.foods.every(f => recipeOf(f) && Object.keys(recipeOf(f).inputs).every(rareParent)) ? `<p>Each food ingredient is a golden rare: every gather of the resource on the left has a ${RARE} chance to give one as a bonus. Sixty feeds take 60 of each.</p>` : ''}
    ${rolled.length ? `<p>Its stats are rolled when it's made: ${rolled.map(([k, [lo, hi]]) => `${name(k)} ${lo}–${hi}`).join(', ')}. The table uses the top of each range.</p>` : ''}
    ${table(['Feeds', ...stats.map(([k]) => [name(k), 'num'])], feeds.map(n => [`${n}${n === 60 ? ' (full)' : ''}`, ...stats.map(([, [, max]]) => [`${at(max, n) > 0 ? '+' : ''}${at(max, n)}`, 'num'])]))}
    <p>Each stat rounds down, so ${first.map(([k, n]) => `${name(k)} gives its first point on feed ${n}`).join(' and ')}. Equip a pet and press <kbd>X</kbd> to ride it, 1.5× faster than walking.</p>`
}

const notFound = () => `<h1>Page not found</h1><p>That page does not exist. Use the sidebar or press <kbd>/</kbd> to search.</p>`

/* ---------- router ---------- */
const loadFragment = async slug => {
  if (!fragments.has(slug)) {
    const res = await fetch(`pages/${slug}.html`)
    fragments.set(slug, res.ok ? await res.text() : null)
  }
  return fragments.get(slug)
}

const fillWidgets = root => {
  root.querySelectorAll('[data-widget]').forEach(n => {
    const w = WIDGETS[n.dataset.widget]
    n.outerHTML = w ? w(n.dataset.arg) : `<p>Unknown widget ${esc(n.dataset.widget)}</p>`
  })
  // <a data-link="mob:nook">: a named link with its game icon.
  root.querySelectorAll('[data-link]').forEach(n => {
    const [kind, id] = n.dataset.link.split(':')
    n.outerHTML = kind === 'mob' ? mobLink(id) : itemLink(id)
  })
  root.querySelectorAll('img[data-art]').forEach(n => {
    const [kind, id] = n.dataset.art.split(':')
    n.src = artUrl(kind, id)
    n.classList.add('art', 'ico')
    n.alt ??= ''
  })
}


/* ---------- crafting tools ---------- */
const recipeJobs = () => [...new Set(G.recipes.map(r => r.job))].sort()
const itemOptions = () =>
  `<datalist id="item-names">${Object.entries(G.items)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([, i]) => `<option value="${esc(i.name)}">`)
    .join('')}</datalist>`
const idByName = name => {
  const n = name.trim().toLowerCase()
  return Object.keys(G.items).find(id => G.items[id].name.toLowerCase() === n || id === n) ?? null
}

const viewSwitch = here =>
  `<nav class="view-switch" aria-label="Recipe views">${[['recipes', 'Table'], ['recipe-map', 'Map']].map(([slug, label]) => `<a href="#/${slug}"${slug === here ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`
const renderRecipes = () => `<h1>Recipe list</h1>${viewSwitch('recipes')}
  <p class="lede">All ${G.recipes.length} recipes in the game data. Search by what you want to make or by an ingredient you have.</p>
  <div class="filters"><input id="rc-q" type="search" placeholder="Item or ingredient, e.g. wheat" aria-label="Search recipes">
  <select id="rc-job" aria-label="Filter by job"><option value="">All jobs</option>${recipeJobs().map(j => `<option value="${j}">${jobName(j)}</option>`).join('')}</select></div>
  ${table(['Makes', 'Job', ['Level', 'num'], ['Success', 'num'], ['Ingredients', '', false]], [], { sortable: true, stack: true, bodyId: 'rc-rows' })}
  <p>Job level is set by how many different ingredients a recipe has. Success is the chance at exactly that level; it rises 0.5% per level after that, up to 99%.</p>`
const mountRecipes = () => {
  const rows = G.recipes
    .map(r => ({ r, lvl: craftLevel(r), text: [r.output_type, item(r.output_type).name, ...Object.keys(r.inputs).flatMap(k => [k, item(k).name])].join(' ').toLowerCase() }))
    .sort((a, b) => a.r.job.localeCompare(b.r.job) || a.lvl - b.lvl || item(a.r.output_type).name.localeCompare(item(b.r.output_type).name))
  const draw = () => {
    const q = $('#rc-q').value.trim().toLowerCase()
    const j = $('#rc-job').value
    $('#rc-rows').innerHTML =
      rows
        .filter(x => (!q || x.text.includes(q)) && (!j || x.r.job === j))
        .map(({ r, lvl }) => tableRow([itemLink(r.output_type), jobName(r.job), [lvl, 'num'], [`${craftSuccess(lvl)}%`, 'num'], ingredientList(r)]))
        .join('') || '<tr><td colspan="5">No recipe matches.</td></tr>'
    labelCells($('#rc-rows'))
  }
  ;['#rc-q', '#rc-job'].forEach(x => $(x).addEventListener('input', draw))
  draw()
}

// Recipe map: every item placed by how many crafts it sits from raw materials (its longest chain),
// most-used first in each column. Lines run from ingredient to product.
const MAP_TIERS = ['Raw materials', '1 craft away', '2 crafts away', '3 crafts away', '4 crafts away']
const recipeTiers = () => {
  const depth = {}
  const d = id => (depth[id] ??= recipeOf(id) ? 1 + Math.max(...Object.keys(recipeOf(id).inputs).map(d)) : 0)
  const uses = {}
  for (const r of G.recipes) for (const k of Object.keys(r.inputs)) uses[k] = (uses[k] ?? 0) + 1
  const ids = [...new Set(G.recipes.flatMap(r => [r.output_type, ...Object.keys(r.inputs)]))]
  const tiers = MAP_TIERS.map(() => [])
  for (const id of ids) tiers[d(id)].push(id)
  for (const t of tiers) t.sort((a, b) => (uses[b] ?? 0) - (uses[a] ?? 0) || item(a).name.localeCompare(item(b).name))
  return { tiers, uses }
}
const renderRecipeMap = () => {
  const { tiers, uses } = recipeTiers()
  const node = id => {
    const n = uses[id] ?? 0
    return `<button class="rm-node" data-id="${esc(id)}" title="${esc(item(id).name)}${n ? `, used in ${n} recipe${n > 1 ? 's' : ''}` : ''}">${pic('item', [id], 'ico')}<span>${esc(item(id).name)}</span>${n ? `<small>${n}</small>` : ''}</button>`
  }
  return `<h1>Recipe map</h1>${viewSwitch('recipe-map')}
  <p class="lede">All ${G.recipes.length} recipes on one map. Raw materials are on the left; each column to the right is one more craft away. In every column the items used in the most recipes come first, and the small number is how many recipes use it.</p>
  <div class="filters"><input id="rm-q" list="item-names" placeholder="Find an item, e.g. Water" aria-label="Find an item on the map"></div>${itemOptions()}
  <div class="rm-info" id="rm-info" aria-live="polite"></div>
  <div class="rm-wrap"><div class="rm" id="rm"><svg class="rm-edges" id="rm-edges" aria-hidden="true"></svg>
  ${tiers.map((t, i) => `<div class="rm-col"><div class="rm-head">${MAP_TIERS[i]} <small>${t.length}</small></div>${t.map(node).join('')}</div>`).join('')}
  </div></div>`
}
const mountRecipeMap = () => {
  const map = $('#rm')
  const svg = $('#rm-edges')
  const info = $('#rm-info')
  const nodes = Object.fromEntries([...map.querySelectorAll('.rm-node')].map(n => [n.dataset.id, n]))
  const usedBy = {}
  const edges = G.recipes.flatMap(r =>
    Object.keys(r.inputs).map(k => {
      ;(usedBy[k] ??= []).push(r.output_type)
      return { from: k, to: r.output_type }
    }),
  )
  const NS = 'http://www.w3.org/2000/svg'
  for (const e of edges) svg.appendChild((e.el = document.createElementNS(NS, 'path')))
  const layout = () => {
    const box = map.getBoundingClientRect()
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`)
    for (const e of edges) {
      const a = nodes[e.from].getBoundingClientRect()
      const b = nodes[e.to].getBoundingClientRect()
      const x1 = a.right - box.left
      const y1 = a.top + a.height / 2 - box.top
      const x2 = b.left - box.left
      const y2 = b.top + b.height / 2 - box.top
      const dx = Math.max(24, (x2 - x1) / 2)
      e.el.setAttribute('d', `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`)
    }
  }
  const closure = (id, next) => {
    const seen = new Set()
    const walk = x => (next(x) ?? []).forEach(y => seen.has(y) || (seen.add(y), walk(y)))
    walk(id)
    return seen
  }
  let locked = null
  const show = id => {
    map.classList.toggle('focus', !!id)
    for (const n of Object.values(nodes)) n.classList.remove('sel', 'up', 'down')
    for (const e of edges) e.el.removeAttribute('class')
    if (!id) {
      info.innerHTML = 'Pick an item to see what it takes (<span class="rm-key up">blue</span>) and what it leads to (<span class="rm-key down">copper</span>).'
      return
    }
    const r = recipeOf(id)
    const up = closure(id, x => (recipeOf(x) ? Object.keys(recipeOf(x).inputs) : []))
    const down = closure(id, x => usedBy[x])
    nodes[id].classList.add('sel')
    up.forEach(x => nodes[x].classList.add('up'))
    down.forEach(x => nodes[x].classList.add('down'))
    for (const e of edges) {
      const cls = (e.to === id || up.has(e.to)) && up.has(e.from) ? 'up' : (e.from === id || down.has(e.from)) && down.has(e.to) ? 'down' : null
      if (cls) e.el.setAttribute('class', cls), svg.appendChild(e.el)
    }
    const raws = [...up].filter(x => !recipeOf(x)).length
    const direct = usedBy[id]?.length ?? 0
    info.innerHTML = `${itemLink(id)} ${
      r ? `${jobName(r.job)} level ${craftLevel(r)}. Made from ${ingredientsInline(r)}${raws ? `, ${raws} raw material${raws > 1 ? 's' : ''} in all` : ''}.` : 'A raw material.'
    } ${direct ? `Used in ${direct} recipe${direct > 1 ? 's' : ''}${down.size > direct ? `, ${down.size} items further down the line` : ''}.` : 'Nothing is made from it.'}${
      r ? ` <a href="#/planner/${encodeURIComponent(id)}">Plan it</a>` : ''
    }${locked ? ' <button class="btn rm-clear" type="button">Clear</button>' : ''}`
  }
  const ingredientsInline = r => Object.entries(r.inputs).map(([k, n]) => `${n} × ${esc(item(k).name)}`).join(', ')
  const pick = id => {
    locked = locked === id ? null : id
    show(locked)
  }
  map.addEventListener('click', e => {
    const n = e.target.closest('.rm-node')
    if (n) pick(n.dataset.id)
  })
  map.addEventListener('mouseover', e => {
    const n = e.target.closest('.rm-node')
    if (n && !locked) show(n.dataset.id)
  })
  map.addEventListener('mouseleave', () => locked || show(null))
  info.addEventListener('click', e => e.target.closest('.rm-clear') && pick(locked))
  $('#rm-q').addEventListener('change', e => {
    const id = idByName(e.target.value)
    if (!id || !nodes[id]) return
    locked = null
    pick(id)
    nodes[id].scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  })
  addEventListener('keydown', function esc(e) {
    if (!map.isConnected) return removeEventListener('keydown', esc)
    if (e.key === 'Escape' && locked) pick(locked)
  })
  new ResizeObserver(layout).observe(map)
  layout()
  show(null)
}

const renderCraftWith = () => `<h1>What can I craft with…</h1>
  <p class="lede">Add the items you have. Recipes that use them show up below, the ones you're closest to finishing first.</p>
  <div class="filters"><input id="cw-q" list="item-names" placeholder="Add an item, e.g. Wheat" aria-label="Add an item you have"><button id="cw-add" class="btn">Add</button></div>
  ${itemOptions()}
  <div id="cw-have" class="chips"></div>
  <div id="cw-out"></div>`
const mountCraftWith = () => {
  const have = new Set()
  const draw = () => {
    $('#cw-have').innerHTML = [...have].map(id => `<button class="chip" data-id="${id}" aria-label="Remove ${esc(item(id).name)}">${esc(item(id).name)} ✕</button>`).join('')
    $('#cw-have').querySelectorAll('button').forEach(b => b.addEventListener('click', () => (have.delete(b.dataset.id), draw())))
    if (!have.size) return ($('#cw-out').innerHTML = '<p>Nothing added yet. Try Wheat, Water or Quartz.</p>')
    const hits = G.recipes
      .map(r => {
        const ins = Object.keys(r.inputs)
        const got = ins.filter(k => have.has(k))
        return { r, ins, got, missing: ins.filter(k => !have.has(k)) }
      })
      .filter(x => x.got.length)
      .sort((a, b) => a.missing.length - b.missing.length || craftLevel(a.r) - craftLevel(b.r))
    const ready = hits.filter(x => !x.missing.length).length
    $('#cw-out').innerHTML = `<p><b>${hits.length}</b> recipes use ${have.size > 1 ? 'these items' : 'this item'}; you have every ingredient for <b>${ready}</b>. Quantities aren't checked.</p>${table(
      ['Makes', 'Job', ['Have', 'num'], 'Still missing'],
      hits.map(({ r, ins, got, missing }) => [
        itemLink(r.output_type),
        `<span class="nowrap">${jobName(r.job)} ${craftLevel(r)}</span>`,
        [`${got.length}/${ins.length}`, 'num'],
        missing.length ? countList(missing.map(k => [k, r.inputs[k]]), itemLink) : '<b>nothing</b>',
      ]),
      { stack: true }
    )}`
    enhanceTables($('#cw-out'))
  }
  const add = () => {
    const id = idByName($('#cw-q').value)
    if (id) have.add(id), ($('#cw-q').value = ''), draw()
  }
  $('#cw-add').addEventListener('click', add)
  $('#cw-q').addEventListener('keydown', e => e.key === 'Enter' && add())
  $('#cw-q').addEventListener('change', add)
  draw()
}

// Expands a target into every craft and raw material it needs (the recipe graph has no cycles). Each intermediate's total need is
// summed before its attempts are rounded up, and attempts are divided by the success rate.
const craftPlan = (target, qty, levels) => {
  const order = []
  const seen = new Set()
  const visit = id => {
    if (seen.has(id)) return
    const r = recipeOf(id)
    if (r) for (const k of Object.keys(r.inputs)) visit(k)
    seen.add(id)
    order.push(id)
  }
  visit(target)
  const need = { [target]: qty }
  const crafts = []
  const raw = []
  for (const id of [...order].reverse()) {
    const n = need[id] ?? 0
    if (!n) continue
    const r = recipeOf(id)
    if (!r) {
      raw.push({ id, n })
      continue
    }
    const min = craftLevel(r)
    const lvl = Math.max(min, levels[r.job] || 0)
    const rate = craftSuccess(lvl)
    const attempts = Math.ceil(n / (rate / 100))
    crafts.push({ id, r, n, min, lvl, rate, attempts })
    for (const [k, m] of Object.entries(r.inputs)) need[k] = (need[k] ?? 0) + m * attempts
  }
  return { crafts: crafts.reverse(), raw }
}
const rawHow = (id, n) => {
  const g = gatherOf(id)
  const spots = resourceSpawns(id)
  if (g) return `Gather: <b>${jobName(g.job)} ${g.level}</b>${spots.length ? ` in ${spots.map(where).join('; ')}` : ''}`
  // Prefer mobs you can farm (normal pack mobs) over archimobs, bosses and guardians.
  const farmable = x => (x.mob.role === 'normal' && spawnsOf(x.mob.id).length ? 1 : 0)
  const d = dropsOf(id).sort((a, b) => farmable(b) - farmable(a) || b.chance_bp * (b.min_qty + b.max_qty) - a.chance_bp * (a.min_qty + a.max_qty))
  if (d.length) {
    const best = d[0]
    const per = (best.chance_bp / 10_000) * ((best.min_qty + best.max_qty) / 2)
    return `Loot: ${mobLink(best.mob.id)} drops it ${pct(best.chance_bp)}, so about <b>${Math.ceil(n / per).toLocaleString()}</b> kills${d.length > 1 ? ` <small>(or ${d.slice(1, 3).map(x => mobLink(x.mob.id)).join(', ')})</small>` : ''}`
  }
  const bag = Object.entries(G.items).find(([, i]) => i.contents?.some(c => c.item_type === id))
  if (bag) return `Comes in ${itemLink(bag[0])}`
  return 'No recipe, drop or gathering spot in the data: buy it or check the item page'
}

const renderPlanner = id => `<h1>Craft planner</h1>
  <p class="lede">Pick something to make. The planner breaks it down to raw resources, adds extra attempts for failed crafts, and lists the steps in the order you'd do them.</p>
  <div class="filters"><input id="pl-q" list="item-names" placeholder="What do you want to make? e.g. Key of the Gilded Lorito" aria-label="Item to craft" value="${id && G.items[id] ? esc(G.items[id].name) : ''}">
  <label class="inline">How many <input id="pl-n" type="number" min="1" max="999" value="1"></label></div>
  ${itemOptions()}
  <div id="pl-levels" class="filters"></div>
  <div id="pl-out"></div>`
const mountPlanner = () => {
  const levels = {}
  const draw = () => {
    const id = idByName($('#pl-q').value)
    const qty = Math.max(1, Math.min(999, +$('#pl-n').value || 1))
    if (!id) return ($('#pl-out').innerHTML = '<p>Type an item name and pick it from the list.</p>'), ($('#pl-levels').innerHTML = '')
    if (!recipeOf(id)) return ($('#pl-out').innerHTML = `<p>${itemLink(id)} has no recipe. ${rawHow(id, qty)}.</p>`), ($('#pl-levels').innerHTML = '')
    history.replaceState(null, '', `#/planner/${encodeURIComponent(id)}`)
    const p = craftPlan(id, qty, levels)
    const jobs = [...new Set(p.crafts.map(c => c.r.job))]
    $('#pl-levels').innerHTML = `<span>Your job levels (blank = the minimum):</span>${jobs
      .map(j => `<label class="inline">${jobName(j)} <input type="number" min="1" max="100" data-job="${j}" value="${levels[j] ?? ''}" placeholder="${Math.max(...p.crafts.filter(c => c.r.job === j).map(c => c.min))}"></label>`)
      .join('')}`
    $('#pl-levels').querySelectorAll('input').forEach(inp =>
      inp.addEventListener('change', () => ((levels[inp.dataset.job] = +inp.value || 0), draw()))
    )
    const gatherJobs = Object.entries(
      p.raw.reduce((a, { id: r }) => {
        const g = gatherOf(r)
        if (g) a[g.job] = Math.max(a[g.job] ?? 0, g.level)
        return a
      }, {})
    )
    const craftJobs = jobs.map(j => [j, Math.max(...p.crafts.filter(c => c.r.job === j).map(c => c.min))])
    $('#pl-out').innerHTML = `<h2 id="needs">What you need</h2>
      <p>Jobs: ${Object.entries([...gatherJobs, ...craftJobs].reduce((a, [j, l]) => ((a[j] = Math.max(a[j] ?? 0, l)), a), {}))
        .map(([j, l]) => `<b>${jobName(j)} ${l}</b>`)
        .join(', ')}.</p>
      <h2 id="gather">1. Collect the raw materials</h2>
      ${table(['Material', ['Qty', 'num'], 'How to get it'], p.raw.sort((a, b) => item(a.id).name.localeCompare(item(b.id).name)).map(({ id: r, n }) => [itemLink(r), [n.toLocaleString(), 'num'], rawHow(r, n)]), { stack: true })}
      <h2 id="steps">2. Craft, in this order</h2>
      ${table(
        [['Step', 'num'], 'Make', ['Need', 'num'], ['Attempts', 'num'], 'Job (success)', 'Each attempt uses'],
        p.crafts.map((c, i) => [[i + 1, 'num'], itemLink(c.id), [c.n, 'num'], [c.attempts, 'num'], `${jobName(c.r.job)} ${c.lvl} (${c.rate}%)`, ingredientList(c.r)]),
        { stack: true }
      )}
      <p>Attempts are the need divided by the success rate, rounded up, so they cover an average run of luck. Real batches can land a little above or below. Drop counts use base odds; Chance in a party raises them.</p>`
    enhanceTables($('#pl-out'))
  }
  ;['#pl-q', '#pl-n'].forEach(x => $(x).addEventListener('change', draw))
  $('#pl-q').addEventListener('input', () => idByName($('#pl-q').value) && draw())
  draw()
}

let lastSlug = null // the page before a class page, for its back link
const route = async () => {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, anchor] = raw.split('#')
  const [kind, id] = path.split('/')
  const slug = kind || 'welcome'
  const art = $('#article')
  let html
  let mount = null
  if (slug === 'class') (html = renderClass(id)), (mount = () => mountClass(id))
  else if (slug === 'mob') (html = renderMob(id)), (mount = () => (mountSpawnMap(id), mountMobSpells(id)))
  else if (slug === 'item') html = renderItem(decodeURIComponent(id ?? ''))
  else if (slug === 'bestiary') (html = renderBestiary()), (mount = mountBestiary)
  else if (slug === 'items') (html = renderItems()), (mount = mountItems)
  else if (slug === 'recipes') (html = renderRecipes()), (mount = mountRecipes)
  else if (slug === 'recipe-map') (html = renderRecipeMap()), (mount = mountRecipeMap)
  else if (slug === 'craft-with') (html = renderCraftWith()), (mount = mountCraftWith)
  else if (slug === 'planner') (html = renderPlanner(decodeURIComponent(id ?? ''))), (mount = mountPlanner)
  else html = (await loadFragment(slug)) ?? notFound()

  art.innerHTML = html + nextPrev(slug)
  if (slug !== 'class') lastSlug = slug
  art.classList.toggle('wide', slug === 'recipe-map')
  fillWidgets(art)
  mount?.()
  enhanceTables(art)
  mountLive(art)
  decorateHeadings(art)
  makeSortable(art)
  buildToc(art)
  markNav(slug === 'class' ? `class/${id}` : slug)
  document.title = `${art.querySelector('h1')?.textContent ?? 'Guide'} · Nauvis Field Guide`
  const fromNav = document.body.classList.contains('nav-open')
  setNav(false, false)
  if (fromNav) art.focus({ preventScroll: true })
  if (anchor) document.getElementById(anchor)?.scrollIntoView()
  else window.scrollTo(0, 0)
}

const nextPrev = slug => {
  const i = FLAT.findIndex(p => p.slug === slug)
  if (i < 0) return ''
  const prev = FLAT[i - 1]
  const next = FLAT[i + 1]
  return `<nav class="next-prev" aria-label="Previous and next page">${prev ? `<a href="#/${prev.slug === 'welcome' ? '' : prev.slug}"><span>Previous</span><b>${prev.title}</b></a>` : ''}${next ? `<a class="next" href="#/${next.slug}"><span>Next</span><b>${next.title}</b></a>` : ''}</nav>`
}

const decorateHeadings = root =>
  root.querySelectorAll('h2, h3').forEach(h => {
    if (h.closest('.sp, .class-hero')) return
    if (!h.id) h.id = slugify(h.textContent)
    h.insertAdjacentHTML('beforeend', `<a class="anchor" href="${location.hash.split('#').slice(0, 2).join('#')}#${h.id}" aria-label="Link to this section">#</a>`)
  })

const buildToc = root => {
  const hs = [...root.querySelectorAll('h2[id], h3[id]')].filter(h => !h.closest('.sp'))
  const toc = $('#toc')
  if (hs.length < 2) return (toc.innerHTML = '')
  const base = location.hash.split('#').slice(0, 2).join('#')
  toc.innerHTML = `<h2>On this page</h2>${hs.map(h => `<a class="${h.tagName === 'H3' ? 'sub' : ''}" href="${base}#${h.id}">${esc(h.childNodes[0]?.textContent || h.textContent.replace(/#$/, ''))}</a>`).join('')}`
}

const makeSortable = root =>
  root.querySelectorAll('table[data-sortable]').forEach(t =>
    t.querySelectorAll('th[data-sort]').forEach(th => {
      th.tabIndex = 0
      th.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), th.click()))
      th.addEventListener('click', () => {
        const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending'
        t.querySelectorAll('th').forEach(x => x.removeAttribute('aria-sort'))
        th.setAttribute('aria-sort', dir)
        const body = t.tBodies[0]
        const val = tr => {
          const s = tr.cells[th.cellIndex]?.textContent.trim() ?? ''
          const n = parseFloat(s)
          return isNaN(n) ? s.toLowerCase() : n
        }
        ;[...body.rows]
          .sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * (dir === 'ascending' ? 1 : -1))
          .forEach(r => body.appendChild(r))
      })
    })
  )

const buildNav = () => {
  $('#sidebar').innerHTML = NAV.map(g => {
    const tag = g.steps ? 'ol' : 'ul'
    const links = g.pages.map(([slug, title]) => `<li><a class="nav-link" data-slug="${slug}" href="#/${slug === 'welcome' ? '' : slug}">${title}</a></li>`).join('')
    const classes = g.classes
      ? `<li><ul class="nav-sub">${G.classes.map(c => `<li><a class="nav-link" data-slug="class/${c.id}" href="#/class/${c.id}">${titleCase(c.id)} <small>${esc(c.title ?? '')}</small></a></li>`).join('')}</ul></li>`
      : ''
    return `<section class="nav-group"><h2>${g.group}</h2><${tag}>${links}${classes}</${tag}></section>`
  }).join('')
}
const markNav = slug =>
  document.querySelectorAll('.nav-link').forEach(a => (a.dataset.slug === slug ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')))

/* ---------- search ---------- */
let INDEX = []
const buildIndex = async () => {
  const pages = await Promise.all(
    FLAT.filter(p => !DATA_PAGES.has(p.slug)).map(async p => {
      const html = (await loadFragment(p.slug)) ?? ''
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const heads = [...doc.querySelectorAll('h2, h3')].map(h => ({ title: h.textContent.trim(), id: h.id || slugify(h.textContent) }))
      return [
        { title: p.title, kind: 'Guide', href: `#/${p.slug}`, text: doc.body.textContent.replace(/\s+/g, ' ').slice(0, 4000) },
        ...heads.map(h => ({ title: h.title, kind: p.title, href: `#/${p.slug}#${h.id}`, text: '' })),
      ]
    })
  )
  INDEX = [
    ...pages.flat(),
    ...G.classes.map(c => ({ title: `${titleCase(c.id)} (${c.title})`, kind: 'Class', href: `#/class/${c.id}`, text: c.spells.map(s => s.name).join(', ') })),
    ...G.classes.flatMap(c => c.spells.map(s => ({ title: s.name, kind: `${titleCase(c.id)} spell`, href: `#/class/${c.id}#spell-${slugify(s.name)}`, text: `Level ${s.unlock}` }))),
    ...G.mobs.map(m => ({ title: m.name, kind: 'Mob', href: `#/mob/${m.id}`, text: `${m.element} ${m.role} level ${m.lvl[0]}-${m.lvl[1]}` })),
    ...Object.entries(G.items).map(([id, i]) => ({ title: i.name, kind: 'Item', href: `#/item/${id}`, text: `${titleCase(i.category)} ${id.replace(/_/g, ' ')}` })),
    ...G.worlds.flatMap(w => w.biomes.map(b => ({ title: biomeName(b), kind: 'Biome', href: `#/map#biome-${b}`, text: `${titleCase(w.id)} biome` }))),
  ].map(e => ({ ...e, lt: e.title.toLowerCase(), lx: e.text.toLowerCase() }))
}

const search = q => {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const scored = []
  for (const e of INDEX) {
    let score = 0
    for (const t of terms) {
      if (e.lt === t) score += 12
      else if (e.lt.startsWith(t)) score += 8
      else if (e.lt.includes(t)) score += 5
      else if (e.lx.includes(t)) score += 1
      else {
        score = 0
        break
      }
    }
    if (score) scored.push([score + (e.kind === 'Guide' ? 1 : 0), e])
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 30).map(x => x[1])
}

const snippet = (e, q) => {
  if (!e.text) return ''
  const i = e.lx.indexOf(q.toLowerCase().split(/\s+/)[0])
  return i < 0 ? e.text.slice(0, 110) : (i > 40 ? '…' : '') + e.text.slice(Math.max(0, i - 40), i + 90)
}

const initSearch = () => {
  const dlg = $('#search-dialog')
  const input = $('#search-input')
  const out = $('#search-results')
  let sel = 0
  let hits = []
  let back = null
  const open = () => {
    back = document.activeElement
    dlg.hidden = false
    document.body.classList.add('search-open')
    input.value = ''
    draw()
    input.focus()
  }
  const close = () => {
    dlg.hidden = true
    document.body.classList.remove('search-open')
    ;(back?.isConnected && back !== document.body ? back : $('#search-trigger')).focus()
  }
  const draw = () => {
    const q = input.value.trim()
    hits = search(q)
    sel = 0
    out.innerHTML = q
      ? hits.length
        ? hits.map((h, i) => `<li role="option" id="sr-${i}" aria-selected="${i === 0}"><a href="${h.href}"><span>${esc(h.title)}</span><em>${esc(h.kind)}</em>${h.text ? `<small>${esc(snippet(h, q))}</small>` : ''}</a></li>`).join('')
        : '<li class="empty">Nothing matches. Try one word, like “hoe” or “desert”.</li>'
      : '<li class="empty">Search guide pages, classes, spells, mobs, items and biomes.</li>'
    hits.length && q ? input.setAttribute('aria-activedescendant', 'sr-0') : input.removeAttribute('aria-activedescendant')
  }
  const move = d => {
    const lis = out.querySelectorAll('li[role=option]')
    if (!lis.length) return
    lis[sel].setAttribute('aria-selected', 'false')
    sel = (sel + d + lis.length) % lis.length
    lis[sel].setAttribute('aria-selected', 'true')
    input.setAttribute('aria-activedescendant', lis[sel].id)
    lis[sel].scrollIntoView({ block: 'nearest' })
  }
  input.addEventListener('input', draw)
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1))
    if (e.key === 'ArrowUp') (e.preventDefault(), move(-1))
    if (e.key === 'Enter' && hits[sel]) ((location.hash = hits[sel].href), close())
  })
  // Esc from anywhere in the dialog; Tab cycles between the field and the result links.
  dlg.addEventListener('keydown', e => {
    if (e.key === 'Escape') return close()
    if (e.key !== 'Tab') return
    const f = [input, ...out.querySelectorAll('a')]
    const i = f.indexOf(document.activeElement)
    if (e.shiftKey ? i <= 0 : i === f.length - 1) (e.preventDefault(), f[e.shiftKey ? f.length - 1 : 0].focus())
  })
  out.addEventListener('click', e => e.target.closest('a') && close())
  dlg.addEventListener('click', e => e.target === dlg && close())
  $('#search-trigger').addEventListener('click', open)
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)
    if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key === 'k')) (e.preventDefault(), open())
  })
}

/* ---------- data ---------- */
// A local data/game.json (from scripts/build-data.mjs) wins; otherwise build from GitHub in the browser.
const loadGameData = async () => {
  const local = await fetch('data/game.json').catch(() => null)
  if (local?.ok) return local.json()
  const art = $('#article')
  art.innerHTML = '<p class="loading">Reading the latest game data from the public source repository…</p>'
  const { buildGameData, latestTag, rawReader } = await import('./source.js')
  const ref = await latestTag()
  return buildGameData(rawReader(ref), `github.com/aresrpg/aresrpg@${ref}`)
}

/* ---------- live chain reads (Sui GraphQL, read-only) ---------- */
const GQL = 'https://graphql.mainnet.sui.io/graphql'
const CHARACTER_TYPE = '0x427af9b0d1cc5145a5112bd5b473dd615d48b5389de296eb7c512afdec160e1d::character::Character'
const gql = async (query, variables) => {
  const res = await fetch(GQL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })
  const body = await res.json()
  if (body.errors) throw new Error(body.errors[0].message)
  return body.data
}
const liveCharacters = async () => {
  const q = `query($t:String!,$a:String){objects(first:50,after:$a,filter:{type:$t}){pageInfo{hasNextPage endCursor}nodes{asMoveObject{contents{json}}}}}`
  const out = []
  let after = null
  for (let page = 0; page < 20; page++) {
    const d = await gql(q, { t: CHARACTER_TYPE, a: after })
    out.push(...d.objects.nodes.map(n => n.asMoveObject?.contents?.json).filter(Boolean))
    if (!d.objects.pageInfo.hasNextPage) break
    after = d.objects.pageInfo.endCursor
  }
  return out
}
const mountLive = root =>
  root.querySelectorAll('[data-live="class-split"]').forEach(async n => {
    try {
      const chars = await liveCharacters()
      const by = {}
      for (const c of chars) by[c.classe] = (by[c.classe] ?? 0) + 1
      const rows = Object.entries(by).sort((a, b) => b[1] - a[1])
      const max = rows[0]?.[1] ?? 1
      n.innerHTML = `<p>Right now there are <b>${chars.length}</b> characters on chain. How they split by class:</p>
        ${rows.map(([c, k]) => `<div class="cost-row"><a href="#/class/${c}">${titleCase(c)}</a><div class="cost-bar"><span class="bar-accent" style="width:${(k / max) * 100}%">${k}</span></div></div>`).join('')}
        <p class="cost-legend">Read live from Sui just now. Popularity says nothing about strength; it shows which classes you'll find partners for.</p>`
    } catch (e) {
      n.innerHTML = `<p class="cost-legend">Live character counts are unavailable right now (${esc(e.message)}).</p>`
    }
  })

/* ---------- boot ---------- */
// Mobile drawer: scrim, Esc and tap-outside close; focus goes in on open and back to the menu button on close.
const setNav = (open, moveFocus = true) => {
  const was = document.body.classList.contains('nav-open')
  document.body.classList.toggle('nav-open', open)
  $('#menu-btn').setAttribute('aria-expanded', open)
  $('#nav-scrim').hidden = !open
  if (!moveFocus || was === open) return
  if (open) ($('#sidebar .nav-link[aria-current]') ?? $('#sidebar .nav-link'))?.focus()
  else $('#menu-btn').focus()
}
const initChrome = () => {
  $('#theme-btn').addEventListener('click', () => {
    const dark = getComputedStyle(document.documentElement).colorScheme === 'dark'
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('fg-theme', next)
    } catch {}
  })
  $('#menu-btn').addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')))
  $('#nav-scrim').addEventListener('click', () => setNav(false))
  document.addEventListener('keydown', e => e.key === 'Escape' && document.body.classList.contains('nav-open') && setNav(false))
}

const boot = async () => {
  initChrome()
  try {
    G = await loadGameData()
  } catch (e) {
    $('#article').innerHTML = `<h1>Game data didn't load</h1><p>The guide reads the game's public source from GitHub, and that request failed: <code>${esc(e.message)}</code>. Check your connection and reload. To work offline, run <code>node scripts/build-data.mjs</code> once.</p>`
    return
  }
  artRef = G.source.match(/@(\S+)$/)?.[1] ?? (await import('./source.js').then(m => m.latestTag()).catch(() => 'edge'))
  $('#data-stamp').textContent = `Game data read ${G.generated_at.slice(0, 10)} from ${G.source}.`
  buildNav()
  initSearch()
  window.addEventListener('hashchange', route)
  await route()
  buildIndex()
}
boot()
