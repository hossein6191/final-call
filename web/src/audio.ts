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
    noise(0.03, { freq: 1800, q: 2, gain: 0.6 });
    tone(80, 0.15, { type: 'sine', gain: 0.7, slide: 50 });
    tone(220, 0.06, { type: 'square', gain: 0.06 });
    // room tail
    noise(0.6, { at: 0.02, freq: 700, q: 0.5, type: 'lowpass', gain: 0.12 });
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

// ---------- the auctioneer ----------
// A real voice (the browser's speech engine) calls the auction. It is short on purpose so it
// never lags behind the clock.
let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  try {
    const all = speechSynthesis.getVoices();
    const pref = ['Daniel', 'Google UK English Male', 'Alex', 'Fred', 'Google US English'];
    voice = pref.map((n) => all.find((v) => v.name.includes(n))).find(Boolean) ?? all.find((v) => v.lang.startsWith('en')) ?? null;
  } catch {
    voice = null;
  }
}
try {
  speechSynthesis.onvoiceschanged = pickVoice;
  pickVoice();
} catch {}

export function announce(text: string, opts: { rate?: number; pitch?: number; urgent?: boolean } = {}) {
  if (muted) return;
  try {
    if (opts.urgent) speechSynthesis.cancel();
    else if (speechSynthesis.speaking) return;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? 1.18;
    u.pitch = opts.pitch ?? 0.85;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch {}
}

export function hush() {
  try {
    speechSynthesis.cancel();
  } catch {}
}

// ---------- crowd and tension ----------
let crowd: { gain: GainNode; stop: () => void } | null = null;
export function crowdBed(on: boolean) {
  if (!ctx) return;
  if (!on) {
    crowd?.stop();
    crowd = null;
    return;
  }
  if (crowd) return;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish murmur
    d[i] = last * 6;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 420;
  f.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.8);
  src.connect(f).connect(g).connect(sfx);
  src.start();
  crowd = {
    gain: g,
    stop: () => {
      g.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.3);
      src.stop(ctx!.currentTime + 1.5);
    },
  };
}

/** The room reacts to a bid: a short swell of murmur. */
export function crowdSwell(amount = 1) {
  if (!ctx || !crowd) return;
  const t = ctx.currentTime;
  crowd.gain.gain.cancelScheduledValues(t);
  crowd.gain.gain.setValueAtTime(crowd.gain.gain.value, t);
  crowd.gain.gain.linearRampToValueAtTime(0.05 + 0.07 * amount, t + 0.12);
  crowd.gain.gain.linearRampToValueAtTime(0.05, t + 1.2);
}

// ---------- the chant ----------
// Auctioneer patter as formant-filtered syllables on a 150 BPM eighth-note grid. It carries the
// rhythm; the numbers are on screen. (Spoken words are kept for "going once/twice/sold".)
let chantTimer: number | null = null;
let chantStep = 0;
function syllable(pitch: number, vowel: number, at = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(pitch, t);
  o.frequency.linearRampToValueAtTime(pitch * 0.94, t + 0.08);
  const formants = [
    [700, 1200], // ah
    [400, 2000], // ee
    [500, 900], // oh
    [600, 1700], // eh
  ][vowel % 4];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
  for (const f of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 6;
    o.connect(bp).connect(g);
  }
  g.connect(sfx);
  o.start(t);
  o.stop(t + 0.1);
}
export function chant(on: boolean, heat = 0) {
  if (!ctx) return;
  if (!on) {
    if (chantTimer !== null) clearInterval(chantTimer);
    chantTimer = null;
    return;
  }
  if (chantTimer !== null) return;
  chantStep = 0;
  const base = 150 + heat * 12;
  chantTimer = window.setInterval(() => {
    // phrases of 6 syllables with a pitch glide, a rest every 8 steps
    const pos = chantStep % 8;
    if (pos < 6) syllable(base * Math.pow(2, (Math.random() * 4 - 2 + pos * 0.5) / 12), Math.floor(Math.random() * 4));
    chantStep++;
  }, 200);
}

export const tension = {
  geiger(rate: number) {
    // one tick; the caller decides how often (4-20 per second)
    noise(0.004, { freq: 2000 + rate * 100, q: 3, gain: 0.35 });
  },
  lock() {
    tone(1100, 0.06, { type: 'sine', gain: 0.12 });
    tone(1650, 0.08, { type: 'sine', gain: 0.08, at: 0.05 });
  },
  count(step: number) {
    // rising notes as a number counts up (C D E F G ...)
    const scale = [523, 587, 659, 698, 784, 880, 988, 1047];
    tone(scale[step % scale.length] * (step >= scale.length ? 2 : 1), 0.05, { type: 'triangle', gain: 0.06 });
  },
  drumroll(ms: number) {
    for (let t = 0; t < ms / 1000; t += 0.045) noise(0.04, { at: t, freq: 900, q: 0.8, gain: 0.12 + (t / (ms / 1000)) * 0.2 });
  },
  deflate() {
    tone(420, 0.6, { type: 'sawtooth', gain: 0.07, slide: 110 });
  },
  ooh() {
    noise(0.7, { freq: 520, q: 2.5, gain: 0.25 });
    tone(220, 0.6, { type: 'sine', gain: 0.05, slide: 260 });
  },
  tick(fast: boolean) {
    tone(fast ? 1800 : 1400, 0.03, { type: 'square', gain: fast ? 0.07 : 0.05 });
  },
  heartbeat() {
    tone(62, 0.12, { type: 'sine', gain: 0.5, slide: 45 });
    tone(58, 0.12, { type: 'sine', gain: 0.38, slide: 42, at: 0.18 });
  },
  whoosh() {
    noise(0.35, { freq: 900, q: 0.7, gain: 0.25 });
  },
  clunk() {
    tone(90, 0.18, { type: 'sine', gain: 0.45, slide: 60 });
    noise(0.05, { freq: 300, q: 1, gain: 0.3 });
  },
  xrayOn() {
    tone(2400, 0.12, { type: 'sine', gain: 0.08, slide: 3200 });
    noise(0.12, { freq: 7000, type: 'highpass', gain: 0.06 });
  },
  rumble(level: number) {
    // a sub-bass swell for big moments (jackpots, bidding wars)
    tone(40 + level * 6, 0.6, { type: 'sine', gain: 0.25 + level * 0.1 });
  },
  sniped() {
    tone(700, 0.15, { type: 'sawtooth', gain: 0.08, slide: 300 });
    tone(500, 0.3, { type: 'sawtooth', gain: 0.07, slide: 180, at: 0.12 });
  },
  rise(rarity: number) {
    // anticipation before a pouch opens; longer and higher for rarer things
    const dur = [0.25, 0.3, 0.45, 0.7, 1.1][rarity] ?? 0.3;
    tone(300, dur, { type: 'sine', gain: 0.1, slide: 300 * (1.5 + rarity * 0.6) });
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
