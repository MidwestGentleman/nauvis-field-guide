# Nauvis Field Guide design system

Maintenance reference for `assets/style.css`, `assets/app.js` and `pages/*.html`. The site is quiet on purpose: paper background, ink text, one accent (copper), and element colours only where an element is meant. The voxel cube is the one loud mark.

Rule of thumb: **use a token, use a helper, and reuse an existing component before you add a new one.** If you have to add one, log it here.

## Tokens

All tokens live on `:root` at the top of `assets/style.css`. Colours are defined three times: light (default), `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme='light'])`, and `:root[data-theme='dark']` (the theme button). **If you change a dark value, change it in both dark blocks.**

### Colour

| Token | Use |
|---|---|
| `--paper` | Page background, text on copper fills |
| `--surface` | Cards, tables, inputs |
| `--sunk` | Table headers, chips, code, recessed panels |
| `--ink` | Body text |
| `--muted` | Secondary text, labels, captions |
| `--line` | Every border and divider |
| `--copper` / `--copper-soft` | Links, the accent, current nav item, "down"/product direction |
| `--moss` / `--moss-soft` | `.callout.tip`, heal tags |
| `--warn` / `--warn-soft` | `.callout.warn`, debuff tags |
| `--earth` `--fire` `--water` `--air` `--neutral` | Game elements only (`.el-*`, `.sp-*`, element web). `--water` doubles as the "up"/ingredient direction on the recipe map |
| `--focus` | Focus ring |
| `--on-fill` / `--on-fill-ink` | White or fixed-dark text on solid data fills. A fill picks one by setting `--fill-text` |
| `--cost-0`…`--cost-5`, `--cost-n-text` | Stat-cost bar, cheap (green) to expensive (red), each with its text colour |
| `--art-glow` | Backdrop behind portraits and hero art |
| `.b-<biome>` classes | Biome palette (data colours, same in both themes). Only place biome hexes live. Light fills (plains, desert, ice peaks) set `--fill-text: var(--on-fill-ink)` |

Don't write hex values in rules or in JS template strings. If a new colour is needed, add a token in all three blocks.

**Contrast floor (WCAG AA):** every text colour must reach 4.5:1 on `--paper`, `--surface` and `--sunk` in both themes (3:1 for text ≥24px or ≥18.7px bold, and for UI marks). Fills that carry text need 4.5:1 against their text colour; prefer ink text on a light fill over darkening the fill. Check new values before committing (the audit has the method).

### Type

Fonts: `--font-display` (Chakra Petch: headings, labels, numbers on buttons) and `--font-body` (Atkinson Hyperlegible: everything else). Body is `--fs-body` 17px / 1.62.

| Token | Size | Typical use |
|---|---|---|
| `--fs-2xs` | 11.5px | Spell spec captions, rank button labels, cost-bar labels |
| `--fs-xs` | 12px | Tags, `kbd`, stat-strip labels, data stamp |
| `--fs-sm` | 13px | Table headers, nav/TOC group labels, legends, footer |
| `--fs-md` | 14px | Captions, secondary card text, breadcrumbs, mobile tables |
| `--fs-lg` | 15px | Tables, filters, nav links, buttons |
| `--fs-body` | 17px | Running text |

Headings inside `.article` use a 1.25 rem scale: h1 2.44rem (1.95rem under 860px), h2 1.56rem with a top rule, h3 1.25rem, h4 1rem body-bold. **Label style** (small caps-like section labels: nav groups, TOC title, `th`, `.rm-head`, `.stat-strip span`) is `600 var(--fs-sm) var(--font-display)` in `--muted`.

Numbers in tables, specs and rank buttons use `font-variant-numeric: tabular-nums`.

### Spacing, radius, elevation

| Token | Value |
|---|---|
| `--sp-1`…`--sp-6` | 4, 8, 12, 16, 24, 32px |
| `--r-xs` | 4px: cost bars, biome chips, code |
| `--r-sm` | 6px: buttons, inputs, nav links, rm nodes |
| `--r-md` | 8px: tables, callouts, stat strips, info bars |
| `--r-lg` | 10px: cards (class, art, boss, choice), spell icon |
| `--r-xl` | 12px: hero art, search panel, spell card outer corners |
| `--r-pill` | 999px: tags, chips |
| `--shadow-pop` | Search panel |
| `--shadow-drawer` | Mobile nav drawer |
| `--scrim` | Search backdrop |

Spacing tokens are new; existing rules still use literal px on the same 4px grid. Use tokens in new rules and convert old ones when you touch them. Vertical rhythm in prose uses `em` (e.g. `margin: 1.2em 0` on tables, figures, galleries).

### Breakpoints

| Width | What changes |
|---|---|
| ≤1200px | TOC column hidden; sidebar 260px |
| ≤860px | Single column; sidebar becomes a drawer (`body.nav-open`); search collapses to an icon; touch sizing (36px targets, 16px fields) |
| ≤760px | Spell card stacks: head, clip + specs, effects, ranks |
| ≤560px | Hero art stacks; boss card stops floating; rank picker gets its own row; table cells 6×8px at 14px; `stack` tables become cards |
| ≤420px | "Play the game" button hidden |

Test at 375px. The page itself must never scroll sideways; only `.table-wrap` and `.rm-wrap` may.

## Components

Each entry: what it is for, how to make it, and the rules. "Helper" means the function in `assets/app.js`.

### Page chrome
- **Top bar** `.topbar` (index.html): brand, `.search-trigger`, `.icon-btn` theme toggle, `.play-link`. Buttons are 38px. Don't add more buttons; at 375px there is room for exactly menu + brand + search + theme.
- **Sidebar** `.sidebar` / `.nav-group` / `.nav-link` / `.nav-sub`, built by `buildNav()` from `NAV`. Numbered groups (`steps: true`) render as `<ol>` with CSS counters. Current page: `aria-current="page"`. Mobile: drawer opened with `setNav(true)`; `#nav-scrim` behind it, Esc or tapping outside closes it, focus goes to the current link and back to the menu button, body scroll is locked (`body.nav-open`). Links are 36px.
- **TOC** `#toc`, built by `buildToc()` from `h2[id]`/`h3[id]` (skips spell cards). Needs at least 2 headings. Hidden ≤1200px.
- **Heading anchors** `.anchor`, added by `decorateHeadings()`. Hover/focus only.
- **Next/previous** `.next-prev`, from `nextPrev()` on NAV pages only.
- **Breadcrumb** `.crumbs`: one link back to the list page on detail pages (`renderMob`, `renderItem`, `renderClass`).
- **Search** `.search-dialog` / `.search-panel`: `initSearch()`, index from `buildIndex()`. Modal: backdrop click and Esc close it, Tab is trapped between the field and the results, focus returns to where it was, body scroll is locked (`body.search-open`). The field is a combobox using `aria-activedescendant` (`#sr-<i>`). New page types must add entries to `INDEX`.

### Text blocks
- **Lede** `p.lede`: one per page, right under the h1. Muted, 1.2rem.
- **Callout** `.callout.tip` (do this), `.callout.warn` (can't undo / costs something), `.callout.official` (quoting the game). Start with `<strong>Short claim.</strong>`. Don't use callouts for plain asides.
- **Steps** `ol.steps`: a real numbered sequence (onboarding, the First hour chapters). Each `li` has an `h3`.
- **Flow** `ol.flow` (written in the page, see account.html): a numbered how-to with a connecting line; `.flow-step` holds a bold title, then paragraphs, `h4` subheads and widgets; `.flow-fork` lays out alternative choices as cards (stack on phones).
- **Wallet chip** `.wallet-chip` (`wallet` widget, `data-arg="2.48|1,250"` for SUI|KARES): a replica of the game's HUD wallet button. It keeps the game's own colours in both themes on purpose.
- **Funds window** `.funds-window` (`funds-window` widget; `data-arg="address copied"` for just the address button after a click): a replica of the game's Add funds window built from AddFundsModal.tsx and account.css, game colours in both themes. The address is a made-up hash that no one holds a key for, and the page says not to send to it. `data-arg="sui:0"` sets the balance. Icons come from `lucide(name)`; the example address is `EXAMPLE_ADDRESS`.
- **Class overview** `.class-overview` / `.co-card` (`class-overview` widget, Create your character): per class both portraits, a hand-written line from `CLASS_SUMMARY` (recheck when a release changes a class's spells), a bar splitting its damaging spells by element (`spellSplit(c)` minus `none`), and the level-1 spells. Class pages link back to the page you came from (`lastSlug`).
- **Drop flow** `.drop-flow` (`drop-flow` widget, `data-arg="old_hoe"`): mob → drop % → ingredient (need n) → craft → item, built from the recipe and drop tables (lowest-level dropper, then best odds). Stacks vertically on phones.
- **Wallet popup** `.wallet-pop` (`wallet-popover` widget, `data-arg="SUI|KARES"`): the popup under the wallet button, with Add funds ringed.
- **Send diagram** `.send-diagram` (`send-diagram` widget): exchange → arrow → game address; stacks vertically on phones.
- **Choice** `.choice`: two side-by-side options with `h4`s; stacks ≤860px.
- **Figure** `.art-figure` (`figure` widget, `data-arg="scene:thebes|Caption"`): one big picture. `.wide` for scenes and worlds.

### Inline atoms
- **Item/mob link** `a.ilink`: always via `itemLink(id)` / `mobLink(id)` (icon + name, no wrap). In fragments use `<a data-link="item:wheat"></a>`. Never hand-write `#/item/...` links with names.
- **Element** `.el.el-<element>` via `el(e)` or `elTag(e)` (adds "neutral"). Cube + coloured bold word.
- **Tag** `.tag`: the one pill. Variants: mob roles `.boss` (copper), `.archi` (gold), `.protector` (moss), `.normal` (plain); spell kinds `.buff` (copper), `.debuff` (gold), `.heal` (moss). Used in bestiary/encounters role columns and spell card subtitles.
- **Biome chip** `.biome-chip.b-<biome>` via `biomeChip(b)`: links to the biome row on the map page.
- **kbd**, **code**: keys and formulas.
- **Inline count prose**: in a sentence, write `2 × item, 3 × item` (spaced ×, comma joined), as `contentsOf()` does. Anywhere that is a list rather than a sentence, use `countList`.

### Lists
- **Count list** `ul.ing` via `countList(entries, link)` / `ingredientList(recipe)`: aligned "3×" column + icon + link. Use for recipe ingredients, dungeon room mobs, key recipes, craft-with "still missing". Works in a table cell and in prose (no bullets, no indent).
- **Cell list** `ul.cell-list` via `cellList(items, 'cols'?)`: unbulleted list with `<small>` notes (levels, %, job levels) and `.city-tag`; `.cols` for two columns; nests for grouped sources (`shortSources`). Returns `—` when empty. Used by biome, archimob, region and element tables, the item finder, the recipe widget and item “Used to craft”.
- Never join links with `<br>` or commas in a table cell; use a cell list or count list. Comma joins are for sentences only.

### Tables
- **Always** build with `table(head, rows, opts)`. A head entry is `'Label'`, `['Label', 'num']` or `['Label', '', false]` (not sortable). A row is an array of cells (string or `[html, 'num']`) or `{ cells, attrs }` for row data attributes. Options: `sortable`, `stack`, `bodyId` (empty tbody to fill later; redraw rows with `tableRow()` then call `labelCells(tbody)`). Output is wrapped in `.table-wrap`.
- `num` columns: right-aligned tabular numbers; a leading `num` column (Step, Room) shrinks to fit. Level, Qty, Chance, Need, Attempts, Step, Room are always `num`.
- Headers stay one line on sortable tables (`white-space: nowrap`); keep header text short.
- Sorting: `{ sortable: true }` or `table[data-sortable]` + `th[data-sort]`. `makeSortable()` makes headers focusable (Enter/Space) and sets `aria-sort`.
- Hand-written tables in fragments: wrap in `<div class="table-wrap">`, use `class="num"` on numeric cells.
- **Biome table** `.biome-table`: grouped rows (`.biome-row` header row with a biome chip, then a content row). Pattern for "section header inside a table".
- **Stacked on phones:** `{ stack: true }` turns each row into a card under 560px. The first cell is the card title (a leading `num` cell like Step becomes a “Step 1” kicker); every other cell shows its header from `data-label`, which `enhanceTables()` sets after each route (call it, or `labelCells`, after redrawing). Sortable headers become “Sort by” pills. Use `stack` for any table with 4+ columns or a long text column; keep it off short 2–3 column tables.
- **Edge fade:** any other `.table-wrap` that really overflows gets `.fade-r` / `.fade-l` (mask) from `enhanceTables()`; it updates on scroll and resize. `code` in cells wraps.
- Put the identifying column first.

### Data display
- **Stat strip** `.stat-strip`: a row of `<div><span>Label</span><b>Value</b></div>` for key numbers (mob stats, dungeon facts). Wraps on mobile.
- **Cost bar** `.cost-row` / `.cost-bar` (class page stat ladders, live class split): label column 150px + segmented bar. Segment colours from `--cost-*`; an accent bar uses `span.bar-accent`. `.cost-legend` for the note under it.
- **Biome grid** `.biome-grid` / `.biome-tile` (`biome-grid` widget): 3×3 climate tiles.
- **Element web** `.element-web` (`element-web` widget): SVG with `--c` per edge/node.

### Cards
- **Class card** `.class-card` (`class-grid` widget): portrait, name, title, element cubes.
- **Art card** `.art-card` (`gallery` widget, `data-arg="mob:tinker,item:old_hoe"`): picture + name; a link when the thing has a page.
- **Boss card** `.boss-card`: floated picture card next to a dungeon or guardian section. Stops floating ≤560px.
- **Minimap card** `.minimap-card` (`minimap-gallery` widget).
- **Hero** `.art-hero` (mob/item pages: 150px art + h1 + lede) and `.class-hero` (two portraits). Art backdrop is `--art-glow`.
- Card rules: `--surface`, 1px `--line` border, `--r-lg`, hover border `--copper` when the card is a link.

### Spell card `.sp`
Rendered only by `spellHtml(spell, rank, classId, index)` (class pages via `mountClass`; mob pages via `mountMobSpells` with the class id `mob:<mob id>`, which drops the icon and picks the mob's clip). A spell with one level (every mob spell) gets no rank row. Grid areas `head / main / side / ranks`; element tint via `.sp-<element>` setting `--c`. Parts: `.sp-head` (icon, h3, `.sp-sub` with `.stag`s), `.sp-main` (`.sp-fx` effect list, `.sp-scale` notes, `.sp-crit` details), `.sp-side` (`.sp-clip` video or empty state, `.sp-plate` = `.sp-area` diagram + `.sp-specs` dl), `.sp-ranks` (per-card rank buttons, `aria-pressed`). Global `.rank-picker` redraws every card.
- Don't put extra content inside cards; extend `spellHtml`.
- Clips: `assets/spells/` and the render scripts are owned elsewhere; read the manifest through `clipFor()` only.
- Mobile ≤760px: one column, clip above effects, rank buttons three per row.

### Controls
- **Filters** `.filters`: the row above a list (search `input`, `select`s, `label.inline` for small number fields, a trailing `span` for notes). Inputs need an `aria-label`.
- **Button** `.btn`: the only generic button (Add, Clear). Don't style raw `button`s per page.
- **Chips** `.chips` > `button.chip`: removable selections (craft-with). Label with "Remove …".
- **View switch** `nav.view-switch` via `viewSwitch(here)`: segmented links between views of the same data (recipe table / map). `aria-current="page"` on the active one.
- **Rank buttons** `.rank-picker button`, `.sp-ranks button`: toggle groups using `aria-pressed`.
- Touch (≤860px): all of the above are at least 36px tall; filter fields are 16px so iOS doesn't zoom.

### Recipe map `.rm*`
`renderRecipeMap()` + `mountRecipeMap()`. `.rm-wrap` scrolls; `.rm` is a 5-column grid of `.rm-node` buttons with an SVG `.rm-edges` layer drawn from node rects (redrawn by a ResizeObserver). `.rm-info` is the sticky, `aria-live` explanation bar; `.rm-key.up/.down` colour words match the edges (water = ingredients, copper = products). Escape clears.

## How to add a page

1. Write `pages/<slug>.html`: start with `<h1>`, then `<p class="lede">`. Use `h2` for sections (they get anchors and a TOC entry automatically), plain `p`/`ul`, callouts, and `data-widget` placeholders for anything data-driven.
2. Add `['<slug>', 'Nav title']` to the right group in `NAV` (`assets/app.js`). It gets next/previous links and search indexing for free.
3. Data page instead of a fragment: add `renderX()` (returns HTML) and optional `mountX()` (wires events), add the slug to `DATA_PAGES`, and route it in `route()`.
4. Data page with tables: build them with `table()`; if you redraw rows on input, call `enhanceTables()` on the container afterwards.
5. Check at 375px and desktop, both themes: no sideways page scroll, no console errors, `node --check assets/app.js`.

## How to add a widget

1. Add a function to `WIDGETS` returning HTML. Take one string argument (`data-arg`) and split it yourself (`|` for caption, `,` for lists, `:` for kind:id).
2. Build from helpers: `table`, `countList`, `itemLink`/`mobLink`, `pic`, `el`, `biomeChip`, `stat-strip` markup. Only add CSS if no component fits; if you do, add tokens-only rules near the related block and log the component above.
3. Images go through `pic(kind, args, class, alt)`: `alt=""` when the name is printed next to it, a real alt when the picture stands alone. They remove themselves on error.
4. Use it in a fragment: `<div data-widget="name" data-arg="..."></div>`.

### Zone grid and spawn map
- `zone-grid` (Map and biomes): zones −3 to 3 over `assets/minimap/zone-grid.webp`, labelled like the in-game world map, Thebes box and Star Gate on top.
- Spawn map (every mob page with a Nauvis spawn): `assets/minimap/nauvis-area.webp` plus `nauvis-area.json` (each zone's biome, ±12 zones). Zones the mob can't use are dimmed; city zones count only for mobs tagged with that city.
- Both images come from `scripts/render-zone-grid.mjs` (see `scripts/README-spell-clips.md`).

### Pet growth
Pet item pages add "Feeding and growth": the food (with its recipe), a feeds × stats table (0, 1, 10 … 60) using rolled × feeds / 60 rounded down, and the feed on which each stat gives its first point. Pet data (`pet.foods`, `pet.stats`) comes from `assets/source.js`.

### Stat cost bars
`costRows` draws a "Points in stat" axis (0 to the cap in quarters) above the bars.
