// All sound is synthesised with WebAudio — no audio files. Short oscillator
// blips for effects, and a quiet procedural music loop: a minor-key bass
// line with a soft lead, scheduled a little ahead of time so it never gaps.
// Everything is a no-op until the first user gesture creates the context.

const MUSIC_BPM = 96;
const BEAT = 60 / MUSIC_BPM;
// A-minor-ish bass line, one note per beat, in Hz.
const BASS_LINE = [55, 0, 65.41, 0, 49, 0, 58.27, 0, 55, 0, 65.41, 0, 73.42, 82.41, 65.41, 0];
const LEAD_LINE = [220, 0, 261.63, 329.63, 0, 261.63, 0, 196, 220, 0, 0, 293.66, 329.63, 0, 261.63, 0];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = 0;
  let nextNoteTime = 0;
  let noteIndex = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.14;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from a user gesture (start, click) so the browser lets sound play. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    startMusic();
  }

  function tone(freq, duration, type, volume, slideTo, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noise(duration, volume, lowpass, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  function scheduleMusic() {
    if (!ctx || muted) return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const bass = BASS_LINE[noteIndex % BASS_LINE.length];
      const lead = LEAD_LINE[noteIndex % LEAD_LINE.length];
      if (bass > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = bass;
        gain.gain.setValueAtTime(0.5, nextNoteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + BEAT * 0.9);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + BEAT);
      }
      if (lead > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = lead;
        gain.gain.setValueAtTime(0.22, nextNoteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + BEAT * 0.9);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + BEAT);
      }
      nextNoteTime += BEAT;
      noteIndex += 1;
    }
  }

  function startMusic() {
    if (musicTimer !== 0 || !ctx) return;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = window.setInterval(scheduleMusic, 100);
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
    if (muted && musicTimer !== 0) {
      window.clearInterval(musicTimer);
      musicTimer = 0;
    } else if (!muted && ctx) {
      startMusic();
    }
  }

  return {
    unlock,
    isMuted() { return muted; },
    toggleMute() { setMuted(!muted); return muted; },
    shoot() { tone(720, 0.07, 'square', 0.08, 340); },
    hit() { tone(240, 0.05, 'square', 0.07, 140); },
    explode() { noise(0.35, 0.28, 900); tone(110, 0.3, 'sawtooth', 0.14, 40); },
    pickup() { tone(880, 0.08, 'sine', 0.09, 1320); },
    playerHit() { tone(160, 0.2, 'sawtooth', 0.2, 60); noise(0.15, 0.15, 600); },
    beaconHit() { tone(196, 0.18, 'triangle', 0.16, 98); },
    waveStart() { tone(330, 0.12, 'triangle', 0.14); tone(440, 0.16, 'triangle', 0.14, 0, 0.12); tone(660, 0.22, 'triangle', 0.12, 0, 0.26); },
    boss() { tone(55, 0.5, 'sawtooth', 0.22, 110); tone(58.27, 0.5, 'sawtooth', 0.18, 116, 0.1); },
    upgrade() { tone(523.25, 0.1, 'sine', 0.12); tone(659.25, 0.1, 'sine', 0.12, 0, 0.09); tone(783.99, 0.18, 'sine', 0.12, 0, 0.18); },
    win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, 0, i * 0.14)); },
    lose() { [392, 311.13, 233.08, 155.56].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, 0, i * 0.16)); },
  };
}
