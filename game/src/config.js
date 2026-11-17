// LUMENFALL — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The last wave. Clearing it wins the game. */
export const LAST_WAVE = 10;

export const PLAYER = {
  radius: 14,
  hp: 100,
  speed: 300,
  fireRate: 4.5, // shots per second
  damage: 12,
  bulletSpeed: 560,
  bulletRadius: 4,
  multishot: 1,
  pierce: 0,
  invulnerable: 0.45, // seconds of mercy after a hit
  pickupRadius: 110, // shards fly to the player inside this
  collectRadius: 24,
};

export const BEACON = {
  x: FIELD.width / 2,
  y: FIELD.height / 2,
  radius: 34,
  hp: 120,
};

export const ENEMY = {
  chaser: { hp: 20, speed: 98, radius: 13, damage: 10, score: 10, shards: 1, color: '#ff4d6d' },
  shooter: { hp: 16, speed: 72, radius: 12, damage: 8, score: 15, shards: 2, color: '#b26bff' },
  tank: { hp: 78, speed: 46, radius: 20, damage: 18, score: 25, shards: 3, color: '#ff9f43' },
  boss: { hp: 430, speed: 52, radius: 42, damage: 25, score: 150, shards: 15, color: '#ff2e88' },
};

/** Per-wave growth: enemy health and speed scale up, spawns get faster. */
export const WAVE_SCALE = { hpPerWave: 0.12, speedPerWave: 0.03, spawnInterval: 0.95, spawnScale: 0.93, minInterval: 0.35 };

export const BULLET = { enemySpeed: 210, enemyRadius: 5 };

export const SCORE = { shard: 5, waveBonus: 100 };

/** How many of each thing can exist at once; pools are allocated once, at boot. */
export const POOL = { enemies: 48, bullets: 96, ebullets: 96, shards: 160, particles: 420, floats: 24 };

export const PALETTE = {
  backdrop: '#05070f',
  space: '#0a0e1e',
  nebulaA: '#131a33',
  nebulaB: '#1c1440',
  grid: '#141c33',
  player: '#4de3ff',
  playerDark: '#1b7f9e',
  beacon: '#ffd166',
  beaconCore: '#fff3c4',
  shard: '#ffd166',
  bullet: '#aef4ff',
  ebullet: '#ff7ab8',
  panel: '#10182e',
  panelEdge: '#2a3a5f',
  text: '#eef1f5',
  muted: '#93a0b8',
  good: '#5cf2a0',
  bad: '#ff5d73',
  wave: '#ffd166',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumenfall.best';
