// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (kite the nearest enemy at firing range,
// aim at it, keep shooting), so the frame is what a real game looks like and
// the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import { rollUpgrades } from './upgrades.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 20;
const LIMIT_SECONDS = 600;

/** Steer the ship: close to 240 of the nearest enemy, then strafe; aim and fire at it. */
function autopilot(state) {
  let target = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = e.x - state.player.x;
    const dy = e.y - state.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; target = e; }
  }
  if (!target) {
    return { mx: 0, my: 0, aimX: state.player.x, aimY: state.player.y - 100, firing: false };
  }
  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  const d = Math.sqrt(bestD) || 1;
  let mx = 0;
  let my = 0;
  if (d > 260) {
    mx = dx / d;
    my = dy / d;
  } else if (d < 170) {
    mx = -dx / d;
    my = -dy / d;
  } else {
    // Strafe: orbit the enemy so the frame shows movement, not a stand-off.
    mx = -dy / d;
    my = dx / d;
  }
  return { mx, my, aimX: target.x, aimY: target.y, firing: true };
}

/** The ship stands still and never fires: the swarm reaches it, as a hurried player is caught out. */
function idleInput(state) {
  return { mx: 0, my: 0, aimX: state.player.x, aimY: state.player.y - 100, firing: false };
}

function runSteps(world, seconds, drive) {
  const steps = Math.floor(seconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events = world.step(STEP, drive(world.state), false);
    if (events & (EVENT_OVER | EVENT_WIN | EVENT_WAVE_CLEAR)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name
 * is start) and return the screen to draw, the best score to show and, for
 * the upgrade scene, the three upgrade choices on the table.
 */
export function stageShot(name, world, random) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 200, firing: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, choices: null };
  }
  if (name === 'end') {
    // Play well first, then stop fighting: the end screen shows a real run
    // (score, a cleared wave, kills) instead of a ship that never fired.
    const fought = runSteps(world, 26, autopilot);
    if (fought & EVENT_WAVE_CLEAR) world.nextWave();
    if (world.state.phase === 'fighting') runSteps(world, LIMIT_SECONDS, idleInput);
    const over = world.state.phase === 'lost';
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, choices: null };
  }
  if (name === 'upgrade') {
    runSteps(world, LIMIT_SECONDS, autopilot);
    const choices = rollUpgrades(random, world.state.stacks);
    return { screen: SCREEN_UPGRADE, best: world.state.score, choices };
  }
  // Play: fight until wave 2 is under way, so the frame shows combat, shards and the HUD.
  let events = 0;
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    events = world.step(STEP, autopilot(world.state), false);
    if (events & EVENT_WAVE_CLEAR) {
      world.nextWave();
      break;
    }
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  // A few more seconds into wave 2 for a busy frame.
  for (let i = 0; i < 4 / STEP; i += 1) {
    events = world.step(STEP, autopilot(world.state), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  const over = world.state.phase === 'lost';
  const won = world.state.phase === 'won';
  return { screen: over ? SCREEN_OVER : won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score, choices: null };
}
