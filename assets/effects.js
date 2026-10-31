// Turns the raw effect rows from spells.json / mobs.json into plain sentences.
// Enum ids mirror packages/fight/src/move_contract.gen.ts in the game source.
window.Effects = (() => {
  const STAT = ['Strength', 'Intelligence', 'Chance', 'Agility', 'Wisdom', 'Range', 'AP', 'MP', 'Power', 'Damage', 'Critical', 'Resistance', 'HP']
  const SHAPE = ['', 'circle', 'cross', 'line', 'T-shape', 'ring', 'whole board', 'cone', 'podium', 'blob']
  const TARGET = {
    0: 'hits allies and you too',
    1: 'enemies only',
    2: 'hits everyone but you',
    3: 'on allies and you',
    4: 'on yourself',
  }
  const stat = id => (id === 255 ? 'any stat' : STAT[id] ?? `stat ${id}`)
  const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`)
  const el = e => (e ? `<span class="el el-${e}">${cube()}${e}</span>` : '')
  const cube = () =>
    '<svg class="cube" viewBox="0 0 16 16" aria-hidden="true"><path class="t" d="M8 1l6.5 3.5L8 8 1.5 4.5z"/><path class="l" d="M1.5 4.5L8 8v7l-6.5-3.5z"/><path class="r" d="M14.5 4.5L8 8v7l6.5-3.5z"/></svg>'

  const zone = f => (f.area_shape && SHAPE[f.area_shape] ? ` (${SHAPE[f.area_shape]}${f.area_shape === 6 ? '' : ' of ' + f.area_size})` : '')

  const main = f => {
    const v = range(f.value, f.value_max)
    const s = stat(f.stat)
    switch (f.kind) {
      case 0: return `${v} ${el(f.element)} damage`
      case 1: return `${v}% of the target's max HP as ${el(f.element)} damage`
      case 2: return `${v} damage to yourself`
      case 3: return `${v} ${el(f.element)} damage, up to double when you are low on HP`
      case 4:
        if (f.stat === 12) return f.turns > 0 ? `Regenerate ${v} HP each turn` : `Heal ${v} HP`
        return `+${v} ${s}`
      case 5:
        if (f.stat === 12) return `${v} ${el(f.element)} damage each turn (poison)`
        if (f.stat === 6 || f.stat === 7) return `−${v} ${s} (Wisdom can dodge it)`
        return `−${v} ${s}`
      case 6:
        if (f.stat === 12) return `Steal ${v} HP as ${el(f.element)} damage (you heal half)`
        return `Steal ${v} ${s}`
      case 7: return `Damage you take is turned into +${s}`
      case 8: return `Push back ${v} cell${f.value_max > 1 ? 's' : ''}`
      case 9: return `Pull ${v} cell${f.value_max > 1 ? 's' : ''}`
      case 10: return 'Teleport to the target cell'
      case 11: return 'Swap places with the target'
      case 12: return `Set a trap${zone(f)}. The first fighter to step into it sets it off, and it disappears:`
      case 13: return `Lay a glyph${zone(f)} for ${f.turns} turn${f.turns > 1 ? 's' : ''}. Anyone who starts their turn inside it gets:`
      case 14: return `Shield: ${v} less ${f.element ? el(f.element) + ' ' : ''}damage per hit`
      case 15: return `Reflect ${v} damage per hit`
      case 16: return 'Remove every effect on the target'
      case 17: return 'Turn invisible'
      case 18: return 'Send weaker spells back at their caster'
      case 19: return 'Take the damage meant for the target'
      case 20: return `−${v} ${s} (cannot be dodged)`
      default: return `Effect ${f.kind}`
    }
  }

  const describe = f => {
    const bits = [main(f)]
    if (f.turns > 0 && f.kind !== 7 && f.kind !== 13) bits.push(`for ${f.turns} turn${f.turns > 1 ? 's' : ''}`)
    if (f.area_shape && SHAPE[f.area_shape] && f.kind !== 12 && f.kind !== 13) bits.push(`in a ${SHAPE[f.area_shape]}${f.area_shape === 6 ? '' : ' of ' + f.area_size}`)
    if (TARGET[f.target_filter] && f.kind !== 12 && f.kind !== 13) bits.push(`(${TARGET[f.target_filter]})`)
    if (f.chance_bp && f.chance_bp < 10000) bits.push(`, ${f.chance_bp / 100}% chance`)
    return bits.join(' ').replace(' ,', ',')
  }

  // Trap and glyph rows carry their payload in the rows after them.
  const list = fx => {
    const out = []
    let nested = false
    for (const f of fx) {
      const text = describe(f)
      if (nested) out[out.length - 1].sub.push(text)
      else out.push({ text, sub: [] })
      if (f.kind === 12 || f.kind === 13) nested = true
    }
    return out
  }

  return { describe, list, el, cube, stat, SHAPE }
})()
