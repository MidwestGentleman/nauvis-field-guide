# Spell clips

`assets/spells/<class>-<spell-slug>-r<rank>.mp4` are in-game recordings of every class spell at every rank (12 classes × 20 spells × 6 ranks = 1,440). They're 480×270, 15 fps and about 4 s long. Each clip shows the spell's aiming overlay first: the cast range, the targetable cells and the area the spell hits. Then you see the cast, the effect and the damage or heal number. `assets/spells/index.json` maps `"<class>/<Spell Name>/<rank>"` to its file. Each entry also stores a fingerprint (`fp`) and the aresrpg-src commit it was rendered from (`src`).

`assets/spells/mob-<mob>-<spell-slug>.mp4` are the mob spells (146: every spell of the 68 mobs, one rank each), keyed `"mob:<mob_type>/<Spell Name>/1"`, shown on the mob pages' spell cards. The mob casts at a level-100 Shugo, on itself, or on a second mob of its kind for spells that only reach allies, the way the mob AI in `packages/fight/src/turns.ts` picks its target:

- The mob's kit is cut down to the one spell, with that spell's AP and no MP, so it casts from where it stands. The Shugo ends its turn and the game's own AI casts.
- The game shows no aiming overlay for a mob, so the renderer paints the mob's range, targetable cells and area with the same three overlay presets a player's aim uses.
- The game draws no spell effect for a mob cast either: the clip shows the mob's attack animation, the overlay, the number and any glyph or push.
- A mob heal goes only to a wounded mob of its side, and mobs start at full HP, so the Shugo hits that mob once with Natural Attack before the recording starts (Takoya, Mikami, Black Tide).

## Prerequisites

- A local clone of aresrpg/aresrpg at `../aresrpg-src` with its dependencies installed (`bun install`). Override the path with `--src`.
- `bun`, `ffmpeg` with libx264, and Playwright's Chromium headless shell. That last one comes with the clone's `@playwright/test`.
- A machine whose headless Chromium exposes WebGPU. The game renders only with WebGPU, so a Mac with Apple silicon works but a GPU-less CI runner doesn't.
- Nothing goes online. The recorder starts the clone's own Vite server on 127.0.0.1, uses the developer Fight lab (`/demo#fight`, a local simulator with no chain or wallet), and blocks every other request.

## After a game release (the one command)

```sh
git -C ../aresrpg-src pull            # the update never pulls by itself
bun scripts/update-spell-clips.mjs --dry-run   # what is stale and why
bun scripts/update-spell-clips.mjs --prune     # re-render stale + missing clips, drop removed spells
```

A clip counts as stale when its fingerprint changed. The fingerprint is a hash of:

- that rank's entry in `seed/content/spells.json` (AP, range, line/LOS, effects, area shape and size, unlock level)
- the spell's VFX row in `packages/engine/src/generated/claude_spell_source.js`
- the shared VFX sources (`seed/content/spell_effects/source.html`, `synth.js`)
- the mob's row in `mobs.json` (the foe for a class clip, the caster for a mob clip, plus the Shugo's class and level)
- the render settings (size, pad, fps, viewport, pre-roll, tail, max length, mob) and `SCRIPT_VERSION` in `render-spells-game.mjs`

Bump `SCRIPT_VERSION` whenever you change how the clips look. That re-renders everything.

Spells that failed before with the same fingerprint are skipped; add `--retry-failed` to try them again. Failures and their reasons are in `assets/spells/.meta/failures/`.

Other options:

- `--workers N` sets the number of workers, up to 4 because they share one GPU (default 3).
- `--class a,b` limits the run to those classes; `--mobs a,b` (or `all`) and `--family f,g` to those mobs. With none of them, a run covers every class spell and every mob spell.
- `--sheets-only` builds only the contact sheets.
- `--no-sheets` skips them.

Single clips: `bun scripts/render-spells-game.mjs --class yogan --spell "Magic Arrow" --rank 3`, or for a mob `bun scripts/render-spells-game.mjs --mobs crab --spell "Backwash"`.

## Checking the result

At the end, the update writes one contact sheet per class to `<logs>/sheets/sheet-<class>.png` and one per mob family to `sheet-mobs-<family>.png`. The path is printed. Each sheet shows a frame about 0.8 s after the cast for rank 1 and rank 6 of every class spell, or for each mob spell, and missing clips are labelled MISSING. Look for these problems:

- blank frames
- fighters out of frame
- an effect that fills the frame

To re-render one clip, delete its sidecar `assets/spells/.meta/<file>.json`, or pass a different `--pad` to a single-clip run.

## How long it takes

- **Full run:** about 18–22 s per clip per worker. With 3 workers that's about 7 s per clip, so all 1,440 class clips take roughly 2.5–3 h and the 146 mob clips about 20 min.
- **Changed-only run:** proportional to what changed. One spell is 6 clips, about 2 min.
- A change to a shared VFX source or to `SCRIPT_VERSION` makes every clip stale, so it costs a full run.
- `--dry-run` takes a few seconds.

## Determinism: what you can and can't expect

These are fixed:

- the board: `fight_boards.boards[16]` (13×11, no rocks or holes, the only board with an open diamond of radius 5), reached by rerolling the Fight lab's board from seed 1 to seed 16; `--board N` picks another. Area spells keep their whole shape; a whole-board area is painted but not framed, so the fighters stay readable
- the fight RNG (deterministic from the seed, so damage numbers repeat)
- page `Math.random`, seeded per clip
- the layout choice, which is a pure function of the board and the spell data
- the crop, snapped to a coarse grid
- the encoder: x264 single-threaded, no SEI or version string, `-map_metadata -1`, `+bitexact`
- the sorted manifest keys
- hash-based worker sharding

Identical frames encode to identical bytes.

What still varies is the frames themselves. Clips are captured in real time with Chrome's screencast, not frame-stepped. So frame timing, the moment the cast lands relative to the frames, and the clip length (±0.1 s) depend on wall-clock scheduling and GPU load. Shader particles driven by time also vary. Expect clips to be visually the same from run to run but not byte-identical. That's why staleness is decided by the input fingerprint and never by the bytes of the output.

## The welcome page's battle board still

`assets/scenes/battle-board.webp` comes from the same renderer: one clip rendered at a wide framing into a scratch folder, with `SPELLCAP_DEBUG` saving the full 1600×900 aimed view, then cropped. Both stills keep the original board (`--board 1`).

```bash
mkdir -p /tmp/board/out
SPELLCAP_DEBUG=/tmp/board bun scripts/render-spells-game.mjs --class shugo --spell "Natural Attack" --pad 5.5 --board 1 --out /tmp/board/out
ffmpeg -y -i /tmp/board/shugo-natural-attack-r1-view.png -vf "crop=960:540:195:300" -c:v libwebp -quality 82 assets/scenes/battle-board.webp
```

`--out` keeps the run away from `assets/spells`, so the real clips and manifest are untouched.

## The first fights still and the zone grid

`assets/scenes/first-fight.webp` is made the same way as the battle board:

```bash
mkdir -p /tmp/fight/out
SPELLCAP_DEBUG=/tmp/fight bun scripts/render-spells-game.mjs --class ikari --spell "Fury" --mob lorito__water --pad 5.5 --board 1 --out /tmp/fight/out
ffmpeg -y -i /tmp/fight/ikari-fury-r1-view.png -vf "crop=800:450:290:270" -c:v libwebp -quality 82 assets/scenes/first-fight.webp
```

The map page's zone grid (`assets/minimap/zone-grid.webp`) comes from `scripts/render-zone-grid.mjs`, which paints zones −3 to 3 around the centre with the game's minimap painter and Thebes' structures:

```bash
bun scripts/render-zone-grid.mjs
ffmpeg -y -i assets/minimap/zone-grid.png -c:v libwebp -q:v 88 assets/minimap/zone-grid.webp
```

The mob pages' spawn maps use a wider render of the same script (±12 zones, 40 px per zone) and the zone biome list it writes next to it:

```bash
bun scripts/render-zone-grid.mjs --span 12 --px 40 --name nauvis-area
ffmpeg -y -i assets/minimap/nauvis-area.png -c:v libwebp -q:v 85 assets/minimap/nauvis-area.webp && rm assets/minimap/nauvis-area.png
```
