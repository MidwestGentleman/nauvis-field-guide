# Nauvis Field Guide

Live at https://aresrpg.wiki

An unofficial, fan-made beginner guide and wiki for [AresRPG](https://aresrpg.world), the on-chain voxel MMORPG on Sui. It is not affiliated with or endorsed by the AresRPG team.

It's a static site with no build step and no dependencies.

- **Hand-written guide pages** live in `pages/*.html`: onboarding, map and biomes, regional rules, dungeons, choosing a class, combat, FAQ and glossary.
- **Data pages** are rendered in the browser from the game's public source: classes with all 240 spells, bestiary, item finder, spawn tables and dungeon rooms. On each visit the browser fetches the latest release of [aresrpg/aresrpg](https://github.com/aresrpg/aresrpg) from `raw.githubusercontent.com`, so the data follows game releases with no edits here.
- **Game art** (item, mob, spell and class pictures, stat icons, world screenshots) is loaded by the browser from the same release with `<img>` tags. No game image is stored in this repo. The one exception is `assets/minimap/`: small minimap views this guide renders itself, by running the game's map-drawing code on its world data (`bun scripts/render-minimaps.mjs`, needs a local clone). They are like screenshots, not copies of the game's files. Hand-written pages place art with `<div data-widget="figure" data-arg="scene:thebes|Caption">`, `<div data-widget="gallery" data-arg="mob:tinker,item:old_hoe">` or an inline `<img data-art="ui:action_star" alt="">`.
- **Spell clips** in `assets/spells/` are short videos this guide renders by running the game's own Fight lab locally: every class spell at every rank, and every mob spell. `scripts/README-spell-clips.md` explains how they're made and refreshed after a game release.
- **Live widgets** read Sui mainnet through the public GraphQL endpoint. They are read-only and never sign anything.

## Run it locally

```bash
python3 scripts/serve.py
```

Then open http://localhost:4321. The pages fetch files, so you need a local server; opening `index.html` directly won't work.

Optional offline cache (git-ignored, never commit or publish it):

```bash
node scripts/build-data.mjs                      # latest release
node scripts/build-data.mjs --src ../aresrpg-src # a local clone
```

## Layout

| Path | What |
|---|---|
| `index.html` | Shell: top bar, sidebar, article, search dialog |
| `assets/app.js` | Router, navigation, data pages, widgets, search, live chain reads |
| `assets/source.js` | Turns the game's source files into the site's data model (shared by the browser and Node) |
| `assets/effects.js` | Decodes raw spell effect rows into sentences |
| `assets/style.css` | Design tokens, light and dark themes, layout |
| `pages/*.html` | Hand-written articles. `<div data-widget="…">` placeholders are filled with live data. |
| `scripts/build-data.mjs` | Optional local cache builder |
| `scripts/render-tournament-shots.mjs` | Tournament window pictures in `assets/scenes/`, from the game's own UI test page (needs a local clone) |
| `scripts/deploy.mjs`, `deploy/` | Publish to Cloudflare |

## Deploy

The site is hosted on Cloudflare (Workers static assets). After `npx wrangler login`:

```bash
node scripts/deploy.mjs
```

It copies only `index.html`, `pages/` and `assets/` into `.dist/` and deploys that; `data/`, `scripts/` and `docs/` never ship. `--dry-run` builds `.dist/` without deploying.

## Licence

This repo's own code, writing and renders are MIT-licensed (see `LICENSE`). That covers nothing of AresRPG itself: its names, artwork, data and code belong to their creators.

## Licence note

The game's repository is source-available, and its licence forbids redistributing its files. This repo contains none of them, images included; the minimap renders in `assets/minimap/`, the stills in `assets/scenes/` and the spell clips in `assets/spells/` are pictures and videos this guide made, not files from the game. Data is fetched by the visitor's browser from the official repository, and the articles state facts in our own words. See `pages/data.html` for the full data-source evaluation.
