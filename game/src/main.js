// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, upgrade (pick 1 of 3 between waves), paused,
// game over and victory.
//
// ?seed=N fixes the run. ?shot=start|play|upgrade|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BEACON_HIT, EVENT_BOSS, EVENT_KILL, EVENT_OVER, EVENT_PLAYER_HIT,
  EVENT_SHARD, EVENT_WAVE_CLEAR, EVENT_WAVE_START, EVENT_WIN,
} from './world.js';
import { rollUpgrades } from './upgrades.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK1, ACTION_PICK2, ACTION_PICK3,
  ACTION_RESTART, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, createRandom(seed));
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, choices: scene.choices, muted: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let choices = null;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    choices = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Playing. Wave 1. Guard the beacon.`);
  }

  function finishRun(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Victory. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function openUpgrade() {
    choices = rollUpgrades(createRandom(Math.floor(Math.random() * 4294967296)), world.state.stacks);
    screen = SCREEN_UPGRADE;
    announce(`Wave ${world.state.wave} cleared. Choose one upgrade.`);
  }

  function pickUpgrade(index) {
    if (screen !== SCREEN_UPGRADE || !choices || !choices[index]) return;
    const def = choices[index];
    world.applyUpgrade(def);
    choices = null;
    audio.upgrade();
    world.nextWave();
    audio.waveStart();
    screen = SCREEN_PLAY;
    announce(`Upgrade taken: ${def.name}. Wave ${world.state.wave}.`);
  }

  /** Mouse position in logical playfield coordinates. */
  function mouseWorld() {
    const view = renderer.view();
    const m = input.mouse();
    return { x: (m.x - view.x) / view.scale, y: (m.y - view.y) / view.scale };
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART) startGame();
    } else if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK1) pickUpgrade(0);
      else if (actions & ACTION_PICK2) pickUpgrade(1);
      else if (actions & ACTION_PICK3) pickUpgrade(2);
      else if (click) {
        const pos = mouseWorld();
        const rects = renderer.cardRects();
        for (let i = 0; i < rects.length; i += 1) {
          const r = rects[i];
          if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) {
            pickUpgrade(i);
            break;
          }
        }
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & (ACTION_RESTART | ACTION_CONFIRM)) startGame();
    }
  }

  function react(events) {
    if (events & EVENT_PLAYER_HIT) {
      audio.playerHit();
      announce(world.state.player.hp <= 25 ? `Hull critical: ${Math.ceil(world.state.player.hp)}.` : `Hit. Hull ${Math.ceil(world.state.player.hp)}.`);
    }
    if (events & EVENT_BEACON_HIT) audio.beaconHit();
    if (events & EVENT_KILL) audio.explode();
    if (events & EVENT_SHARD) audio.pickup();
    if (events & EVENT_BOSS) {
      audio.boss();
      announce('Boss inbound.');
    }
    if (events & EVENT_WAVE_START) announce(`Wave ${world.state.wave}.`);
    if (events & EVENT_WIN) finishRun(true);
    else if (events & EVENT_WAVE_CLEAR) openUpgrade();
    else if (events & EVENT_OVER) finishRun(false);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 200, firing: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const mouse = input.mouse();
    const aim = mouse.has ? mouseWorld() : { x: world.state.player.x, y: world.state.player.y - 100 };
    const events = world.step(STEP, {
      mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y, firing: input.isFiring(),
    }, false);
    react(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { best, choices, muted: audio.isMuted() });
  }

  // Leaving the tab pauses a running game rather than letting the swarm attack unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A hook for automated playtests (and nothing else): the live state, read-only from outside.
  window.__lumenfall = { world, get screen() { return screen; }, get best() { return best; } };

  announce('LUMENFALL. Guard the beacon through 10 waves. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
