# Design audit, 2026-10-30

Scope: every NAV route, plus `mob/tinker`, `mob/protector_amber`, `item/wheat`, `item/old_hoe`, `class/yajin`, `class/shugo`, `planner/key_of_gilded_lorito`, `craft-with` with an item added, `dungeons`, `map`. Checked at 375px (mobile emulation) and desktop, in dark and light. Components and rules are in [design-system.md](design-system.md).

Result after fixes: no page scrolls sideways at 375px or desktop, no console errors, `node --check assets/app.js` passes.

**37 fixed, 7 proposed.** Round 1 fixed 27; round 2 (D approved the top five proposals on 10-30) fixed #24–29, M5, M6, M9 and A1. Severity: **H** = broken or fails accessibility, **M** = inconsistent or makes maintenance harder, **L** = cosmetic.

## Findings

| # | Issue | Where | Sev | Fix | Status |
|---|---|---|---|---|---|
| 1 | Dead `.spell`, `.spell-head`, `.spell-meta`, `.spell-unlock`, `.spell .crit` rules left over from before the `.sp` redesign | style.css "Spell list" | M | Removed | fixed |
| 2 | Dead `.spell-ico` | style.css | L | Removed | fixed |
| 3 | `Effects.meta()` (old spell meta line) unused; `describe`/`meta` destructured but unused | effects.js, app.js:2 | L | Removed | fixed |
| 4 | `th` declared twice; `.sp-specs div` declared twice | style.css | L | Merged | fixed |
| 5 | Redundant fallbacks `var(--neutral, #8a959b)`, `var(--focus, var(--c))`; `.art-gallery {display` formatting | `.sp`, `.sp-ranks` | L | Cleaned | fixed |
| 6 | 11 different hard-coded font sizes incl. half pixels (11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 17…) | style.css, ~40 rules | M | Type scale `--fs-2xs…--fs-body`; half pixels rounded to the nearest step | fixed |
| 7 | 8 different hard-coded radii (4, 6, 8, 9, 10, 12, 999) | style.css | M | `--r-xs…--r-pill`; minimap 9px → 10px | fixed |
| 8 | Shadows and the search scrim as raw rgba | `.search-panel`, drawer, `.search-dialog` | L | `--shadow-pop`, `--shadow-drawer`, `--scrim` | fixed |
| 9 | `#fff` text on fills | `.cost-bar span`, `.biome-tile`, `.biome-chip` | L | `--on-fill` | fixed |
| 10 | Same radial art backdrop written 3 times with slightly different stops | `.class-card .portrait`, `.class-hero .portrait`, `.hero-art` | L | `--art-glow` | fixed |
| 11 | Stat-cost colours hard-coded as a hex array in JS | `renderClass` | M | `--cost-0…5` tokens, JS uses `var(--cost-n)` | fixed |
| 12 | Live class split bar: inline `background:var(--copper)` with white text, 2.4:1 in dark mode | `mountLive`, classes page | H | `span.bar-accent` with `--paper` text (7.4:1) | fixed |
| 13 | Inline `style="margin:0"` on the class lede | `renderClass` | L | `.class-hero .lede` | fixed |
| 14 | Inline `style="color:var(--muted)"` on class titles in the nav | `buildNav` | L | `.nav-link small` | fixed |
| 15 | Dungeon key recipe as prose "2 × a, 3 × b" | `dungeon-list` widget | M | `ingredientList()` (count list) | fixed |
| 16 | Craft-with "Still missing" as comma prose | `mountCraftWith` | M | `countList()` | fixed |
| 17 | Recipe-map info bar wrote "2 Water" where everything else writes "2 × Water" | `mountRecipeMap` | L | Uses `n × name` | fixed |
| 18 | Planner "Step" column not `num` (Room column is) | `mountPlanner` | L | `['Step', 'num']` | fixed |
| 19 | Item page loot table "Level" not `num` (it is everywhere else) | `sourcesHtml` | L | `['Level', 'num']` | fixed |
| 20 | Count list outside a table picked up `.article ul` indent | `.ing` in prose | L | `.article .ing { padding-left: 0 }` + bottom margin | fixed |
| 21 | Sortable headers not reachable or usable by keyboard | `makeSortable` | H | `tabindex=0`, Enter/Space sort | fixed |
| 22 | Sort read the column by its index among *sortable* headers, not its real column (wrong column if a non-sortable header ever came first) | `makeSortable` | M | Uses `th.cellIndex` | fixed |
| 23 | Recipe map search scrolled smoothly even with reduced motion on | `mountRecipeMap` | M | `auto` when `prefers-reduced-motion: reduce` | fixed |
| 24 | Light `--air` text is 3.7:1 on paper, 3.3:1 on sunk (AA needs 4.5:1); `--neutral` 3.7:1 on sunk; earth, fire and water drop to 4.3–4.4:1 on `--sunk` (they pass on paper and surface) | `.el-*` (also inside table headers or sunk panels), `.sp` border | H | Light `--earth #806228`, `--fire #b73d28`, `--water #256d99`, `--air #307356`, `--neutral #5c6971`: all ≥4.5:1 on paper, surface, sunk and the soft callout fills. Dark values already passed | fixed |
| 25 | White text on light biome fills fails AA: plains 3.6, desert 3.2, ice peaks 3.1, blue steppe 4.3, highlands 4.4. Cost-bar labels on `--cost-2/3/4` are 3.2 to 4.0 | `.biome-chip`, `.biome-tile`, `.cost-bar` | H | Ink text on plains (lightened to `#7e933e`), desert and ice peaks; highlands `#6b767c`, frostfen `#537b82`, blue steppe `#587891` keep white text. Cost fills `--cost-0…5` with per-step `--cost-n-text` (ink on 1–4, white on 5). Text colour comes from `--fill-text` | fixed |
| 26 | Two pill components that nearly match: `.tag` (body font, 1px 7px) and `.stag` (display font, 0 7px) | bestiary role, encounters, spell cards | M | `.stag` removed; one `.tag` (display font) with `.boss`/`.buff` copper, `.archi`/`.debuff` gold, `.protector`/`.heal` moss | fixed |
| 27 | `.tag.protector` and `.tag.normal` have no variant, though boss and archi do | bestiary, encounters | L | Protector = moss, archi = gold, boss = copper | fixed |
| 28 | Bestiary, Item finder and Recipe list build `<table>` by hand (they need `data-*` row attributes or a `tbody` id), so they bypass `table()` | `renderBestiary`, `renderItems`, `renderRecipes` | M | `table()` takes `bodyId`, `{ cells, attrs }` rows, `tableRow()` for redraws, and `['Label', '', false]` for non-sortable heads; all three pages use it | fixed |
| 29 | Lists of links in cells joined with `<br>` or commas instead of a list component | `archi-table`, `region-table`, `element-web` table, item page "Used to craft", `shortSources` "dropped by" | M | New `cellList()` helper; archimob, region and element tables, item “Used to craft” (two columns) and `shortSources` (crafted / dropped by / gathered in, nested list) use it | fixed |
| 30 | Mob page spells: `spellHtml(...).replace('From level 1. ', '')` edits the output string, and mob cards get no icon or clip | `renderMob` | M | Add an `opts` argument (`{ unlock: false }`) to `spellHtml` | proposed |
| 31 | About 150 spacing literals not yet on `--sp-*` | style.css | L | Convert when a rule is touched; no visual change intended | proposed |
| 32 | Off-scale sizes: `.sp-fx li` 16.5px, `.steps h3` 1.12rem, `.choice h4` 1.05rem, `.brand-name` 19px, `.class-card b` 18px | style.css | L | Move to the scale (17px, 1.25rem…) or add a token | proposed |
| 33 | Dark colours are written twice (media query and `[data-theme='dark']`) | `:root` | M | Keep both in sync for now; later move to `light-dark()` (Safari 17.5+) | proposed |
| 34 | `.ing li { display: contents }` drops list semantics in Safari and VoiceOver | `countList` | M | Give `ul` `role="list"`, `li` `role="listitem"`, or move to `li { display: grid; grid-template-columns: subgrid }` | proposed |

## Mobile (375px)

| # | Issue | Where | Fix | Status |
|---|---|---|---|---|
| M1 | Filter inputs at 15px make iOS Safari zoom in on focus | `.filters input/select` (bestiary, items, recipes, map, craft-with, planner) | 16px at ≤860px | fixed |
| M2 | Tap targets under 36px: chips 31, view switch 30, rank picker 32, rank-less spell rank buttons (mob pages) 28, nav links 32, crit summary 23, recipe-map nodes 24 | various | 36px minimum at ≤860px (rank buttons 40, rm nodes 32) | fixed |
| M3 | Rank picker wrapped "6" onto a line of its own | class pages | Label gets its own row, six equal buttons at ≤560px | fixed |
| M4 | Tables used desktop cell padding (8×12px at 15px), pushing more of them into sideways scroll | all tables | 6×8px at 14px at ≤560px | fixed |
| M5 | 13 of 30 sampled pages have at least one table that scrolls sideways inside `.table-wrap` (bestiary, items, recipes, planner, encounters, regions, classes, combat, data, first-hour…), with no hint that it scrolls | `.table-wrap` | `table(..., { stack: true })` turns rows into labelled cards under 560px (labels from `data-label`, set by `labelCells()`); used by bestiary, items, recipes, craft-with, planner, item loot, recipe widget, class compare, guardian, archimob and region tables. Other tables get `.fade-l/.fade-r` edge fades only while they overflow (`enhanceTables()`); `code` in cells wraps. At 375px no table scrolls except the data-sources table on `data` (faded) | fixed |
| M6 | Sortable header row is 29px tall | sortable tables | Sortable tables are all stacked on phones; their headers become 36px “Sort by” pills | fixed |
| M7 | Inline links in the stat strip (dungeon key) are 19px tall; heading anchors only show on hover, so touch users never see them | `.stat-strip`, `.anchor` | Accept (inline text links), or show anchors faintly on touch | proposed |
| M8 | Cost-bar labels clip at narrow widths ("2 pt" cut on Intelligence) because the label threshold is a percentage | `renderClass` (`w > 9`) | Hide labels by pixel width, or keep them in the `title` only | proposed |
| M9 | Mobile nav drawer has no scrim or tap-outside close, and focus isn't moved into it | `.sidebar`, `initChrome` | `#nav-scrim`, tap-outside and Esc close, focus to the current link on open and back to the menu button on close (to the article after picking a page), body scroll locked | fixed |

No page scrolls sideways at 375px. Nothing is clipped except M8.

## Accessibility basics

| Area | Finding | Status |
|---|---|---|
| Focus visible | Global `:focus-visible` ring in `--focus`. `#search-input` shows a 2px `--focus` underline instead of an outline. `.article` is a programmatic focus target only. Sortable headers take focus | ok |
| Keyboard | Search: `/` and Cmd/Ctrl-K, arrows, Enter, Esc from anywhere in the dialog, Tab trapped between the field and result links, focus returned to where it was. Field is a `combobox` with `aria-activedescendant`. Drawer: Esc closes. Recipe map: nodes are buttons, Esc clears. Sorting fixed (#21) | ok (A1 fixed) |
| Contrast | Every text colour is ≥4.5:1 on paper, surface and sunk in both themes (checked with a script over all routes, both themes). Element-web node names (19px bold, large text) are ≥3.9:1 on their tinted circles | ok |
| Alt text | `pic()` uses an empty alt next to a printed name and a real alt for standalone art (hero, figure, portraits). Minimap images have alt text. `img[data-art]` defaults to an empty alt. Area diagrams have `role="img"` with an `aria-label` | ok |
| Reduced motion | Transitions off, spell clips get controls instead of autoplay, map scroll fixed (#23) | ok |
| Semantics | Skip link, `lang`, `aria-current` in the nav and view switch, `aria-pressed` on rank toggles, `aria-live` on the recipe-map info bar. See #34 for count lists | ok, #34 proposed |

A1 (fixed): focus trap, visible field focus, `aria-activedescendant`, body scroll lock while open.

## Still proposed

- #30 `spellHtml` options instead of string replacement on mob pages.
- #31, #32 spacing literals and off-scale sizes: convert when touched.
- #33 dark tokens written twice: move to `light-dark()` later.
- #34 count-list semantics (`display: contents`).
- M7 inline links in the stat strip, anchors hidden on touch.
- M8 cost-bar labels clip at narrow widths.
