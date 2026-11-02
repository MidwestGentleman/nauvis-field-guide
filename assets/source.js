// Builds the wiki's data model from the game's public source files.
// Runs in the browser (fetching raw.githubusercontent.com) and in scripts/build-data.mjs (Node).
// `read(path)` returns a repo file's text. Nothing in the source is executed: the two .ts files
// are parsed as text. If the upstream schema changes, `assert` throws instead of returning bad data.

export const REPO = 'aresrpg/aresrpg'
export const CONTENT = ['spells', 'mobs', 'items', 'recipes', 'worlds', 'dungeons', 'journey', 'mastery']
export const TS_FILES = ['packages/immutable/src/identity.ts', 'packages/immutable/src/characteristics.ts', 'packages/immutable/src/item.ts', 'packages/immutable/src/gathering.ts', 'packages/immutable/src/experience.ts']
export const LOCALE = 'packages/frontend/src/i18n/locales/en.yaml'

// The latest release tag is what production runs; the default branch can be ahead of it.
export const latestTag = async () => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  if (!res.ok) return 'edge'
  return (await res.json()).tag_name ?? 'edge'
}

export const rawReader = ref => async path => {
  const url = `https://raw.githubusercontent.com/${REPO}/${ref}/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  return res.text()
}

export async function buildGameData(read, source) {
  const assert = (ok, msg) => {
    if (!ok) throw new Error(`Upstream schema changed: ${msg}`)
  }

  // The .ts files are parsed as text, never executed.
  const string_list = body => [...body.matchAll(/'([a-z_]+)'/gi)].map(m => m[1])

  // Splits "a, ladder([0, 1], [50, 2]), B" on top-level commas.
  const split_args = text => {
    const parts = []
    let depth = 0
    let cur = ''
    for (const ch of text) {
      if (ch === '(' || ch === '[') depth++
      if (ch === ')' || ch === ']') depth--
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim())
        cur = ''
      } else cur += ch
    }
    if (cur.trim()) parts.push(cur.trim())
    return parts
  }

  const parse_ladder = (expr, named) => {
    const inline = expr.match(/^ladder\(([\s\S]*)\)$/)
    if (!inline) {
      assert(named[expr], `unknown ladder ${expr}`)
      return named[expr]
    }
    return JSON.parse(`[${inline[1]}]`).map(([from, cost, gain = 1]) => ({ from, cost, gain }))
  }

  const load_ts = async () => {
    const [identity_ts, characteristics_ts, item_ts, gathering_ts, experience_ts] = await Promise.all(TS_FILES.map(read))
    const class_body = identity_ts.match(/export const class_names = Object\.freeze\(\[([\s\S]*?)\]/)?.[1]
    const jobs_body = identity_ts.match(/export const job_groups = Object\.freeze\(\{([\s\S]*?)\n\}\)/)?.[1]
    assert(class_body && jobs_body, 'identity.ts class_names / job_groups')
    const job_groups = Object.fromEntries(
      [...jobs_body.matchAll(/(\w+): Object\.freeze\(\[([^\]]*)\]/g)].map(m => [m[1], string_list(m[2])])
    )
    const named = {}
    for (const m of characteristics_ts.matchAll(/^const ([A-Z_]+) = ladder\(([\s\S]*?)\)\n/gm))
      named[m[1]] = parse_ladder(`ladder(${m[2]})`, named)
    const table = characteristics_ts.match(/characteristic_ladders[\s\S]*?Object\.freeze\(\{([\s\S]*?)\n\}\)/)?.[1]
    assert(table, 'characteristics.ts characteristic_ladders')
    const order = ['strength', 'intelligence', 'chance', 'agility', 'vitality', 'wisdom']
    const characteristic_ladders = {}
    const class_names = string_list(class_body)
    for (const cls of class_names) {
      const start = table.indexOf(`${cls}: costs(`)
      assert(start >= 0, `no stat ladder for ${cls}`)
      let i = start + `${cls}: costs(`.length
      let depth = 1
      let body = ''
      for (; depth > 0; i++) {
        const ch = table[i]
        if (ch === '(') depth++
        if (ch === ')') depth--
        if (depth > 0) body += ch
      }
      const ladders = { vitality: named.VITALITY, wisdom: named.WISDOM }
      split_args(body).forEach((e, n) => (ladders[order[n]] = parse_ladder(e, named)))
      characteristic_ladders[cls] = ladders
    }
    // Gear and key recipes carry no job; the game takes it from the output's category.
    const craft_body = item_ts.match(/craft_jobs_by_category[\s\S]*?Object\.freeze\(\{([\s\S]*?)\}\)/)?.[1]
    assert(craft_body, 'item.ts craft_jobs_by_category')
    const craft_jobs = Object.fromEntries([...craft_body.matchAll(/(\w+): '([A-Z]+)'/g)].map(m => [m[1], m[2]]))
    // gathering.ts: which job gathers each resource, its tier, guardian and rare variant.
    const gather_rows = [
      ...gathering_ts.matchAll(/\{\s*item_type: '(\w+)',\s*job: '([A-Z]+)',\s*tier: (\d+),\s*protector: '(\w+)',\s*rare_item_type: '(\w+)',?\s*\}/g),
    ].map(m => ({ item_type: m[1], job: m[2], tier: +m[3], protector: m[4], rare: m[5] }))
    assert(gather_rows.length >= 3, 'gathering.ts gatherable_rows')
    const job_max_level = +experience_ts.match(/export const job_max_level = (\d+)/)?.[1]
    assert(experience_ts.includes('tier <= 1 ? 1 : Math.min((tier - 1) * 10, job_max_level)') && job_max_level, 'experience.ts tier_unlock_level')
    const gatherables = Object.fromEntries(
      gather_rows.map(r => [r.item_type, { ...r, level: r.tier <= 1 ? 1 : Math.min((r.tier - 1) * 10, job_max_level) }])
    )
    return { identity: { class_names, job_groups, craft_jobs, gatherables }, characteristics: { characteristic_ladders } }
  }

  const [texts, { identity, characteristics }, locale] = await Promise.all([
    Promise.all(CONTENT.map(name => read(`seed/content/${name}.json`))),
    load_ts(),
    read(LOCALE),
  ])
  const content = Object.fromEntries(CONTENT.map((name, i) => [name, JSON.parse(texts[i])]))

  assert(Array.isArray(content.spells) && content.spells[0]?.levels, 'spells.json shape')
  assert(Array.isArray(content.mobs) && 'resistances' in content.mobs[0], 'mobs.json shape')
  assert(content.worlds.every(w => Array.isArray(w.mobs) && w.terrain?.biome_slots), 'worlds.json shape')
  assert(Array.isArray(identity.class_names), 'identity.ts class_names')

  const title_of = cls => locale.match(new RegExp(`class_${cls}_title: (.+)`))?.[1]?.trim() ?? null

  // Effects keep the raw numeric fields; the site decodes them (see assets/effects.js).
  const slim_level = l => ({
    ap: l.ap_cost,
    range: [l.range_min, l.range_max],
    mod_range: l.modifiable_range,
    los: l.line_of_sight,
    line: l.line_launch,
    per_turn: l.casts_per_turn,
    per_target: l.casts_per_target,
    cd: l.cooldown_turns,
    crit: l.crit_1_in,
    fx: l.effects,
    crit_fx: l.crit_effects,
  })

  const classes = identity.class_names.map(cls => ({
    id: cls,
    title: title_of(cls),
    ladders: characteristics.characteristic_ladders[cls],
    spells: content.spells
      .filter(s => s.classe === cls)
      .sort((a, b) => a.unlock_level - b.unlock_level || a.name.localeCompare(b.name))
      .map(s => ({ name: s.name, unlock: s.unlock_level, levels: s.levels.map(slim_level) })),
  }))
  assert(classes.every(c => c.spells.length === 20), 'every class has 20 spells')

  const RES_ZERO = 32768
  const mobs = content.mobs.map(m => ({
    id: m.mob_type,
    name: m.name,
    element: m.element,
    role: m.role,
    family: m.family,
    lvl: [m.level_min, m.level_max],
    hp: m.hp,
    ap: m.ap,
    mp: m.mp,
    xp: m.xp,
    agility: m.agility,
    wisdom: m.wisdom,
    res: Object.fromEntries(Object.entries(m.resistances).map(([k, v]) => [k, v - RES_ZERO])),
    spells: m.spells.map(s => ({ name: s.name, levels: s.levels.map(slim_level) })),
    loot: m.loot,
  }))

  const items = Object.fromEntries(
    content.items.map(i => [
      i.item_type,
      {
        name: i.name,
        category: i.category,
        level: i.level,
        ...(i.damages ? { damages: i.damages } : {}),
        // Gear: each stat's [min, max] roll (only the stats it has). Pets keep theirs under `pet`.
        ...(i.stats && i.category !== 'pet'
          ? { stats: Object.fromEntries(Object.keys(i.stats.max).filter(k => i.stats.max[k] || i.stats.min[k]).map(k => [k, [i.stats.min[k], i.stats.max[k]]])) }
          : {}),
        ...(i.consumable?.type === 'loot_box' ? { contents: i.consumable.rewards.map(r => ({ item_type: r.item_type, amount: r.amount })) } : {}),
        // Pets: what they eat and the stats they grow into (only the stats they have).
        ...(i.category === 'pet'
          ? {
              pet: {
                foods: i.pet_foods ?? [],
                stats: Object.fromEntries(Object.keys(i.stats?.max ?? {}).filter(k => i.stats.max[k] || i.stats.min[k]).map(k => [k, [i.stats.min[k], i.stats.max[k]]])),
              },
            }
          : {}),
      },
    ])
  )

  const worlds = content.worlds.map(w => ({
    id: w.world,
    entry_level: w.entry_level,
    cities: w.cities.map(c => ({ id: c.city, x: c.x, z: c.z, dungeon: c.dungeon ?? null })),
    biomes: w.terrain.biomes.map(b => b.name),
    biome_slots: w.terrain.biome_slots,
    mobs: w.mobs,
    resources: w.resources,
  }))

  const out = {
    generated_at: new Date().toISOString(),
    jobs: identity.job_groups,
    gatherables: identity.gatherables,
    classes,
    mobs,
    items,
    recipes: content.recipes.map(r => {
      const job = identity.craft_jobs[content.items.find(i => i.item_type === r.output_type)?.category] ?? r.job
      assert(job, `no job for recipe ${r.output_type}`)
      return { ...r, job }
    }),
    worlds,
    dungeons: content.dungeons,
    journey: content.journey,
    mastery: content.mastery,
  }
  out.source = source
  return out
}
