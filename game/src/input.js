// Keyboard and pointer input. Held keys give a move direction and a fire
// state; one-shot presses (start, pause, mute, restart, upgrade picks) are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. The mouse position is kept
// in canvas device pixels; the main loop turns it into world coordinates.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_PICK1 = 16;
export const ACTION_PICK2 = 32;
export const ACTION_PICK3 = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const PICKS = { Digit1: ACTION_PICK1, Digit2: ACTION_PICK2, Digit3: ACTION_PICK3, Numpad1: ACTION_PICK1, Numpad2: ACTION_PICK2, Numpad3: ACTION_PICK3 };

export function createInput(target) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let firing = false;
  let mouseX = 0;
  let mouseY = 0;
  let click = null; // {x, y} in canvas device pixels, taken once
  let hasMouse = false;

  function trackMouse(event) {
    const rect = target.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    mouseX = (event.clientX - rect.left) * ratio;
    mouseY = (event.clientY - rect.top) * ratio;
    hasMouse = true;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      firing = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (PICKS[event.code]) {
      if (!event.repeat) actions |= PICKS[event.code];
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
    else if (CONFIRM.has(event.code)) firing = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = false;
    firing = false;
  });
  target.addEventListener('pointermove', trackMouse);
  target.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    firing = true;
    actions |= ACTION_CONFIRM;
    click = { x: mouseX, y: mouseY };
  });
  window.addEventListener('pointerup', () => { firing = false; });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised move direction {x, y}, each in [-1, 1]. */
    move() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.sqrt(2);
        return { x: x * inv, y: y * inv };
      }
      return { x, y };
    },
    isFiring() { return firing; },
    mouse() { return { x: mouseX, y: mouseY, has: hasMouse }; },
    /** The one-shot click position since the last call, or null. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
