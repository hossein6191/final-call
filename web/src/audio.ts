// All sound is synthesized: no audio files. Scanner hum, bid blips, bells, gavel, reveal chimes,
// cash register and a quiet airport-lounge loop.

let ctx: AudioContext | null = null;
let master: GainNode;
let sfx: GainNode;
let music: GainNode;
let muted = (() => {
  try {
    return localStorage.getItem('fc:muted') === '1';
  } catch {
    return false;
  }
})();

export function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.8;
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = 0.22;
    music.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('fc:muted', muted ? '1' : '0');
  } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx!.currentTime, 0.05);
  return muted;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slide?: number; out?: AudioNode } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(opts.out ?? sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { at?: number; gain?: number; freq?: number; q?: number; type?: BiquadFilterType } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 1200;
  f.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  g.gain.value = opts.gain ?? 0.3;
  src.connect(f).connect(g).connect(sfx);
  src.start(t);
}

export const sound = {
  tap() {
    tone(900, 0.04, { type: 'triangle', gain: 0.12 });
  },
  bid(price: number, mine: boolean) {
    // Pitch climbs with the price, so a long bidding war audibly heats up.
    const f = 380 + Math.min(700, Math.log2(1 + price / 50) * 90);
    tone(f, 0.12, { type: mine ? 'square' : 'triangle', gain: mine ? 0.13 : 0.16 });
    tone(f * 1.5, 0.1, { type: 'sine', gain: 0.08, at: 0.05 });
  },
  fold() {
    tone(320, 0.25, { type: 'sawtooth', gain: 0.06, slide: 160 });
  },
  once() {
    tone(1320, 0.5, { type: 'sine', gain: 0.22 });
    tone(1980, 0.4, { type: 'sine', gain: 0.07 });
  },
  twice() {
    tone(1320, 0.35, { type: 'sine', gain: 0.22 });
    tone(1320, 0.6, { type: 'sine', gain: 0.24, at: 0.18 });
    tone(990, 0.6, { type: 'sine', gain: 0.1, at: 0.18 });
  },
  gavel() {
    tone(110, 0.25, { type: 'sine', gain: 0.6, slide: 55 });
    noise(0.08, { freq: 1800, q: 2, gain: 0.5 });
    tone(220, 0.08, { type: 'square', gain: 0.08 });
  },
  sold(win: boolean) {
    this.gavel();
    const chord = win ? [523, 659, 784, 1047] : [392, 466, 587];
    chord.forEach((f, i) => tone(f, 0.7, { type: 'triangle', gain: 0.12, at: 0.12 + i * 0.05 }));
  },
  zip() {
    for (let i = 0; i < 9; i++) noise(0.03, { at: i * 0.035, freq: 2500 + i * 200, q: 4, gain: 0.25 });
  },
  pop(rarity: number) {
    const base = [440, 523, 659, 784, 988][rarity] ?? 440;
    tone(base, 0.18, { type: 'triangle', gain: 0.18 });
    if (rarity >= 2) [1.25, 1.5, 2].forEach((m, i) => tone(base * m, 0.25, { type: 'sine', gain: 0.1, at: 0.06 * (i + 1) }));
    if (rarity >= 4) this.jackpot();
  },
  crack() {
    noise(0.12, { freq: 600, q: 0.8, gain: 0.35 });
  },
  breakEven() {
    [784, 988, 1175].forEach((f, i) => tone(f, 0.3, { type: 'sine', gain: 0.14, at: i * 0.07 }));
  },
  jackpot() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.5, { type: 'square', gain: 0.07, at: 0.15 + i * 0.07 }));
    noise(0.6, { at: 0.15, freq: 6000, type: 'highpass', gain: 0.08 });
  },
  cash() {
    tone(1568, 0.08, { type: 'square', gain: 0.08 });
    tone(2093, 0.25, { type: 'square', gain: 0.08, at: 0.07 });
    noise(0.15, { at: 0.05, freq: 5000, type: 'highpass', gain: 0.12 });
  },
  error() {
    tone(200, 0.2, { type: 'square', gain: 0.08 });
    tone(150, 0.25, { type: 'square', gain: 0.08, at: 0.12 });
  },
};

// ---------- scanner hum ----------
let hum: { stop: () => void } | null = null;
export function scanHum(on: boolean) {
  if (!ctx) return;
  if (!on) {
    hum?.stop();
    hum = null;
    return;
  }
  if (hum) return;
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = 60;
  lfo.frequency.value = 7;
  lfoGain.gain.value = 6;
  lfo.connect(lfoGain).connect(o.frequency);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 500;
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.2);
  o.connect(f).connect(g).connect(sfx);
  o.start();
  lfo.start();
  hum = {
    stop: () => {
      g.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.08);
      o.stop(ctx!.currentTime + 0.4);
      lfo.stop(ctx!.currentTime + 0.4);
    },
  };
}

// ---------- lounge loop ----------
let loop: number | null = null;
const PROG = [
  [261.6, 329.6, 392.0, 493.9], // Cmaj7
  [220.0, 261.6, 329.6, 392.0], // Am7
  [293.7, 349.2, 440.0, 523.3], // Dm7
  [196.0, 246.9, 293.7, 349.2], // G7
];
export function startMusic() {
  if (!ctx || loop !== null) return;
  let bar = 0;
  const beat = 60 / 84;
  const play = () => {
    const chord = PROG[bar % PROG.length];
    chord.forEach((f, i) => tone(f, beat * 3.6, { type: 'sine', gain: 0.05, at: i * 0.02, out: music }));
    tone(chord[0] / 2, beat * 1.8, { type: 'triangle', gain: 0.09, out: music });
    tone(chord[2] / 2, beat * 1.6, { type: 'triangle', gain: 0.07, at: beat * 2, out: music });
    bar++;
  };
  play();
  loop = window.setInterval(play, beat * 4 * 1000);
}
export function stopMusic() {
  if (loop !== null) clearInterval(loop);
  loop = null;
}

export function buzz(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
