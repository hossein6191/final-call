// Final Call's sound. Everything is synthesized live (no audio files), modelled on real
// objects: wooden paddles, a desk bell, a gavel, zipper teeth, velcro, coins, a crowd, an
// airport chime, and a small lounge band. Every hit is randomized slightly so nothing
// repeats exactly. No speech synthesis.

let ctx: AudioContext | null = null;
let master: GainNode;
let sfx: GainNode;
let music: GainNode;
let verbIn: GainNode;
let white: AudioBuffer;
let brown: AudioBuffer;
let muted = (() => {
  try {
    return localStorage.getItem('fc:muted') === '1';
  } catch {
    return false;
  }
})();

const R = (a: number, b: number) => a + Math.random() * (b - a);
const vary = (x: number, p = 0.05) => x * (1 + R(-p, p));
const now = () => ctx!.currentTime;

function makeNoise(seconds: number, brownish: boolean): AudioBuffer {
  const len = Math.floor(ctx!.sampleRate * seconds);
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brownish) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function makeReverb(seconds = 2.2, decay = 3.2): ConvolverNode {
  const c = ctx!.createConvolver();
  const len = Math.floor(ctx!.sampleRate * seconds);
  const buf = ctx!.createBuffer(2, len, ctx!.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  c.buffer = buf;
  return c;
}

export function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.95;
    master.connect(comp);
    sfx = ctx.createGain();
    sfx.gain.value = 0.85 * vol.sfx;
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = 0.4 * vol.music;
    music.connect(master);
    const verb = makeReverb();
    verbIn = ctx.createGain();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.32;
    verbIn.connect(verb).connect(verbOut).connect(master);
    white = makeNoise(2, false);
    brown = makeNoise(2, true);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

// Player volume settings, 0..1, kept on this device.
const vol = (() => {
  try {
    return { music: 0.5, sfx: 1, haptics: true, ...JSON.parse(localStorage.getItem('fc:vol') ?? '{}') };
  } catch {
    return { music: 0.5, sfx: 1, haptics: true };
  }
})() as { music: number; sfx: number; haptics: boolean };

export function getVolume() {
  return { ...vol };
}
export function setVolume(v: Partial<typeof vol>) {
  Object.assign(vol, v);
  try {
    localStorage.setItem('fc:vol', JSON.stringify(vol));
  } catch {}
  if (!ctx) return;
  sfx.gain.setTargetAtTime(0.85 * vol.sfx, now(), 0.05);
  music.gain.setTargetAtTime(0.4 * vol.music, now(), 0.05);
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('fc:muted', muted ? '1' : '0');
  } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.95, now(), 0.05);
  return muted;
}

// ---------- building blocks ----------

interface Opt {
  at?: number;
  peak?: number;
  verb?: number;
  bus?: AudioNode;
}

function route(node: AudioNode, o: Opt) {
  node.connect(o.bus ?? sfx);
  if (o.verb) {
    const s = ctx!.createGain();
    s.gain.value = o.verb;
    node.connect(s).connect(verbIn);
  }
}

function osc(type: OscillatorType, f: number, dur: number, o: Opt & { to?: number; attack?: number } = {}) {
  if (!ctx) return;
  const t = now() + (o.at ?? 0);
  const x = ctx.createOscillator();
  const g = ctx.createGain();
  x.type = type;
  x.frequency.setValueAtTime(f, t);
  if (o.to) x.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.peak ?? 0.2, t + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  x.connect(g);
  route(g, o);
  x.start(t);
  x.stop(t + dur + 0.05);
}

function noise(dur: number, o: Opt & { f?: number; to?: number; q?: number; type?: BiquadFilterType; attack?: number; brown?: boolean } = {}) {
  if (!ctx) return;
  const t = now() + (o.at ?? 0);
  const s = ctx.createBufferSource();
  s.buffer = o.brown ? brown : white;
  s.playbackRate.value = R(0.9, 1.1);
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f ?? 1500, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.peak ?? 0.2, t + (o.attack ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g);
  route(g, o);
  s.start(t, R(0, 1.5));
  s.stop(t + dur + 0.05);
}

/** Struck wood: a pitched body plus a click. Paddles, ticks, gavel, drawers. */
function wood(f: number, o: Opt & { decay?: number } = {}) {
  const d = o.decay ?? 0.07;
  osc('sine', vary(f, 0.03), d, { ...o, to: f * 0.92, peak: o.peak ?? 0.3 });
  osc('triangle', vary(f * 2.7, 0.03), d * 0.5, { ...o, peak: (o.peak ?? 0.3) * 0.35 });
  noise(0.012, { ...o, f: f * 3.2, q: 3, peak: (o.peak ?? 0.3) * 0.6 });
}

const DESK_BELL = [
  [1, 1],
  [2.32, 0.42],
  [4.25, 0.24],
  [6.63, 0.12],
  [9.38, 0.06],
];
const GLASS = [
  [1, 1],
  [2.76, 0.3],
  [5.4, 0.12],
];

/** A bell or chime built from inharmonic partials, with a long tail. */
function bell(f: number, o: Opt & { dur?: number; partials?: number[][] } = {}) {
  const dur = o.dur ?? 1.4;
  for (const [ratio, amp] of o.partials ?? DESK_BELL) {
    osc('sine', vary(f * ratio, 0.004), dur / Math.sqrt(ratio), { ...o, peak: (o.peak ?? 0.16) * amp, verb: o.verb ?? 0.35, attack: 0.002 });
  }
}

/** A small metallic clink (coins, keys). */
function clink(f: number, o: Opt = {}) {
  for (const [ratio, amp] of [
    [1, 1],
    [1.47, 0.6],
    [2.09, 0.4],
    [2.9, 0.2],
  ]) {
    osc('sine', vary(f * ratio, 0.01), R(0.08, 0.22), { ...o, peak: (o.peak ?? 0.06) * amp, verb: 0.15 });
  }
}

/** Electric-piano voice (two-operator FM). */
function rhodes(f: number, dur: number, o: Opt = {}) {
  if (!ctx) return;
  const t = now() + (o.at ?? 0);
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const mg = ctx.createGain();
  const g = ctx.createGain();
  car.frequency.value = f;
  mod.frequency.value = f;
  mg.gain.setValueAtTime(f * 2.2, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.15, t + Math.min(dur, 0.9));
  mod.connect(mg).connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.peak ?? 0.05, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g);
  route(g, { ...o, verb: o.verb ?? 0.25 });
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

function applause(dur: number, density = 1) {
  const n = Math.floor(dur * 55 * density);
  for (let i = 0; i < n; i++) {
    const at = Math.pow(Math.random(), 1.6) * dur;
    noise(R(0.012, 0.03), { at, f: R(900, 2600), q: R(0.8, 1.6), peak: R(0.04, 0.12) * (1 - at / dur) + 0.02, verb: 0.3 });
  }
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- one-shot sounds ----------

export const sound = {
  tap() {
    wood(R(1500, 1900), { peak: 0.1, decay: 0.03 });
  },
  /** A rival's cackle: five "ha"s, each a voiced burst falling in pitch. */
  laugh() {
    for (let i = 0; i < 5; i++) {
      const at = i * 0.16;
      const f = 260 - i * 18 + R(-8, 8);
      osc('sawtooth', f, 0.11, { at, to: f * 0.82, peak: 0.07 });
      osc('sine', f * 2, 0.1, { at, to: f * 1.6, peak: 0.04 });
      noise(0.09, { at, f: R(900, 1300), q: 2.5, peak: 0.08 });
    }
  },
  /** Coins pouring onto the table. */
  coins() {
    for (let i = 0; i < 16; i++) clink(R(2600, 4200), { at: i * 0.045 + R(0, 0.03), peak: 0.035 });
  },
  bid(price: number, mine: boolean) {
    // a paddle swishes up and taps: higher as the price climbs
    const f = 240 + Math.min(420, Math.log2(1 + price / 50) * 55);
    noise(0.09, { f: 2600, to: 900, q: 0.8, peak: 0.09 });
    wood(mine ? f * 1.5 : f, { at: 0.05, peak: mine ? 0.22 : 0.3, decay: 0.09, verb: 0.12 });
  },
  fold() {
    noise(0.22, { type: 'lowpass', f: 700, to: 250, peak: 0.12, brown: true });
    wood(R(260, 300), { at: 0.05, peak: 0.12 });
    wood(R(200, 230), { at: 0.15, peak: 0.1 });
  },
  once() {
    bell(vary(1975, 0.01), { peak: 0.16, dur: 1.3 });
  },
  twice() {
    bell(vary(1975, 0.01), { peak: 0.15, dur: 0.9 });
    bell(vary(1865, 0.01), { at: 0.17, peak: 0.17, dur: 1.4 });
  },
  gavel() {
    osc('sine', 78, 0.24, { to: 46, peak: 0.75, verb: 0.3 });
    wood(vary(390, 0.04), { peak: 0.5, decay: 0.13, verb: 0.45 });
    wood(vary(780, 0.04), { peak: 0.2, decay: 0.06, verb: 0.3 });
    noise(0.03, { f: 1900, q: 2, peak: 0.45, verb: 0.4 });
  },
  sold(win: boolean) {
    this.gavel();
    const root = 60 + Math.floor(R(0, 3));
    const chord = win ? [0, 4, 7, 11, 14] : [0, 3, 7, 10];
    chord.forEach((n, i) => rhodes(midi(root + n), 1.6, { at: 0.16 + i * 0.03, peak: 0.06 }));
    if (win) applause(1.8, 1);
    else noise(0.9, { at: 0.2, f: 500, to: 300, q: 2.5, peak: 0.14, verb: 0.3 }); // the room goes "aww"
  },
  zip() {
    // zipper teeth: a run of tiny clicks that speeds up, over a cloth swish
    let t = 0;
    const n = Math.floor(R(18, 26));
    for (let i = 0; i < n; i++) {
      noise(0.004, { at: t, f: R(3200, 5200), q: 4, peak: R(0.12, 0.22) });
      t += 0.024 - (i / n) * 0.015 + R(-0.002, 0.002);
    }
    noise(t + 0.05, { f: 1800, q: 0.6, peak: 0.05, brown: true });
  },
  pop(rarity: number) {
    noise(0.09, { type: 'lowpass', f: 420, peak: 0.22, brown: true }); // the item lands on the table
    if (rarity === 0) wood(R(520, 700), { at: 0.02, peak: 0.14 });
    if (rarity === 1) bell(vary(1318), { at: 0.02, partials: GLASS, dur: 0.7, peak: 0.09 });
    if (rarity === 2) [1568, 2093].forEach((f, i) => bell(vary(f, 0.005), { at: 0.03 + i * 0.09, partials: GLASS, dur: 0.9, peak: 0.1 }));
    if (rarity === 3) {
      [1046, 1318, 1568, 2093].forEach((f, i) => bell(f, { at: 0.03 + i * 0.08, partials: GLASS, dur: 1.2, peak: 0.1 }));
      noise(0.6, { at: 0.1, type: 'highpass', f: 7000, peak: 0.04, verb: 0.4 });
    }
    if (rarity >= 4) this.jackpot();
  },
  crack() {
    // velcro tearing open
    let t = 0;
    for (let i = 0; i < 14; i++) {
      noise(R(0.006, 0.014), { at: t, f: R(1800, 3400), q: 1.2, peak: R(0.08, 0.18) });
      t += R(0.008, 0.02);
    }
  },
  chime() {
    // the airport PA chime: ding... dong
    bell(midi(81), { partials: GLASS, dur: 1.2, peak: 0.11 });
    bell(midi(76), { at: 0.38, partials: GLASS, dur: 1.8, peak: 0.11 });
  },
  breakEven() {
    // the airport chime, rising: you're in profit
    bell(midi(76), { partials: GLASS, dur: 1.3, peak: 0.12 });
    bell(midi(81), { at: 0.32, partials: GLASS, dur: 1.6, peak: 0.12 });
  },
  jackpot() {
    [72, 74, 76, 79, 81, 84, 86, 88].forEach((m, i) => bell(midi(m), { at: 0.1 + i * 0.07, partials: GLASS, dur: 1.4, peak: 0.08 }));
    osc('sine', 44, 1.2, { peak: 0.3 });
    applause(2.6, 1.3);
    noise(1.2, { at: 0.2, type: 'highpass', f: 6500, peak: 0.05, verb: 0.5 });
  },
  cash() {
    for (let i = 0; i < 4; i++) clink(R(2600, 4300), { at: R(0, 0.22), peak: 0.06 });
    wood(160, { at: 0.02, peak: 0.3, decay: 0.15 }); // the drawer
    noise(0.05, { at: 0.02, type: 'lowpass', f: 600, peak: 0.18, brown: true });
  },
  whoosh() {
    noise(0.5, { f: 400, to: 2400, q: 0.7, peak: 0.12 });
  },
  error() {
    wood(210, { peak: 0.16 });
    wood(170, { at: 0.12, peak: 0.16 });
  },
};

// The auctioneer now speaks through the bells and the room, not a computer voice.
export function announce(_text: string, _opts: object = {}) {}
export function hush() {}
export function chant(_on: boolean, _heat = 0) {}

// ---------- crowd ----------
let crowd: { gains: GainNode[]; stop: () => void } | null = null;
export function crowdBed(on: boolean) {
  if (!ctx) return;
  if (!on) {
    crowd?.stop();
    crowd = null;
    return;
  }
  if (crowd) return;
  const gains: GainNode[] = [];
  const srcs: AudioBufferSourceNode[] = [];
  for (let i = 0; i < 5; i++) {
    const s = ctx.createBufferSource();
    s.buffer = brown;
    s.loop = true;
    s.playbackRate.value = R(0.85, 1.15);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = R(260, 720);
    f.Q.value = R(1.2, 2.2);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    s.connect(f).connect(g);
    route(g, { verb: 0.3 });
    s.start(now(), R(0, 1.8));
    gains.push(g);
    srcs.push(s);
  }
  // each voice drifts in and out like people talking
  const timer = window.setInterval(() => {
    for (const g of gains) g.gain.setTargetAtTime(R(0.004, 0.035), now(), R(0.2, 0.6));
  }, 450);
  crowd = {
    gains,
    stop: () => {
      clearInterval(timer);
      for (const g of gains) g.gain.setTargetAtTime(0.0001, now(), 0.3);
      for (const s of srcs) s.stop(now() + 1.5);
    },
  };
}

/** The room reacts to a bid. */
export function crowdSwell(amount = 1) {
  if (!ctx || !crowd) return;
  for (const g of crowd.gains) {
    g.gain.cancelScheduledValues(now());
    g.gain.setTargetAtTime(0.03 + 0.05 * amount * Math.random(), now(), 0.05);
  }
  musicIntensity(0.3 + amount * 0.7);
}

// ---------- tension ----------
let tickTock = false;
export const tension = {
  tick(fast: boolean) {
    tickTock = !tickTock; // a wall clock: tick, tock
    wood(tickTock ? 2500 : 1900, { peak: fast ? 0.14 : 0.08, decay: 0.025 });
  },
  heartbeat() {
    osc('sine', 60, 0.15, { to: 40, peak: 0.42 });
    osc('sine', 54, 0.15, { to: 38, peak: 0.3, at: 0.17 });
  },
  geiger(_rate: number) {
    noise(0.002, { type: 'highpass', f: R(3500, 5500), peak: R(0.15, 0.3) });
  },
  lock() {
    bell(2637, { partials: GLASS, dur: 0.45, peak: 0.07 });
  },
  count(step: number) {
    // a marimba walking up the scale as the number counts
    const scale = [72, 74, 76, 77, 79, 81, 83, 84, 86, 88];
    const f = midi(scale[step % scale.length]);
    osc('sine', f, 0.22, { peak: 0.09, verb: 0.15 });
    osc('sine', f * 4, 0.05, { peak: 0.03 });
  },
  drumroll(ms: number) {
    const dur = ms / 1000;
    for (let t = 0; t < dur; t += R(0.026, 0.038)) noise(0.03, { at: t, f: R(1500, 2200), q: 0.8, peak: 0.05 + (t / dur) * 0.15 });
    noise(0.9, { at: dur, type: 'highpass', f: 5000, peak: 0.12, verb: 0.4 }); // cymbal
    osc('sine', 70, 0.3, { at: dur, to: 45, peak: 0.4 });
  },
  deflate() {
    osc('sawtooth', 220, 0.35, { to: 196, peak: 0.05 });
    osc('sawtooth', 196, 0.6, { at: 0.32, to: 150, peak: 0.05 });
  },
  ooh() {
    for (let i = 0; i < 6; i++) noise(0.8, { at: R(0, 0.08), f: R(380, 620), to: R(520, 760), q: 3, peak: 0.07, attack: 0.15, verb: 0.3 });
  },
  rumble(level: number) {
    osc('sine', 42 + level * 4, 0.9, { peak: 0.22 + level * 0.08, attack: 0.08 });
  },
  sniped() {
    noise(0.2, { f: 3200, to: 500, q: 3, peak: 0.18 });
    wood(240, { at: 0.12, peak: 0.2 });
  },
  rise(rarity: number) {
    const dur = [0.25, 0.32, 0.5, 0.75, 1.15][rarity] ?? 0.3;
    noise(dur, { f: 300, to: 1400 + rarity * 900, q: 1.4, peak: 0.06 + rarity * 0.025, attack: dur * 0.8 });
  },
  whoosh() {
    noise(0.45, { type: 'lowpass', f: 300, to: 1600, peak: 0.16, brown: true });
  },
  clunk() {
    osc('sine', 92, 0.2, { to: 52, peak: 0.5 });
    noise(0.08, { type: 'lowpass', f: 500, peak: 0.3, brown: true });
    for (let i = 0; i < 4; i++) wood(R(900, 1200), { at: 0.06 + i * 0.045, peak: 0.05, decay: 0.02 }); // rollers
  },
  xrayOn() {
    osc('sine', 140, 0.35, { to: 620, peak: 0.05 });
    osc('sine', 1180, 0.09, { at: 0.3, peak: 0.07 });
    osc('sine', 1180, 0.09, { at: 0.42, peak: 0.07 });
  },
};

// ---------- conveyor and scanner ----------
let hum: { stop: () => void } | null = null;
export function scanHum(on: boolean) {
  if (!ctx) return;
  if (!on) {
    hum?.stop();
    hum = null;
    return;
  }
  if (hum) return;
  const s = ctx.createBufferSource();
  s.buffer = brown;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 220;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.16, now() + 0.3);
  s.connect(f).connect(g).connect(sfx);
  s.start();
  const mains = ctx.createOscillator();
  mains.frequency.value = 50;
  const mg = ctx.createGain();
  mg.gain.value = 0.015;
  mains.connect(mg).connect(sfx);
  mains.start();
  const rollers = window.setInterval(() => wood(R(900, 1150), { peak: 0.025, decay: 0.015 }), 170);
  hum = {
    stop: () => {
      clearInterval(rollers);
      g.gain.setTargetAtTime(0.0001, now(), 0.1);
      mg.gain.setTargetAtTime(0.0001, now(), 0.1);
      s.stop(now() + 0.6);
      mains.stop(now() + 0.6);
    },
  };
}

// ---------- music ----------
// Lounge: electric piano, walking bass, brushes. Auction: a low pulse that rises with the bidding.
type Mode = 'lounge' | 'auction' | 'off';
let mode: Mode = 'off';
let nextBar = 0;
let barTimer: number | null = null;
let intensity = 0.3;
let progression: number[][] = [];

// ii-V-I-vi style progressions, as chord tones (MIDI), root first
const PROGS = [
  [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 52, 55, 58, 61]],
  [[53, 57, 60, 64, 67], [52, 55, 59, 62, 67], [50, 53, 57, 60, 64], [43, 53, 55, 59, 62]],
  [[48, 52, 55, 59, 62], [45, 52, 55, 60, 64], [50, 53, 57, 60, 65], [43, 50, 53, 59, 64]],
  [[57, 60, 64, 67, 71], [50, 57, 60, 65, 69], [55, 59, 62, 65, 69], [48, 55, 59, 62, 64]],
];

function loungeBar(t0: number, chord: number[], beat: number) {
  const at = (x: number) => Math.max(0, t0 + x - now() + R(-0.008, 0.008));
  const voicing = chord.slice(1).map((n) => (Math.random() < 0.3 ? n + 12 : n));
  voicing.forEach((n) => rhodes(midi(n), beat * 3.4, { at: at(0), peak: 0.032, bus: music }));
  if (Math.random() < 0.6) voicing.slice(1, 4).forEach((n) => rhodes(midi(n), beat * 1.2, { at: at(beat * 2.5), peak: 0.022, bus: music }));
  // walking bass on the beats
  const root = chord[0] - 12;
  const walk = [root, root + (Math.random() < 0.5 ? 4 : 3), root + 7, root + (Math.random() < 0.5 ? 10 : 9)];
  walk.forEach((n, i) => osc('triangle', midi(n), beat * 0.9, { at: at(i * beat), peak: 0.14, bus: music, attack: 0.01 }));
  // brushes on 2 and 4, a soft ride on every beat
  for (const b of [1, 3]) noise(beat * 0.7, { at: at(b * beat), f: 3200, q: 0.5, peak: 0.035, attack: 0.03, bus: music });
  for (let i = 0; i < 4; i++) noise(0.12, { at: at(i * beat), type: 'highpass', f: 7500, peak: 0.018, bus: music });
}

function auctionBar(t0: number, beat: number) {
  const at = (x: number) => Math.max(0, t0 + x - now());
  const root = 45; // A
  const pattern = [0, 0, 12, 0, 0, 7, 0, 10];
  pattern.forEach((n, i) => osc('sawtooth', midi(root + n - 12), beat * 0.4, { at: at((i * beat) / 2), peak: 0.035 + intensity * 0.04, bus: music, attack: 0.005 }));
  for (let i = 0; i < 8; i++) noise(0.04, { at: at((i * beat) / 2), type: 'highpass', f: 8000, peak: 0.01 + intensity * 0.03, bus: music });
  osc('sine', midi(root - 24), beat * 4, { at: at(0), peak: 0.08 + intensity * 0.06, bus: music, attack: 0.3 });
  if (intensity > 0.6) for (let i = 0; i < 4; i++) osc('sine', midi(root + 12 + [0, 3, 7, 12][i]), beat * 0.25, { at: at(i * beat), peak: 0.02, bus: music });
}

function scheduleBar() {
  if (!ctx || mode === 'off') return;
  const beat = mode === 'lounge' ? 60 / 84 : 60 / 118;
  if (nextBar < now()) nextBar = now() + 0.05;
  if (mode === 'lounge') {
    if (!progression.length) progression = PROGS[Math.floor(Math.random() * PROGS.length)].slice();
    loungeBar(nextBar, progression.shift()!, beat);
  } else auctionBar(nextBar, beat);
  nextBar += beat * 4;
  barTimer = window.setTimeout(scheduleBar, Math.max(50, (nextBar - now() - 0.25) * 1000));
}

export function musicMode(m: Mode) {
  if (m === mode) return;
  mode = m;
  if (barTimer !== null) clearTimeout(barTimer);
  barTimer = null;
  progression = [];
  intensity = 0.3;
  if (ctx && m !== 'off') {
    nextBar = now() + 0.1;
    scheduleBar();
  }
}

export function musicIntensity(x: number) {
  intensity = Math.max(0, Math.min(1, x));
}

export function startMusic() {
  if (mode === 'off') musicMode('lounge');
}
export function stopMusic() {
  musicMode('off');
}

export function buzz(ms: number | number[]) {
  if (!vol.haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
