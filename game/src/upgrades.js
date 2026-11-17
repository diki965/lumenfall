// The between-wave upgrades: one clear job each, a name, a short effect line
// and an apply() that changes the world's mods. Every upgrade can stack
// (up to maxStacks); rollUpgrades deals three different ones the player
// has not maxed out yet.

export const UPGRADE_POOL = [
  {
    id: 'rapid', name: 'Rapid Coils', icon: '»»', maxStacks: 5,
    desc: '+22% fire rate',
    apply(mods) { mods.fireRate *= 1.22; },
  },
  {
    id: 'heavy', name: 'Heavy Rounds', icon: '◆', maxStacks: 5,
    desc: '+25% bullet damage',
    apply(mods) { mods.damage *= 1.25; },
  },
  {
    id: 'split', name: 'Split Shot', icon: '⑂', maxStacks: 3,
    desc: '+1 projectile per shot',
    apply(mods) { mods.multishot += 1; },
  },
  {
    id: 'pierce', name: 'Lance Rounds', icon: '→', maxStacks: 3,
    desc: 'Bullets pierce +1 enemy',
    apply(mods) { mods.pierce += 1; },
  },
  {
    id: 'thrusters', name: 'Ion Thrusters', icon: '≫', maxStacks: 4,
    desc: '+14% move speed',
    apply(mods) { mods.speed *= 1.14; },
  },
  {
    id: 'hull', name: 'Reinforced Hull', icon: '▣', maxStacks: 4,
    desc: '+25 max HP, heal 25',
    apply(mods, state) {
      mods.maxHp += 25;
      state.player.hp = Math.min(mods.maxHp, state.player.hp + 25);
    },
  },
  {
    id: 'repair', name: 'Beacon Repair', icon: '✚', maxStacks: 99,
    desc: 'Restore 45 beacon HP',
    apply(mods, state) {
      state.beacon.hp = Math.min(state.beacon.maxHp, state.beacon.hp + 45);
    },
  },
  {
    id: 'magnet', name: 'Shard Magnet', icon: '◎', maxStacks: 3,
    desc: '+60% shard pickup range',
    apply(mods) { mods.pickupRadius *= 1.6; },
  },
  {
    id: 'velocity', name: 'Hot Barrels', icon: '↯', maxStacks: 3,
    desc: '+18% bullet speed',
    apply(mods) { mods.bulletSpeed *= 1.18; },
  },
];

/**
 * Deal three different upgrades the player has not maxed out, using the
 * world's seeded random so the same seed deals the same hand. `stacks` maps
 * upgrade id -> times already taken.
 */
export function rollUpgrades(random, stacks) {
  const available = UPGRADE_POOL.filter((u) => (stacks[u.id] ?? 0) < u.maxStacks);
  const hand = [];
  const pool = available.slice();
  while (hand.length < 3 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    hand.push(pool.splice(index, 1)[0]);
  }
  // If everything is maxed (late game), fall back to the repeatable repairs.
  while (hand.length < 3) {
    const fallback = UPGRADE_POOL.find((u) => u.id === 'repair');
    if (hand.includes(fallback)) break;
    hand.push(fallback);
  }
  return hand;
}
