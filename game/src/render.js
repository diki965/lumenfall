// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. All art is procedural canvas shapes;
// text that holds a number is rebuilt only when the number changes, so a
// frame allocates nothing in the hot path.
import { BEACON, FIELD, FONT, LAST_WAVE, PALETTE } from './config.js';
import { KIND_BOSS, KIND_CHASER, KIND_SHOOTER, KIND_TANK } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TWO_PI = Math.PI * 2;
const UPGRADE_NAMES = { rapid: 'Rapid Coils', heavy: 'Heavy Rounds', split: 'Split Shot', pierce: 'Lance Rounds', thrusters: 'Ion Thrusters', hull: 'Reinforced Hull', repair: 'Beacon Repair', magnet: 'Shard Magnet', velocity: 'Hot Barrels' };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const scoreLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const waveLabel = cachedLabel('WAVE ');
  const shardLabel = cachedLabel('◆ ');
  const finalLabel = cachedLabel('SCORE ');
  const finalBestLabel = cachedLabel('BEST ');
  const wavesLabel = cachedLabel('WAVES CLEARED ');
  const killsLabel = cachedLabel('KILLS ');
  const titleBestLabel = cachedLabel('BEST ');
  let cardRects = [];
  let time = 0;

  // A fixed starfield, drawn behind everything.
  const stars = [];
  for (let i = 0; i < 150; i += 1) {
    stars.push({ x: Math.random() * FIELD.width, y: Math.random() * FIELD.height, r: 0.6 + Math.random() * 1.6, tw: Math.random() * TWO_PI, sp: 0.5 + Math.random() * 1.5 });
  }
  const nebulae = [];
  for (let i = 0; i < 5; i += 1) {
    nebulae.push({ x: Math.random() * FIELD.width, y: Math.random() * FIELD.height, r: 120 + Math.random() * 160, color: i % 2 ? PALETTE.nebulaA : PALETTE.nebulaB });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.ratio = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view.x = (canvas.width - FIELD.width * view.scale) / 2;
    view.y = (canvas.height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = size + (weight || '');
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function bar(x, y, w, h, fraction, fill, back) {
    context.fillStyle = back;
    context.fillRect(x, y, w, h);
    context.fillStyle = fill;
    context.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  function drawBackground() {
    context.fillStyle = PALETTE.space;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const n of nebulae) {
      context.globalAlpha = 0.5;
      context.fillStyle = n.color;
      context.beginPath();
      context.arc(n.x, n.y, n.r, 0, TWO_PI);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const s of stars) {
      context.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * s.sp + s.tw));
      context.fillStyle = '#cfe6ff';
      context.fillRect(s.x, s.y, s.r, s.r);
    }
    context.globalAlpha = 1;
    // Arena edge.
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 2;
    context.strokeRect(10, 10, FIELD.width - 20, FIELD.height - 20);
    // Faint range rings around the beacon, so the guard zone reads at a glance.
    context.strokeStyle = 'rgba(255,209,102,0.10)';
    context.lineWidth = 1;
    context.beginPath(); context.arc(BEACON.x, BEACON.y, 120, 0, TWO_PI); context.stroke();
    context.beginPath(); context.arc(BEACON.x, BEACON.y, 220, 0, TWO_PI); context.stroke();
  }

  function drawBeacon(state) {
    const b = state.beacon;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
    context.globalAlpha = 0.16 + 0.08 * pulse;
    context.fillStyle = PALETTE.beacon;
    context.beginPath(); context.arc(b.x, b.y, b.radius + 26, 0, TWO_PI); context.fill();
    context.globalAlpha = 1;
    // Rotating dashed guard ring.
    context.save();
    context.translate(b.x, b.y);
    context.rotate(time * 0.35);
    context.strokeStyle = 'rgba(255,209,102,0.55)';
    context.lineWidth = 2;
    context.setLineDash([14, 10]);
    context.beginPath(); context.arc(0, 0, b.radius + 12, 0, TWO_PI); context.stroke();
    context.restore();
    context.setLineDash([]);
    // Body: layered diamond + core.
    context.fillStyle = '#8a6d1f';
    context.beginPath();
    context.moveTo(b.x, b.y - b.radius); context.lineTo(b.x + b.radius * 0.8, b.y);
    context.lineTo(b.x, b.y + b.radius); context.lineTo(b.x - b.radius * 0.8, b.y);
    context.closePath(); context.fill();
    context.fillStyle = PALETTE.beacon;
    context.beginPath();
    context.moveTo(b.x, b.y - b.radius * 0.62); context.lineTo(b.x + b.radius * 0.5, b.y);
    context.lineTo(b.x, b.y + b.radius * 0.62); context.lineTo(b.x - b.radius * 0.5, b.y);
    context.closePath(); context.fill();
    context.fillStyle = PALETTE.beaconCore;
    context.beginPath(); context.arc(b.x, b.y, 8 + 2 * pulse, 0, TWO_PI); context.fill();
    // HP arc around the beacon.
    context.strokeStyle = 'rgba(255,255,255,0.18)';
    context.lineWidth = 5;
    context.beginPath(); context.arc(b.x, b.y, b.radius + 22, 0, TWO_PI); context.stroke();
    context.strokeStyle = b.hp / b.maxHp > 0.35 ? PALETTE.beacon : PALETTE.bad;
    context.beginPath(); context.arc(b.x, b.y, b.radius + 22, -Math.PI / 2, -Math.PI / 2 + TWO_PI * (b.hp / b.maxHp)); context.stroke();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) {
      // Blink while invulnerable after a hit.
      context.save();
      context.globalAlpha = 0.5;
    }
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.angle);
    // Engine flame.
    const flame = 10 + Math.random() * 8;
    context.fillStyle = '#ff9f43';
    context.beginPath();
    context.moveTo(-12, 5); context.lineTo(-12 - flame, 0); context.lineTo(-12, -5);
    context.closePath(); context.fill();
    // Hull: a sleek arrow ship.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(20, 0); context.lineTo(-12, 11); context.lineTo(-6, 0); context.lineTo(-12, -11);
    context.closePath(); context.fill();
    context.fillStyle = PALETTE.playerDark;
    context.beginPath(); context.arc(2, 0, 4.5, 0, TWO_PI); context.fill();
    context.fillStyle = '#eafcff';
    context.beginPath(); context.arc(4, 0, 2, 0, TWO_PI); context.fill();
    context.restore();
    if (p.invuln > 0) {
      context.globalAlpha = 0.4;
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 2;
      context.beginPath(); context.arc(p.x, p.y, p.radius + 7, 0, TWO_PI); context.stroke();
      context.globalAlpha = 1;
      context.restore();
    }
  }

  function drawEnemy(e) {
    const color = e.kind === KIND_CHASER ? '#ff4d6d' : e.kind === KIND_SHOOTER ? '#b26bff' : e.kind === KIND_TANK ? '#ff9f43' : '#ff2e88';
    context.save();
    context.translate(e.x, e.y);
    if (e.kind === KIND_SHOOTER && e.fireCd < 0.45) {
      // Telegraph: a thin aim line at the player just before it fires.
      context.rotate(0);
      context.strokeStyle = 'rgba(178,107,255,0.5)';
      context.lineWidth = 1.5;
      context.setLineDash([6, 6]);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(Math.cos(e.angle) * 260, Math.sin(e.angle) * 260);
      context.stroke();
      context.setLineDash([]);
    }
    if (e.kind === KIND_BOSS && e.burstCd < 0.7) {
      // Telegraph: the burst ring swells just before it fires.
      context.strokeStyle = 'rgba(255,46,136,0.6)';
      context.lineWidth = 3;
      context.beginPath(); context.arc(0, 0, e.radius + 26 - e.burstCd * 20, 0, TWO_PI); context.stroke();
    }
    context.rotate(e.angle);
    if (e.kind === KIND_CHASER) {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(e.radius + 4, 0); context.lineTo(-e.radius, e.radius * 0.8); context.lineTo(-e.radius * 0.4, 0); context.lineTo(-e.radius, -e.radius * 0.8);
      context.closePath(); context.fill();
      context.fillStyle = '#fff';
      context.beginPath(); context.arc(e.radius * 0.35, 0, 3, 0, TWO_PI); context.fill();
    } else if (e.kind === KIND_SHOOTER) {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(e.radius + 4, 0); context.lineTo(0, e.radius); context.lineTo(-e.radius - 2, 0); context.lineTo(0, -e.radius);
      context.closePath(); context.fill();
      context.fillStyle = '#2a1245';
      context.beginPath(); context.arc(0, 0, 5, 0, TWO_PI); context.fill();
      context.fillStyle = '#e9d5ff';
      context.beginPath(); context.arc(2, 0, 2.2, 0, TWO_PI); context.fill();
    } else if (e.kind === KIND_TANK) {
      context.fillStyle = color;
      context.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TWO_PI;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath(); context.fill();
      context.strokeStyle = '#7a3d00';
      context.lineWidth = 3;
      context.beginPath(); context.arc(0, 0, e.radius * 0.55, 0, TWO_PI); context.stroke();
      context.fillStyle = '#ffe1b8';
      context.beginPath(); context.arc(0, 0, 4, 0, TWO_PI); context.fill();
    } else {
      // Boss: spiked ring with a pulsing core.
      context.fillStyle = color;
      context.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TWO_PI + time * 0.4;
        const r = i % 2 === 0 ? e.radius + 10 : e.radius - 4;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath(); context.fill();
      context.fillStyle = '#3d0218';
      context.beginPath(); context.arc(0, 0, e.radius * 0.55, 0, TWO_PI); context.fill();
      context.fillStyle = '#ff8ac2';
      context.beginPath(); context.arc(0, 0, 8 + 3 * Math.sin(time * 5), 0, TWO_PI); context.fill();
    }
    context.restore();
    if (e.flash > 0) {
      context.globalAlpha = 0.75;
      context.fillStyle = '#ffffff';
      context.beginPath(); context.arc(e.x, e.y, e.radius, 0, TWO_PI); context.fill();
      context.globalAlpha = 1;
    }
    // HP bar for tough enemies.
    if ((e.kind === KIND_TANK || e.kind === KIND_BOSS) && e.hp < e.maxHp) {
      bar(e.x - 22, e.y - e.radius - 14, 44, 5, e.hp / e.maxHp, color, 'rgba(0,0,0,0.5)');
    }
  }

  function drawField(state, showPlayer) {
    drawBackground();
    drawBeacon(state);
    for (const s of state.shards) {
      if (!s.active) continue;
      context.save();
      context.translate(s.x, s.y);
      context.rotate(time * 3 + s.x);
      context.fillStyle = PALETTE.shard;
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.fillStyle = PALETTE.bullet;
      context.beginPath(); context.arc(b.x, b.y, b.radius + 1.5, 0, TWO_PI); context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath(); context.arc(b.x, b.y, b.radius * 0.5, 0, TWO_PI); context.fill();
    }
    for (const b of state.ebullets) {
      if (!b.active) continue;
      context.fillStyle = PALETTE.ebullet;
      context.beginPath(); context.arc(b.x, b.y, b.radius + 1, 0, TWO_PI); context.fill();
      context.strokeStyle = '#ffd7ea';
      context.lineWidth = 1;
      context.beginPath(); context.arc(b.x, b.y, b.radius + 1, 0, TWO_PI); context.stroke();
    }
    for (const e of state.enemies) if (e.active) drawEnemy(e);
    if (showPlayer) drawPlayer(state);
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
    for (const f of state.floats) {
      if (!f.active) continue;
      context.globalAlpha = Math.max(0, f.life / 0.9);
      text(f.text, f.x, f.y, f.size, f.color, 'center', '700');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, best, muted) {
    const p = state.player;
    const b = state.beacon;
    context.textBaseline = 'top';
    text(waveLabel(state.wave) + `/ ${LAST_WAVE}`, 24, 18, 26, PALETTE.text, 'left', '700');
    // Enemies remaining, counted live (cheap: small pools).
    let alive = 0;
    for (const e of state.enemies) if (e.active) alive += 1;
    text(`HOSTILES ${alive}`, 24, 48, 18, PALETTE.muted, 'left');
    text(scoreLabel(state.score), FIELD.width / 2, 18, 26, PALETTE.text, 'center', '700');
    text(bestLabel(best), FIELD.width / 2, 48, 18, PALETTE.muted, 'center');
    text(shardLabel(state.shardCount), FIELD.width - 24, 18, 26, PALETTE.shard, 'right', '700');
    if (muted) text('MUTED (M)', FIELD.width - 24, 48, 18, PALETTE.muted, 'right');

    // Bottom bars: hull left, beacon centre.
    context.textBaseline = 'alphabetic';
    text('HULL', 24, FIELD.height - 44, 16, PALETTE.muted, 'left', '700');
    bar(24, FIELD.height - 36, 220, 14, p.hp / state.mods.maxHp, p.hp / state.mods.maxHp > 0.3 ? PALETTE.player : PALETTE.bad, 'rgba(255,255,255,0.12)');
    text(`${Math.ceil(p.hp)} / ${state.mods.maxHp}`, 252, FIELD.height - 44, 16, PALETTE.text, 'left');
    text('BEACON', FIELD.width / 2 - 110, FIELD.height - 44, 16, PALETTE.muted, 'left', '700');
    bar(FIELD.width / 2 - 110, FIELD.height - 36, 220, 14, b.hp / b.maxHp, b.hp / b.maxHp > 0.3 ? PALETTE.beacon : PALETTE.bad, 'rgba(255,255,255,0.12)');
    text(`${Math.ceil(b.hp)} / ${b.maxHp}`, FIELD.width / 2 + 118, FIELD.height - 44, 16, PALETTE.text, 'left');
    // Applied upgrades as chips, bottom right.
    const names = state.applied.map((id) => UPGRADE_NAMES[id] || id);
    if (names.length > 0) {
      const shown = names.slice(-6);
      text(shown.join(' · '), FIELD.width - 24, FIELD.height - 24, 15, PALETTE.muted, 'right');
    }
    // Wave banner.
    if (state.banner.t > 0) {
      context.globalAlpha = Math.min(1, state.banner.t);
      text(state.banner.text, FIELD.width / 2, 150, 52, PALETTE.wave, 'center', '800');
      if (state.banner.sub) text(state.banner.sub, FIELD.width / 2, 196, 22, PALETTE.text, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt, titleColor) {
    const width = 640;
    const lineH = 32;
    const height = 150 + lines.length * lineH + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(5,7,15,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, width - 2, height - 2);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 46, titleColor || PALETTE.text, 'center', '800');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 128 + i * lineH, 21, i === 0 && lines[i].startsWith('LUMENFALL') ? PALETTE.text : PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 22, PALETTE.shard, 'center', '700');
  }

  const TITLE_LINES = [
    'Guard the beacon. Survive 10 waves.',
    'Win by clearing wave 10.',
    'Chasers hunt you, shooters snipe,',
    'tanks smash the beacon. Bosses on 5 and 10.',
    'Kills drop shards — grab them between waves.',
    'WASD / arrows move · mouse aims · hold click or Space to fire',
    'P pause · M mute · R restart · 1 / 2 / 3 pick an upgrade',
    '',
  ];

  function drawUpgrade(state, choices) {
    context.fillStyle = 'rgba(5,7,15,0.66)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 108, 44, PALETTE.good, 'center', '800');
    text(`Wave bonus banked · score ${state.score} · shards ${state.shardCount}`, FIELD.width / 2, 148, 21, PALETTE.text, 'center');
    text('CHOOSE ONE UPGRADE  —  click a card or press 1 / 2 / 3', FIELD.width / 2, 196, 22, PALETTE.shard, 'center', '700');
    cardRects = [];
    const cw = 320;
    const ch = 250;
    const gap = 28;
    const total = cw * 3 + gap * 2;
    const x0 = (FIELD.width - total) / 2;
    const y0 = 236;
    for (let i = 0; i < choices.length; i += 1) {
      const c = choices[i];
      const x = x0 + i * (cw + gap);
      cardRects.push({ x, y: y0, w: cw, h: ch });
      context.fillStyle = PALETTE.panel;
      context.fillRect(x, y0, cw, ch);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      context.strokeRect(x + 1, y0 + 1, cw - 2, ch - 2);
      context.fillStyle = '#1b2742';
      context.fillRect(x, y0, cw, 74);
      text(`[${i + 1}]`, x + 18, y0 + 46, 24, PALETTE.shard, 'left', '800');
      text(c.icon, x + cw - 22, y0 + 50, 30, PALETTE.player, 'right', '700');
      text(c.name, x + cw / 2, y0 + 122, 26, PALETTE.text, 'center', '700');
      text(c.desc, x + cw / 2, y0 + 164, 20, PALETTE.muted, 'center');
      const stacks = state.stacks[c.id] ?? 0;
      text(stacks > 0 ? `Owned ×${stacks}` : 'New', x + cw / 2, y0 + 204, 18, stacks > 0 ? PALETTE.good : PALETTE.muted, 'center');
    }
    text('The next wave starts the moment you choose.', FIELD.width / 2, y0 + ch + 52, 20, PALETTE.muted, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, ui) {
    time += 1 / 60;
    const shake = state.shake || 0;
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + sx * view.scale, view.y + sy * view.scale);
    const best = ui.best || 0;
    if (screen === SCREEN_TITLE) {
      drawField(state, false);
      TITLE_LINES[7] = titleBestLabel(best);
      drawPanel('LUMENFALL', TITLE_LINES, 'Press Space, Enter or click to start', PALETTE.beacon);
      return;
    }
    drawField(state, screen !== SCREEN_OVER && screen !== SCREEN_WIN);
    if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) {
      drawHud(state, best, ui.muted);
    }
    if (screen === SCREEN_UPGRADE) {
      drawUpgrade(state, ui.choices || []);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The beacon holds its breath.'], 'Press P or click to resume', PALETTE.text);
    } else if (screen === SCREEN_OVER) {
      const lines = [
        state.cause === 'beacon' ? 'The beacon was destroyed.' : 'Your ship was destroyed.',
        finalLabel(state.score),
        finalBestLabel(best),
        wavesLabel(state.wavesCleared) + ` / ${LAST_WAVE}`,
        killsLabel(state.kills),
      ];
      drawPanel('GAME OVER', lines, 'Press R, Space or click to play again', PALETTE.bad);
    } else if (screen === SCREEN_WIN) {
      const lines = [
        'All 10 waves cleared. The beacon still burns.',
        finalLabel(state.score),
        finalBestLabel(best),
        wavesLabel(state.wavesCleared) + ` / ${LAST_WAVE}`,
        killsLabel(state.kills),
      ];
      drawPanel('VICTORY', lines, 'Press R, Space or click to play again', PALETTE.good);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    view() { return view; },
    /** Upgrade card rects in logical coordinates, from the last upgrade draw. */
    cardRects() { return cardRects; },
  };
}
