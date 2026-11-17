// The game's rules and state, with no drawing and no browser in it: the
// player ship, the beacon it guards, the pool of enemies, bullets, shards,
// particles and floating text, waves, upgrades, score and win/lose. step()
// advances one fixed step and returns what happened as bit flags, so the
// caller can react (sound, announcements) without the world knowing about
// screens or sound. Pools are allocated once; step() allocates nothing.
import { BEACON, BULLET, ENEMY, FIELD, LAST_WAVE, PALETTE, PLAYER, POOL, SCORE, WAVE_SCALE } from './config.js';
import { randomInt } from './random.js';

export const KIND_CHASER = 0;
export const KIND_SHOOTER = 1;
export const KIND_TANK = 2;
export const KIND_BOSS = 3;

export const EVENT_PLAYER_HIT = 1;
export const EVENT_BEACON_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_SHARD = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_OVER = 32;
export const EVENT_WIN = 64;
export const EVENT_WAVE_START = 128;
export const EVENT_BOSS = 256;

const TWO_PI = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** How many of each kind a wave sends, in spawn order (boss first, so it is never last). */
export function waveComposition(wave) {
  const queue = [];
  const boss = wave === 5 || wave === 10;
  if (boss) queue.push(KIND_BOSS);
  const chasers = 3 + wave * 2;
  const shooters = wave >= 2 ? wave : 0;
  const tanks = wave >= 3 ? wave - 2 : 0;
  for (let i = 0; i < chasers; i += 1) queue.push(KIND_CHASER);
  for (let i = 0; i < shooters; i += 1) queue.push(KIND_SHOOTER);
  for (let i = 0; i < tanks; i += 1) queue.push(KIND_TANK);
  // Shuffle the non-boss part so the mix stays unpredictable.
  return queue;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2 + 170, vx: 0, vy: 0,
    hp: PLAYER.hp, angle: -Math.PI / 2, fireCd: 0, invuln: 0, radius: PLAYER.radius,
  };
  const beacon = { x: BEACON.x, y: BEACON.y, hp: BEACON.hp, maxHp: BEACON.hp, radius: BEACON.radius };
  const mods = {
    damage: PLAYER.damage, fireRate: PLAYER.fireRate, multishot: PLAYER.multishot,
    pierce: PLAYER.pierce, speed: PLAYER.speed, maxHp: PLAYER.hp,
    bulletSpeed: PLAYER.bulletSpeed, pickupRadius: PLAYER.pickupRadius,
  };
  const enemies = [];
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({ active: false, kind: KIND_CHASER, x: 0, y: 0, hp: 1, maxHp: 1, radius: 10, speed: 0, damage: 0, score: 0, shards: 0, fireCd: 0, attackCd: 0, hitCd: 0, burstCd: 0, spawnCd: 0, flash: 0, angle: 0, wobble: 0 });
  }
  const bullets = [];
  for (let i = 0; i < POOL.bullets; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, pierce: 0, damage: 0, radius: PLAYER.bulletRadius });
  const ebullets = [];
  for (let i = 0; i < POOL.ebullets; i += 1) ebullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: BULLET.enemyRadius, life: 0 });
  const shards = [];
  for (let i = 0; i < POOL.shards; i += 1) shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
  const particles = [];
  for (let i = 0; i < POOL.particles; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });
  const floats = [];
  for (let i = 0; i < POOL.floats; i += 1) floats.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffffff', size: 18 });

  const state = {
    player, beacon, mods, enemies, bullets, ebullets, shards, particles, floats,
    stacks: {}, applied: [],
    score: 0, shardCount: 0, kills: 0, wave: 0, wavesCleared: 0,
    phase: 'fighting', // fighting | between | won | lost
    cause: null, // 'player' | 'beacon' when lost
    elapsed: 0, shake: 0, banner: { text: '', sub: '', t: 0 },
    introT: 0, spawnTimer: 0, spawnIndex: 0, harmlessTimer: 0,
  };
  let queue = [];

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed, size) {
    for (let n = 0; n < count; n += 1) {
      const p = free(particles);
      if (!p) return;
      const a = random() * TWO_PI;
      const s = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.maxLife = 0.35 + random() * 0.45;
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
    }
  }

  function addFloat(x, y, text, color, size) {
    const f = free(floats);
    if (!f) return;
    f.active = true; f.x = x; f.y = y; f.life = 0.9; f.text = text; f.color = color; f.size = size;
  }

  function edgePoint() {
    const side = randomInt(random, 0, 3);
    const m = 24;
    if (side === 0) return { x: random() * FIELD.width, y: m };
    if (side === 1) return { x: random() * FIELD.width, y: FIELD.height - m };
    if (side === 2) return { x: m, y: random() * FIELD.height };
    return { x: FIELD.width - m, y: random() * FIELD.height };
  }

  function spawnEnemy(kind, at) {
    const e = free(enemies);
    if (!e) return null;
    const base = kind === KIND_CHASER ? ENEMY.chaser : kind === KIND_SHOOTER ? ENEMY.shooter : kind === KIND_TANK ? ENEMY.tank : ENEMY.boss;
    const hpScale = 1 + WAVE_SCALE.hpPerWave * (state.wave - 1);
    const spScale = 1 + WAVE_SCALE.speedPerWave * (state.wave - 1);
    const pos = at || edgePoint();
    e.active = true;
    e.kind = kind;
    e.x = pos.x; e.y = pos.y;
    e.maxHp = Math.round(base.hp * hpScale * (kind === KIND_BOSS && state.wave === 10 ? 1.6 : 1));
    e.hp = e.maxHp;
    e.radius = base.radius;
    e.speed = base.speed * spScale * (0.9 + random() * 0.2);
    e.damage = base.damage;
    e.score = base.score;
    e.shards = base.shards;
    e.fireCd = 1.2 + random() * 1.2;
    e.attackCd = 0;
    e.hitCd = 0;
    e.burstCd = 2.5;
    e.spawnCd = 5;
    e.flash = 0;
    e.angle = 0;
    e.wobble = random() * TWO_PI;
    return e;
  }

  function dropShards(x, y, count) {
    for (let n = 0; n < count; n += 1) {
      const s = free(shards);
      if (!s) return;
      const a = random() * TWO_PI;
      s.active = true;
      s.x = x; s.y = y;
      s.vx = Math.cos(a) * (40 + random() * 90);
      s.vy = Math.sin(a) * (40 + random() * 90);
    }
  }

  function killEnemy(e) {
    e.active = false;
    state.kills += 1;
    state.score += e.score;
    const color = e.kind === KIND_CHASER ? ENEMY.chaser.color : e.kind === KIND_SHOOTER ? ENEMY.shooter.color : e.kind === KIND_TANK ? ENEMY.tank.color : ENEMY.boss.color;
    burst(e.x, e.y, color, e.kind === KIND_BOSS ? 42 : e.kind === KIND_TANK ? 22 : 12, e.kind === KIND_BOSS ? 320 : 200, e.kind === KIND_BOSS ? 5 : 3);
    addFloat(e.x, e.y - 10, `+${e.score}`, '#eef1f5', 18);
    dropShards(e.x, e.y, e.shards);
    if (e.kind === KIND_BOSS || e.kind === KIND_TANK) state.shake = Math.max(state.shake, e.kind === KIND_BOSS ? 14 : 7);
  }

  function damagePlayer(amount) {
    if (player.invuln > 0 || state.phase !== 'fighting') return false;
    player.hp -= amount;
    player.invuln = PLAYER.invulnerable;
    state.shake = Math.max(state.shake, 8);
    burst(player.x, player.y, PALETTE.player, 10, 180, 3);
    if (player.hp <= 0) {
      player.hp = 0;
      state.phase = 'lost';
      state.cause = 'player';
      burst(player.x, player.y, '#4de3ff', 50, 320, 4);
      burst(player.x, player.y, '#ffffff', 24, 200, 3);
    }
    return true;
  }

  function damageBeacon(amount) {
    if (state.phase !== 'fighting') return;
    beacon.hp -= amount;
    state.shake = Math.max(state.shake, 5);
    burst(beacon.x, beacon.y, '#ffd166', 8, 160, 3);
    if (beacon.hp <= 0) {
      beacon.hp = 0;
      state.phase = 'lost';
      state.cause = 'beacon';
      burst(beacon.x, beacon.y, '#ffd166', 60, 340, 5);
      burst(beacon.x, beacon.y, '#ffffff', 30, 220, 3);
    }
  }

  function firePlayerBullet(angle) {
    const b = free(bullets);
    if (!b) return;
    b.active = true;
    b.x = player.x + Math.cos(angle) * (player.radius + 8);
    b.y = player.y + Math.sin(angle) * (player.radius + 8);
    b.vx = Math.cos(angle) * mods.bulletSpeed;
    b.vy = Math.sin(angle) * mods.bulletSpeed;
    b.pierce = mods.pierce;
    b.damage = Math.round(mods.damage);
    b.radius = PLAYER.bulletRadius;
  }

  function fireEnemyBullet(x, y, tx, ty, damage) {
    const b = free(ebullets);
    if (!b) return;
    const a = Math.atan2(ty - y, tx - x);
    b.active = true;
    b.x = x; b.y = y;
    b.vx = Math.cos(a) * BULLET.enemySpeed;
    b.vy = Math.sin(a) * BULLET.enemySpeed;
    b.damage = damage;
    b.life = 4;
  }

  function startWave(wave) {
    state.wave = wave;
    queue = waveComposition(wave);
    // Shuffle everything after the boss so the mix stays unpredictable.
    const start = queue[0] === KIND_BOSS ? 1 : 0;
    for (let i = queue.length - 1; i > start; i -= 1) {
      const j = start + Math.floor(random() * (i - start + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    state.spawnIndex = 0;
    state.spawnTimer = 0.4;
    state.introT = 1.3;
    state.phase = 'fighting';
    const boss = queue[0] === KIND_BOSS;
    state.banner.text = boss ? `WAVE ${wave} — BOSS` : `WAVE ${wave}`;
    state.banner.sub = boss ? 'Something huge is coming for the beacon' : `${queue.length} hostiles inbound`;
    state.banner.t = 1.6;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2 + 170;
    player.hp = PLAYER.hp;
    player.angle = -Math.PI / 2;
    player.fireCd = 0;
    player.invuln = 0;
    beacon.hp = BEACON.hp;
    beacon.maxHp = BEACON.hp;
    mods.damage = PLAYER.damage;
    mods.fireRate = PLAYER.fireRate;
    mods.multishot = PLAYER.multishot;
    mods.pierce = PLAYER.pierce;
    mods.speed = PLAYER.speed;
    mods.maxHp = PLAYER.hp;
    mods.bulletSpeed = PLAYER.bulletSpeed;
    mods.pickupRadius = PLAYER.pickupRadius;
    for (const pool of [enemies, bullets, ebullets, shards, particles, floats]) {
      for (const item of pool) item.active = false;
    }
    state.stacks = {};
    state.applied = [];
    state.score = 0;
    state.shardCount = 0;
    state.kills = 0;
    state.wave = 0;
    state.wavesCleared = 0;
    state.phase = 'fighting';
    state.cause = null;
    state.elapsed = 0;
    state.shake = 0;
    state.banner = { text: '', sub: '', t: 0 };
    state.introT = 0;
    state.spawnTimer = 0;
    state.spawnIndex = 0;
    queue = [];
    startWave(1);
  }

  function applyUpgrade(def) {
    def.apply(mods, state);
    state.stacks[def.id] = (state.stacks[def.id] ?? 0) + 1;
    state.applied.push(def.id);
  }

  function enemiesRemaining() {
    let alive = 0;
    for (const e of enemies) if (e.active) alive += 1;
    return alive + (queue.length - state.spawnIndex);
  }

  /**
   * One fixed step. `input` is {mx, my, aimX, aimY, firing} in world
   * coordinates. With `harmless` set (the title screen's backdrop) enemies
   * drift in but nothing can be hurt and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.banner.t > 0) state.banner.t -= dt;
    for (const f of floats) if (f.active) { f.y -= 34 * dt; f.life -= dt; if (f.life <= 0) f.active = false; }
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }

    if (harmless) {
      state.harmlessTimer -= dt;
      let active = 0;
      for (const e of enemies) if (e.active) active += 1;
      if (state.harmlessTimer <= 0 && active < 6) {
        spawnEnemy(random() < 0.6 ? KIND_CHASER : KIND_SHOOTER, null);
        state.harmlessTimer = 1.4;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const a = Math.atan2(beacon.y - e.y, beacon.x - e.x);
        e.x += Math.cos(a) * e.speed * 0.5 * dt;
        e.y += Math.sin(a) * e.speed * 0.5 * dt;
        if (dist2(e.x, e.y, beacon.x, beacon.y) < (beacon.radius + e.radius + 4) ** 2) e.active = false;
      }
      return events;
    }

    if (state.phase !== 'fighting') return events;

    // --- player ---
    player.x = Math.min(FIELD.width - 20, Math.max(20, player.x + input.mx * mods.speed * dt));
    player.y = Math.min(FIELD.height - 20, Math.max(20, player.y + input.my * mods.speed * dt));
    player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    player.fireCd -= dt;
    if (input.firing && player.fireCd <= 0) {
      const n = mods.multishot;
      const spread = (n - 1) * 0.12;
      for (let i = 0; i < n; i += 1) firePlayerBullet(player.angle - spread / 2 + (n === 1 ? 0 : (spread * i) / (n - 1)));
      player.fireCd = 1 / mods.fireRate;
    }

    // --- spawning ---
    if (state.introT > 0) {
      state.introT -= dt;
    } else if (state.spawnIndex < queue.length) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const kind = queue[state.spawnIndex];
        state.spawnIndex += 1;
        const spawned = spawnEnemy(kind, null);
        if (kind === KIND_BOSS && spawned) events |= EVENT_BOSS;
        const interval = Math.max(WAVE_SCALE.minInterval, WAVE_SCALE.spawnInterval * WAVE_SCALE.spawnScale ** (state.wave - 1));
        state.spawnTimer = interval * (0.7 + random() * 0.6);
      }
    }

    // --- enemies ---
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.attackCd > 0) e.attackCd -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;
      e.wobble += dt;
      const dPlayer = Math.sqrt(dist2(e.x, e.y, player.x, player.y));
      const dBeacon = Math.sqrt(dist2(e.x, e.y, beacon.x, beacon.y));
      let tx;
      let ty;
      let speed = e.speed;
      if (e.kind === KIND_CHASER) {
        if (dPlayer < 240) { tx = player.x; ty = player.y; } else { tx = beacon.x; ty = beacon.y; }
        const a = Math.atan2(ty - e.y, tx - e.x);
        e.x += Math.cos(a) * speed * dt;
        e.y += Math.sin(a) * speed * dt;
        e.angle = a;
      } else if (e.kind === KIND_TANK) {
        const a = Math.atan2(beacon.y - e.y, beacon.x - e.x);
        e.x += Math.cos(a) * speed * dt;
        e.y += Math.sin(a) * speed * dt;
        e.angle = a;
      } else if (e.kind === KIND_SHOOTER) {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        if (dPlayer > 280) { e.x += Math.cos(a) * speed * dt; e.y += Math.sin(a) * speed * dt; }
        else if (dPlayer < 190) { e.x -= Math.cos(a) * speed * dt; e.y -= Math.sin(a) * speed * dt; }
        else { e.x += Math.cos(a + Math.PI / 2) * speed * 0.5 * Math.sin(e.wobble) * dt; e.y += Math.sin(a + Math.PI / 2) * speed * 0.5 * Math.sin(e.wobble) * dt; }
        e.angle = a;
        e.fireCd -= dt;
        if (e.fireCd <= 0 && dPlayer < 520) {
          fireEnemyBullet(e.x, e.y, player.x, player.y, e.damage);
          e.fireCd = 2.1 + random() * 0.7;
        }
      } else { // boss
        const a = Math.atan2(beacon.y - e.y, beacon.x - e.x);
        if (dBeacon > beacon.radius + e.radius + 6) {
          e.x += Math.cos(a) * speed * dt;
          e.y += Math.sin(a) * speed * dt;
        }
        e.angle = a;
        e.burstCd -= dt;
        if (e.burstCd <= 0) {
          const shots = 10;
          for (let i = 0; i < shots; i += 1) {
            const b = free(ebullets);
            if (!b) break;
            const ba = (i / shots) * TWO_PI + e.wobble;
            b.active = true;
            b.x = e.x; b.y = e.y;
            b.vx = Math.cos(ba) * BULLET.enemySpeed * 0.85;
            b.vy = Math.sin(ba) * BULLET.enemySpeed * 0.85;
            b.damage = 10;
            b.life = 4;
          }
          e.burstCd = 3.2;
          state.shake = Math.max(state.shake, 6);
        }
        e.spawnCd -= dt;
        if (e.spawnCd <= 0) {
          spawnEnemy(KIND_CHASER, { x: e.x + (random() - 0.5) * 60, y: e.y + (random() - 0.5) * 60 });
          spawnEnemy(KIND_CHASER, { x: e.x + (random() - 0.5) * 60, y: e.y + (random() - 0.5) * 60 });
          e.spawnCd = 6;
        }
      }

      // Contact attacks: chasers and tanks hit whoever they touch; the boss hits both.
      const touchPlayer = dPlayer < e.radius + player.radius + 2;
      const touchBeacon = dBeacon < e.radius + beacon.radius + 2;
      if (e.kind !== KIND_SHOOTER) {
        if (touchPlayer && e.attackCd <= 0 && e.hitCd <= 0) {
          if (damagePlayer(e.damage)) events |= EVENT_PLAYER_HIT;
          e.attackCd = 0.7;
          e.hitCd = 0.35;
        }
        if (touchBeacon && e.attackCd <= 0) {
          damageBeacon(e.damage);
          events |= EVENT_BEACON_HIT;
          e.attackCd = 0.8;
        }
      }
      if (state.phase !== 'fighting') break;
    }
    if (state.phase !== 'fighting') {
      events |= EVENT_OVER;
      return events;
    }

    // --- player bullets ---
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) { b.active = false; continue; }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + b.radius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          e.hp -= b.damage;
          e.flash = 0.09;
          burst(b.x, b.y, '#aef4ff', 3, 120, 2);
          if (e.hp <= 0) {
            killEnemy(e);
            events |= EVENT_KILL;
          }
          if (b.pierce > 0) { b.pierce -= 1; }
          else { b.active = false; }
          break;
        }
      }
    }

    // --- enemy bullets ---
    for (const b of ebullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) { b.active = false; continue; }
      const rp = player.radius + b.radius;
      if (dist2(b.x, b.y, player.x, player.y) < rp * rp) {
        b.active = false;
        if (damagePlayer(b.damage)) events |= EVENT_PLAYER_HIT;
      } else {
        const rb = beacon.radius + b.radius;
        if (dist2(b.x, b.y, beacon.x, beacon.y) < rb * rb) {
          b.active = false;
          damageBeacon(b.damage);
          events |= EVENT_BEACON_HIT;
        }
      }
      if (state.phase !== 'fighting') break;
    }
    if (state.phase !== 'fighting') {
      events |= EVENT_OVER;
      return events;
    }

    // --- shards ---
    for (const s of shards) {
      if (!s.active) continue;
      const d = Math.sqrt(dist2(s.x, s.y, player.x, player.y));
      if (d < mods.pickupRadius && d > 1) {
        const pull = 900 * dt;
        s.vx += ((player.x - s.x) / d) * pull;
        s.vy += ((player.y - s.y) / d) * pull;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.94;
      s.vy *= 0.94;
      if (d < PLAYER.collectRadius) {
        s.active = false;
        state.shardCount += 1;
        state.score += SCORE.shard;
        events |= EVENT_SHARD;
      }
    }

    // --- wave clear ---
    if (state.spawnIndex >= queue.length && enemiesRemaining() === 0) {
      state.wavesCleared += 1;
      const bonus = SCORE.waveBonus * state.wave;
      state.score += bonus;
      addFloat(beacon.x, beacon.y - 60, `WAVE BONUS +${bonus}`, '#ffd166', 22);
      if (state.wave >= LAST_WAVE) {
        state.phase = 'won';
        events |= EVENT_WIN;
      } else {
        state.phase = 'between';
        events |= EVENT_WAVE_CLEAR;
      }
    }

    return events;
  }

  reset();
  return {
    state, reset, step, startWave, applyUpgrade, enemiesRemaining,
    /** Begin the next wave after an upgrade pick. Returns EVENT_WAVE_START. */
    nextWave() {
      startWave(state.wave + 1);
      return EVENT_WAVE_START;
    },
  };
}
