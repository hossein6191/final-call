import { live } from '../net.ts';
import { state, $, fmt, short, esc, toast, go, baseOf, txLink } from '../state.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { makeRng, type ManifestSlot } from '../../../shared/rules.ts';
import { drawIcon, XRAY } from '../icons.ts';
import { AVATARS } from '../avatars.ts';
import { sound, scanHum, buzz, crowdBed, crowdSwell, tension, musicMode } from '../audio.ts';
import { showSold } from './unzip.ts';
import { coach, coachOff, coachActive } from '../ui/coach.ts';
import { track, seen } from '../ui/progress.ts';
import { nextTip, hourglassSvg } from '../ui/bits.ts';
import { briefing } from '../ui/briefing.ts';

interface Slot {
  m: ManifestSlot;
  x: number;
  y: number;
  size: number;
  rot: number;
  revealed: boolean;
  tagged: boolean;
}

const SOLD_MS = 5000;
// Animated bot (from the Lucide Animated bot icon): its eyes blink while the AI talks.
const BOT = `<svg class="bot" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2"/><line class="eye" x1="15" x2="15" y1="13" y2="15"/><line class="eye" x1="9" x2="9" y1="13" y2="15"/></svg>`;
const GAVEL = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="14" width="30" height="16" rx="4" transform="rotate(-30 23 22)" fill="#8b5a2b" stroke="#3b2410" stroke-width="2"/><rect x="26" y="26" width="6" height="34" rx="3" transform="rotate(-30 29 43)" fill="#a0522d" stroke="#3b2410" stroke-width="2"/><rect x="34" y="52" width="24" height="6" rx="2" fill="#5c3a1e"/></svg>`;
const easeOutBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
function paddleNo(acc: string) {
  let h = 7;
  for (const ch of acc) h = (h * 31 + ch.charCodeAt(0)) % 97;
  return String(h + 2).padStart(2, '0');
}

export function auction(root: HTMLElement, lotId: number) {
  root.innerHTML = `
  <div class="auction" id="auctionRoot">
    <div class="vignette" id="vignette"></div>
    <div class="lot-head"><b id="flight">Boarding…</b><span id="origin"></span><span class="grow"></span><span id="aichip"></span></div>
    <div class="belt" id="belt">
      <canvas id="xray"></canvas>
      <div class="scanbar"><i id="scanfill" style="width:0%"></i></div>
      <div class="hint" id="hint">WAITING FOR THE BELT…</div>
      <div class="boarding" id="boarding">${hourglassSvg(30)}<b>NEXT BAG ON BELT</b><span>${esc(nextTip())}</span></div>
      <div class="chip tagchip" id="tagchip" hidden></div>
    </div>
    <div class="appraise" id="appraise"></div>
    <div class="rivals" id="rivals"></div>
    <div class="price">
      <div class="callout" id="callout"></div>
      <div class="gavel" id="gavel">${GAVEL}</div>
      <div class="paddle mine" id="mypaddle"><b>YOU</b><span></span></div>
      <div class="amt" id="amt">—</div>
      <div class="who" id="who">Opening bid</div>
      <div class="banner" id="banner"></div>
    </div>
    <div class="controls">
      <button class="btn side" id="jump" disabled>JUMP<small id="jumpv">+3 steps</small></button>
      <div class="bidwrap">
        <svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" stroke="rgba(255,255,255,.08)"/><circle id="ring" cx="50" cy="50" r="46" stroke="#ffd23f" stroke-dasharray="289" stroke-dashoffset="0"/></svg>
        <button class="bidbtn" id="bid" disabled><span class="lbl">BID</span><span class="val" id="bidv">—</span></button>
      </div>
      <button class="btn side" id="fold" disabled>FOLD<small>walk away</small></button>
    </div>
  </div>`;

  const canvas = $('#xray', root) as HTMLCanvasElement;
  const g = canvas.getContext('2d')!;
  const me = state.id!.account;
  let manifest: ManifestSlot[] = [];
  let slots: Slot[] = [];
  let phase: 'wait' | 'arrive' | 'scan' | 'live' | 'sold' = 'wait';
  let scanStart = 0;
  let scanMs = 6000;
  let arriveStart = 0;
  let arriveMs = 1200;
  let lastTick = 0;
  let lastBeat = 0;
  let flash = 0;
  let freezeUntil = 0;
  let lastGeiger = 0;
  let lastFrame = 0;
  let lockSlot: Slot | null = null;
  let lockSince = 0;
  const active = new Set<string>(); // bidders still in
  let beamX = 0;
  let beamDir = 1;
  let dragging = false;
  const covered: boolean[] = [];
  let W = 0;
  let H = 0;
  let caseBox = { x: 0, y: 0, w: 0, h: 0 };
  let lastBid = 0;
  let leader: string | null = null;
  let next = 0;
  let price = 0;
  let raf = 0;
  let label: HTMLElement | null = null;
  let tier = 0;
  let startMsg: any = null;
  const rivalCards = new Map<string, HTMLElement>();
  // tutorial + mission bookkeeping
  let closeScanCoach: (() => void) | null = null;
  let tappedOnce = false;
  let myLastSnipe = false;
  let myLastWar = 0;
  let duel = false;
  const coverage = () => covered.filter(Boolean).length / Math.max(1, covered.length);
  const off = document.createElement('canvas');

  // ---------- drawing ----------
  function layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth * dpr;
    H = canvas.clientHeight * dpr;
    canvas.width = W;
    canvas.height = H;
    off.width = W;
    off.height = H;
    caseBox = { x: W * 0.07, y: H * 0.16, w: W * 0.86, h: H * 0.74 };
    // Coverage is stored as fractions of the width, so it survives a resize.
    if (!covered.length) for (let i = 0; i < 160; i++) covered.push(false);
    const prevSlots = slots;
    const n = manifest.length;
    const cols = n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const rng = makeRng(lotId);
    const cw = caseBox.w / cols;
    const ch = caseBox.h / rows;
    slots = manifest.map((m, i) => {
      const cx = caseBox.x + cw * (i % cols) + cw / 2 + (rng() - 0.5) * cw * 0.25;
      const cy = caseBox.y + ch * Math.floor(i / cols) + ch / 2 + (rng() - 0.5) * ch * 0.2;
      return { m, x: cx, y: cy, size: Math.min(cw, ch) * (0.78 + rng() * 0.12), rot: (rng() - 0.5) * 0.7, revealed: prevSlots[i]?.revealed ?? false, tagged: prevSlots[i]?.tagged ?? false };
    });
    renderXray();
  }

  function renderXray() {
    const o = off.getContext('2d')!;
    o.clearRect(0, 0, W, H);
    // Case frame and hardware show as metal (blue).
    o.strokeStyle = XRAY.metal;
    o.globalAlpha = 0.8;
    o.lineWidth = W * 0.008;
    o.beginPath();
    o.roundRect(caseBox.x, caseBox.y, caseBox.w, caseBox.h, W * 0.03);
    o.stroke();
    o.globalAlpha = 0.5;
    o.lineWidth = W * 0.004;
    o.setLineDash([W * 0.01, W * 0.008]);
    o.beginPath();
    o.moveTo(caseBox.x + W * 0.02, caseBox.y + caseBox.h / 2);
    o.lineTo(caseBox.x + caseBox.w - W * 0.02, caseBox.y + caseBox.h / 2);
    o.stroke();
    o.setLineDash([]);
    o.globalAlpha = 0.9;
    o.lineWidth = W * 0.012;
    o.beginPath();
    o.roundRect(caseBox.x + caseBox.w * 0.38, caseBox.y - H * 0.09, caseBox.w * 0.24, H * 0.1, W * 0.02);
    o.stroke();
    o.globalAlpha = 1;
    for (const s of slots) {
      if (!s.m.pouch) {
        drawIcon(o, s.m.id!, s.x, s.y, s.size, s.rot, XRAY[s.m.material!]);
      } else {
        const dense = s.m.weight === 'heavy' ? 0.95 : s.m.weight === 'medium' ? 0.75 : 0.5;
        const grad = o.createRadialGradient(s.x, s.y, s.size * 0.05, s.x, s.y, s.size * 0.5);
        grad.addColorStop(0, `rgba(10,12,30,${dense})`);
        grad.addColorStop(0.75, `rgba(28,36,80,${dense * 0.9})`);
        grad.addColorStop(1, 'rgba(60,80,160,0)');
        o.fillStyle = grad;
        o.beginPath();
        o.ellipse(s.x, s.y, s.size * 0.48, s.size * 0.38, s.rot, 0, Math.PI * 2);
        o.fill();
        o.strokeStyle = 'rgba(120,150,230,.5)';
        o.setLineDash([3, 4]);
        o.lineWidth = 1.5;
        o.beginPath();
        o.ellipse(s.x, s.y, s.size * 0.42, s.size * 0.32, s.rot, 0, Math.PI * 2);
        o.stroke();
        o.setLineDash([]);
      }
    }
  }

  function draw(t: number) {
    raf = requestAnimationFrame(draw);
    const dt = lastFrame ? Math.min(64, t - lastFrame) : 16;
    lastFrame = t;
    if (!W || t < freezeUntil) return;
    g.clearRect(0, 0, W, H);
    // belt
    g.fillStyle = '#04060b';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80,110,170,.12)';
    g.lineWidth = 2;
    const shift = phase === 'scan' ? (t / 20) % 40 : 0;
    for (let x = -40; x < W + 40; x += 40) {
      g.beginPath();
      g.moveTo(x + shift, H * 0.94);
      g.lineTo(x + shift + 20, H);
      g.stroke();
    }
    // lead curtains at the tunnel mouth
    for (const edge of [0, W - W * 0.045]) {
      for (let k = 0; k < 4; k++) {
        const sway = Math.sin(t / 300 + k + edge) * (phase === 'arrive' ? 3 : 0.6);
        g.fillStyle = `rgba(40,60,90,${0.55 - k * 0.08})`;
        g.fillRect(edge + k * (W * 0.011) + sway, 0, W * 0.009, H * 0.92);
      }
    }
    if (phase === 'arrive') {
      const k = Math.min(1, (t - arriveStart) / (arriveMs * 0.85));
      const dx = (1 - easeOutBack(k)) * -W;
      drawSuitcase(dx);
      return void updateRing(t);
    }
    if (flash > 0) {
      g.fillStyle = `rgba(200,235,255,${flash})`;
      g.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - 0.06);
    }
    // faint outline so you know where the bag is
    g.strokeStyle = 'rgba(74,168,255,.14)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(caseBox.x, caseBox.y, caseBox.w, caseBox.h, W * 0.03);
    g.stroke();

    if (phase === 'scan') {
      const elapsed = t - scanStart;
      ($('#scanfill', root) as HTMLElement).style.width = `${Math.min(100, (elapsed / scanMs) * 100)}%`;
      if (!dragging) {
        // time-based so the sweep speed is the same at 30, 60 or 120 frames per second
        beamX += beamDir * W * (dt / 1500);
        if (beamX > W * 0.95) beamDir = -1;
        if (beamX < W * 0.05) beamDir = 1;
      }
      const bw = W * 0.12;
      const a = Math.floor(((beamX - bw / 2) / W) * covered.length);
      const b = Math.ceil(((beamX + bw / 2) / W) * covered.length);
      for (let i = Math.max(0, a); i < Math.min(covered.length, b); i++) covered[i] = true;
      for (const s of slots) if (Math.abs(s.x - beamX) < bw / 2) s.revealed = true;
      if (closeScanCoach && (coverage() > 0.75 || (dragging && t - scanStart > 900))) {
        closeScanCoach();
        closeScanCoach = null;
        if (!tappedOnce && !seen('a-tap')) {
          coach({ step: 'a-tap', target: belt, hand: 'tap', title: 'Appraise it', text: 'Tap an item, or hold the beam on it, to see what it is worth. Everything you tag adds up in the chip below.' });
        }
      }
      // Geiger clicks: faster over valuable visible items (their value is public), weight for pouches.
      const under = slots.find((s) => Math.abs(s.x - beamX) < s.size * 0.35);
      if (under) {
        const worth = under.m.pouch ? (under.m.weight === 'heavy' ? 0.55 : under.m.weight === 'medium' ? 0.35 : 0.2) : Math.min(1, Math.log10(baseOf(under.m.id!)) / 4);
        const rate = 4 + 16 * worth;
        if (t - lastGeiger > 1000 / rate) {
          lastGeiger = t;
          tension.geiger(rate);
        }
        // hold the beam on an item for 400 ms to lock on and appraise it
        if (dragging && under === lockSlot) {
          if (!under.tagged && t - lockSince > 400) tagSlot(under, true);
        } else {
          lockSlot = under;
          lockSince = t;
        }
      }
      // last two seconds: the scan clock ticks faster
      const left = scanMs - elapsed;
      if (left < 2000 && t - lastTick > (left < 1000 ? 250 : 500)) {
        lastTick = t;
        tension.tick(left < 1000);
      }
    }

    // revealed parts of the X-ray
    g.save();
    g.beginPath();
    let runStart = -1;
    for (let i = 0; i <= covered.length; i++) {
      if (covered[i] && runStart < 0) runStart = i;
      if ((!covered[i] || i === covered.length) && runStart >= 0) {
        g.rect((runStart / covered.length) * W, 0, ((i - runStart) / covered.length) * W, H);
        runStart = -1;
      }
    }
    g.clip();
    g.drawImage(off, 0, 0);
    g.restore();

    // glints on pouches that have been scanned
    for (const s of slots) {
      if (s.m.pouch && s.m.glint && s.revealed) {
        const k = (Math.sin(t / 180 + s.x) + 1) / 2;
        g.fillStyle = `rgba(255,220,120,${0.35 + k * 0.65})`;
        const r = s.size * (0.06 + k * 0.05);
        g.beginPath();
        g.moveTo(s.x + s.size * 0.2, s.y - s.size * 0.15 - r * 2);
        g.lineTo(s.x + s.size * 0.2 + r * 0.5, s.y - s.size * 0.15 - r * 0.5);
        g.lineTo(s.x + s.size * 0.2 + r * 2, s.y - s.size * 0.15);
        g.lineTo(s.x + s.size * 0.2 + r * 0.5, s.y - s.size * 0.15 + r * 0.5);
        g.lineTo(s.x + s.size * 0.2, s.y - s.size * 0.15 + r * 2);
        g.lineTo(s.x + s.size * 0.2 - r * 0.5, s.y - s.size * 0.15 + r * 0.5);
        g.lineTo(s.x + s.size * 0.2 - r * 2, s.y - s.size * 0.15);
        g.lineTo(s.x + s.size * 0.2 - r * 0.5, s.y - s.size * 0.15 - r * 0.5);
        g.fill();
      }
      if (s.tagged) {
        g.strokeStyle = 'rgba(255,210,63,.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(s.x, s.y, s.size * 0.55, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // beam
    if (phase === 'scan') {
      const grad = g.createLinearGradient(beamX - W * 0.08, 0, beamX + W * 0.08, 0);
      grad.addColorStop(0, 'rgba(74,168,255,0)');
      grad.addColorStop(0.5, 'rgba(120,200,255,.35)');
      grad.addColorStop(1, 'rgba(74,168,255,0)');
      g.fillStyle = grad;
      g.fillRect(beamX - W * 0.08, 0, W * 0.16, H);
      g.fillStyle = '#bfe6ff';
      g.fillRect(beamX - 1.5, 0, 3, H);
    }
    // scanlines
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);

    updateRing(t);
  }

  function drawSuitcase(dx: number) {
    const colors = ['#2f8f83', '#2b4c7e', '#7a1f3d'];
    const c = colors[tier] ?? colors[0];
    const { x, y, w, h } = caseBox;
    g.save();
    g.translate(dx, 0);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath();
    g.ellipse(x + w / 2, y + h + H * 0.03, w * 0.48, H * 0.025, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c;
    g.beginPath();
    g.roundRect(x, y, w, h, W * 0.03);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 1; i < 5; i++) g.fillRect(x + (w / 5) * i - 2, y + 6, 4, h - 12);
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = W * 0.012;
    g.beginPath();
    g.roundRect(x + w * 0.38, y - H * 0.09, w * 0.24, H * 0.1, W * 0.02);
    g.stroke();
    // the paper luggage tag
    g.fillStyle = '#f4e9c8';
    g.beginPath();
    g.roundRect(x + w * 0.66, y - H * 0.02, w * 0.22, H * 0.11, 4);
    g.fill();
    g.fillStyle = '#1a1400';
    g.font = `700 ${Math.round(H * 0.045)}px "Barlow Condensed", sans-serif`;
    g.fillText(startMsg?.flight?.code ?? '', x + w * 0.68, y + H * 0.06);
    const st = startMsg?.flight?.sticker;
    if (st) {
      g.save();
      g.translate(x + w * 0.2, y + h * 0.45);
      g.rotate(-0.12);
      g.fillStyle = st === 'FRAGILE' ? '#d62828' : st === 'HEAVY' ? '#f77f00' : '#ffd23f';
      g.fillRect(-w * 0.14, -H * 0.04, w * 0.28, H * 0.08);
      g.fillStyle = '#fff';
      g.font = `800 ${Math.round(H * 0.04)}px "Barlow Condensed", sans-serif`;
      g.textAlign = 'center';
      g.fillText(st, 0, H * 0.014);
      g.restore();
    }
    g.restore();
  }

  function tensionTick(t: number) {
    if (phase !== 'live' || !leader) {
      ($('#vignette', root) as HTMLElement).style.opacity = '0';
      return;
    }
    const idle = t - lastBid;
    const gap = idle > 3500 ? 220 : idle > 2000 ? 420 : 0;
    if (gap && t - lastTick > gap) {
      lastTick = t;
      tension.tick(idle > 3500);
    }
    // heartbeat from "going once": 90 BPM rising to 140 BPM by "going twice"
    if (idle > 2000) {
      const bpm = 90 + 50 * Math.min(1, (idle - 2000) / 1500);
      if (t - lastBeat > 60000 / bpm) {
        lastBeat = t;
        tension.heartbeat();
        buzz(12);
        const ring = document.querySelector('.bidwrap');
        ring?.classList.remove('beat');
        void (ring as HTMLElement | null)?.offsetWidth;
        ring?.classList.add('beat');
      }
    }
    ($('#vignette', root) as HTMLElement).style.opacity = String(Math.max(0, Math.min(0.75, (idle - 1800) / 3000)));
  }

  function updateRing(t: number) {
    tensionTick(t);
    const ring = $('#ring', root) as unknown as SVGCircleElement | null;
    if (!ring) return;
    if (phase !== 'live') {
      ring.style.strokeDashoffset = phase === 'sold' ? '289' : '0';
      return;
    }
    const idle = t - lastBid;
    const left = Math.max(0, 1 - idle / SOLD_MS);
    ring.style.strokeDashoffset = String(289 * (1 - left));
    ring.style.stroke = idle > 3500 ? '#ff5d5d' : idle > 2000 ? '#ff9a3c' : '#ffd23f';
  }

  // ---------- appraisal ----------
  function appraise() {
    const tagged = slots.filter((s) => s.tagged && !s.m.pouch);
    const sum = tagged.reduce((a, s) => a + baseOf(s.m.id!), 0);
    const pouches = manifest.filter((m) => m.pouch);
    const heavy = pouches.filter((p) => p.weight === 'heavy').length;
    const glints = slots.filter((s) => s.m.pouch && s.m.glint && s.revealed).length;
    const visible = manifest.length - pouches.length;
    $('#appraise', root).innerHTML = `
      <span class="chip ${tagged.length ? 'warn' : ''}">Appraised ${tagged.length}/${visible} · ${fmt(sum)} MI</span>
      <span class="chip">${pouches.length} sealed pouches${heavy ? ` · ${heavy} heavy` : ''}</span>
      ${glints ? `<span class="chip warn">✦ ${glints} glinting</span>` : ''}`;
  }

  function hitTest(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    let best: Slot | null = null;
    let bd = Infinity;
    for (const s of slots) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < s.size * 0.6 && d < bd) {
        best = s;
        bd = d;
      }
    }
    if (!best || !best.revealed) return;
    tagSlot(best, false);
  }

  function tagSlot(best: Slot, locked: boolean) {
    if (!best.tagged) track('appraise');
    if (!tappedOnce) {
      tappedOnce = true;
      if (coachActive('a-tap') || coachActive('a-scan')) coachOff();
      if (manifest.some((x) => x.pouch))
        setTimeout(() => coach({ step: 'a-pouch', target: $('#appraise', root), title: 'Sealed pouches', text: 'Dark blobs are sealed pouches: nobody sees inside until the bag is won. <b>Heavy</b> or <b>✦ glinting</b> pouches can hide something big.', ms: 4200 }), 500);
    }
    locked ? tension.lock() : sound.tap();
    if (locked) buzz(8);
    best.tagged = true;
    label?.remove();
    label = document.createElement('div');
    label.className = 'label';
    label.style.left = `${(best.x / W) * 100}%`;
    label.style.top = `${((best.y - best.size * 0.45) / H) * 100}%`;
    label.innerHTML = best.m.pouch
      ? `Sealed pouch · ${best.m.weight}${best.m.glint ? ' · <b>something glints</b>' : ''}`
      : `${esc(ITEM_BY_ID[best.m.id!].name)} · <b>~${fmt(baseOf(best.m.id!))}</b>`;
    $('#belt', root).appendChild(label);
    const mine = label;
    setTimeout(() => mine.remove(), 1800);
    appraise();
  }

  const belt = $('#belt', root);
  let downAt = { x: 0, y: 0, t: 0 };
  belt.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (phase === 'scan') {
      dragging = true;
      const rect = canvas.getBoundingClientRect();
      beamX = ((e.clientX - rect.left) / rect.width) * W;
    }
  });
  belt.addEventListener('pointermove', (e) => {
    if (!dragging || phase !== 'scan') return;
    const rect = canvas.getBoundingClientRect();
    beamX = Math.max(0, Math.min(W, ((e.clientX - rect.left) / rect.width) * W));
  });
  const up = (e: PointerEvent) => {
    dragging = false;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 10) hitTest(e.clientX, e.clientY);
  };
  belt.addEventListener('pointerup', up);
  belt.addEventListener('pointercancel', () => (dragging = false));

  // ---------- rivals ----------
  function drawRivals(list: any[]) {
    const box = $('#rivals', root);
    box.innerHTML = list
      .map(
        (r) => `<div class="rival" data-acc="${r.account}">
          <div class="bubble"></div>
          <div class="paddle"><b>${paddleNo(r.account)}</b><span></span></div>
          <div class="think"><i></i><i></i><i></i></div>
          ${AVATARS[r.sub] ?? ''}
          <div class="nm" style="color:${r.color}">${esc(r.name)}</div>
          <div class="wl">${fmt(r.miles)} MI${r.grudge ? ' · <span class="grudge">GRUDGE</span>' : ''}</div>
        </div>`,
      )
      .join('');
    box.querySelectorAll<HTMLElement>('.rival').forEach((el) => rivalCards.set(el.dataset.acc!, el));
  }

  /** Shows an expression on a rival's face for a moment (or until changed, if ms is 0). */
  function mood(account: string, expr: 'happy' | 'angry' | 'think' | 'shock' | 'sad', ms = 1400) {
    const card = rivalCards.get(account);
    if (!card) return;
    card.classList.remove('expr-happy', 'expr-angry', 'expr-think', 'expr-shock', 'expr-sad');
    card.classList.add(`expr-${expr}`);
    clearTimeout((card as any)._mood);
    if (ms) (card as any)._mood = setTimeout(() => card.classList.remove(`expr-${expr}`), ms);
  }

  function say(account: string, line?: string) {
    const card = rivalCards.get(account);
    if (!card || !line) return;
    const b = card.querySelector('.bubble') as HTMLElement;
    b.textContent = line;
    b.classList.add('show');
    clearTimeout((b as any)._t);
    (b as any)._t = setTimeout(() => b.classList.remove('show'), 2200);
  }

  function setLeader(acc: string | null) {
    leader = acc;
    for (const [a, el] of rivalCards) el.classList.toggle('leading', a === acc);
    const bid = $('#bid', root) as HTMLButtonElement;
    bid.classList.toggle('leading', acc === me);
    $('.lbl', bid).textContent = acc === me ? 'LEADING' : 'BID';
  }

  function controls(on: boolean) {
    for (const id of ['#bid', '#jump', '#fold']) ($(id, root) as HTMLButtonElement).disabled = !on;
  }

  function showCallout(stage: 'once' | 'twice') {
    const c = $('#callout', root);
    c.textContent = stage === 'once' ? 'GOING ONCE' : 'GOING TWICE';
    c.className = `callout ${stage === 'twice' ? 'twice' : ''}`;
    void c.offsetWidth;
    c.classList.add('show');
  }

  function raisePaddle(acc: string, amount: number) {
    const card = rivalCards.get(acc);
    const pad = acc === me ? $('#mypaddle', root) : (card?.querySelector('.paddle') as HTMLElement | null);
    if (!pad) return;
    (pad.querySelector('span') as HTMLElement).textContent = fmt(amount);
    pad.classList.remove('up');
    void pad.offsetWidth;
    pad.classList.add('up');
  }

  function shakeCard(acc: string) {
    const card = rivalCards.get(acc);
    if (!card) return;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }

  function banner(text: string, kind: string) {
    const b = $('#banner', root);
    b.textContent = text;
    b.className = `banner ${kind}`;
    void b.offsetWidth;
    b.classList.add('show');
  }

  function slam() {
    const gv = $('#gavel', root);
    gv.classList.remove('slam');
    void gv.offsetWidth;
    gv.classList.add('slam');
    const a = $('#auctionRoot', root);
    a.classList.remove('shake');
    void a.offsetWidth;
    a.classList.add('shake');
  }

  // ---------- messages ----------
  const offMsg = live.on((m) => {
    if (m.lotId !== undefined && m.lotId !== lotId && m.type.startsWith('auction')) return;
    switch (m.type) {
      case 'auction:start': {
        startMsg = m;
        tier = m.tier;
        manifest = m.manifest;
        scanMs = m.scanMs;
        $('#flight', root).textContent = `${m.flight.code}`;
        $('#origin', root).innerHTML = `${esc(m.flight.origin)} · ${m.flight.kg ?? '?'} kg · ${m.flight.days} days${m.flight.sticker ? ` · <span class="sticker">${esc(m.flight.sticker)}</span>` : ''}`;
        active.clear();
        active.add(me);
        for (const r of m.rivals) active.add(r.account);
        const chip = $('#tagchip', root);
        chip.hidden = false;
        chip.innerHTML = `🔒 tag ${short(m.commitment, 6)}`;
        chip.onclick = () => window.open(`#lot/${lotId}`, '_blank');
        drawRivals(m.rivals);
        $('#boarding', root)?.remove();
        layout();
        appraise();
        arriveMs = m.arriveMs ?? 1200;
        phase = 'arrive';
        arriveStart = performance.now();
        tension.whoosh();
        sound.chime();
        $('#hint', root).textContent = `NOW ARRIVING · BELT ${m.flight.carousel}`;
        if (m.tutorial) coach({ step: 'a-arrive', target: belt, title: 'A lost bag rolls in', text: `Nobody came back for it. When the X-ray switches on you get a few seconds to look inside before bidding opens against ${m.rivals.length} AI rivals.`, ms: arriveMs + 400 });
        setTimeout(() => {
          if (phase !== 'arrive') return;
          tension.clunk();
          tension.xrayOn();
          flash = 0.9;
          phase = 'scan';
          scanStart = performance.now();
          scanMs = m.scanMs - arriveMs;
          beamX = W * 0.05;
          $('#hint', root).textContent = 'DRAG TO SCAN · TAP ITEMS TO APPRAISE';
          scanHum(true);
          closeScanCoach = coach({ step: 'a-scan', target: belt, hand: 'drag', title: 'X-ray it', text: 'Drag your finger left and right across the bag. Shapes are items: <span style="color:#4aa8ff">blue</span> metal, <span style="color:#ff9a3c">orange</span> organic, <span style="color:#5bd67a">green</span> plastic, <span style="color:#8f7bff">purple</span> dense.' });
        }, arriveMs);
        crowdBed(true);
        $('#amt', root).textContent = fmt(m.opening);
        $('#who', root).innerHTML = `Opening bid · you have <b>${fmt(m.you.miles)}</b> MI`;
        $('#bidv', root).textContent = fmt(m.opening);
        break;
      }
      case 'auction:live':
        phase = 'live';
        scanHum(false);
        sound.gavel();
        $('#hint', root).textContent = '';
        ($('#scanfill', root) as HTMLElement).style.width = '100%';
        price = m.price;
        next = m.next;
        lastBid = performance.now();
        $('#bidv', root).textContent = fmt(next);
        $('#jumpv', root).textContent = '+3 steps';
        controls(true);
        musicMode('auction');
        if (coverage() > 0.9) track('fullscan');
        coach({ step: 'a-bid', target: $('.bidwrap', root), hand: 'tap', title: 'Bidding is open', text: 'Tap <b>BID</b> to raise the price. Every bid restarts a 5-second clock: going once, going twice, <b>SOLD</b>. Whoever leads when it runs out wins the bag.' });
        break;
      case 'auction:bid': {
        price = m.price;
        next = m.next;
        lastBid = performance.now();
        setLeader(m.by);
        const amt = $('#amt', root);
        amt.textContent = fmt(price);
        amt.classList.remove('bump');
        void amt.offsetWidth;
        amt.classList.add('bump');
        $('#who', root).innerHTML = m.by === me ? '<b>You</b> lead' : `<b>${esc(m.name)}</b> leads${m.heat ? ' · <span class="heat">HEAT: DOUBLE STEPS</span>' : ''}`;
        $('#bidv', root).textContent = fmt(next);
        sound.bid(price, m.by === me);
        document.dispatchEvent(new CustomEvent('fc:bid', { detail: { name: m.by === me ? 'You' : m.name, price, jump: m.jump, snipe: m.snipe, mine: m.by === me, color: (rivalCards.get(m.by)?.querySelector('.nm') as HTMLElement | null)?.style.color } }));
        if (m.by !== me) mood(m.by, m.snipe || m.jump ? 'happy' : (m.war ?? 0) >= 3 ? 'angry' : 'happy', 1200);
        if (m.outbid && m.outbid !== me) mood(m.outbid, m.snipe ? 'shock' : 'angry', 1500);
        if (m.by === me && m.jump) for (const a of rivalCards.keys()) if (a !== m.outbid) mood(a, 'shock', 1100);
        if (m.by === me && m.outbid && m.outbid !== me) mood(m.outbid, m.snipe ? 'shock' : 'angry', 1600);
        if (m.by === me) {
          track('bid');
          if (m.jump) track('jump');
          if (m.outbid === `bigsal.${state.cfg!.contract}`) track('beatSal');
          myLastSnipe = Boolean(m.snipe);
          myLastWar = m.war ?? 0;
          if (coachActive('a-bid')) coachOff();
        } else if (m.outbid === me) {
          coach({ step: 'a-outbid', target: rivalCards.get(m.by) ?? null, title: `${m.name} outbid you`, text: 'Bid again to take the lead, or <b>FOLD</b> if the price is past what the bag looks worth.', ms: 3600 });
        }
        crowdSwell(Math.min(1, (m.war ?? 0) / 4));
        if (m.by !== me) buzz(15);
        say(m.by, m.line);
        raisePaddle(m.by, price);
        if (m.outbid && m.by === me) shakeCard(m.outbid);
        if (m.snipe) {
          banner(m.by === me ? 'LAST-SECOND BID!' : `${m.name.toUpperCase()} SNIPES IT!`, 'snipe');
          if (m.by !== me && m.outbid === me) tension.sniped();
        } else if ((m.war ?? 0) >= 4) {
          banner(`BIDDING WAR ×${m.war}`, 'war');
          tension.rumble(Math.min(3, m.war - 3));
        }
        if (m.jump) tension.ooh();
        break;
      }
      case 'auction:twitch': {
        const pad = rivalCards.get(m.by)?.querySelector('.paddle') as HTMLElement | null;
        pad?.classList.remove('twitch');
        void pad?.offsetWidth;
        pad?.classList.add('twitch');
        break;
      }
      case 'auction:think': {
        const card = rivalCards.get(m.by);
        card?.classList.add('thinking');
        mood(m.by, 'think', 1400);
        coach({ step: 'a-think', target: card ?? null, title: 'They are thinking', text: 'Those dots mean a rival hesitates. They are close to their limit, so one more bid may win it.', ms: 3200 });
        setTimeout(() => card?.classList.remove('thinking'), 1400);
        break;
      }
      case 'auction:call':
        showCallout(m.stage);
        if (m.stage === 'once')
          leader === me
            ? coach({ step: 'a-once-lead', target: $('.price', root), title: 'Going once…', text: 'You lead. If nobody bids before the clock runs out, the bag is yours. No need to tap.', ms: 3000 })
            : coach({ step: 'a-once', target: $('.bidwrap', root), title: 'Going once!', text: 'Bid now or the leader takes the bag.', ms: 2600 });
        m.stage === 'once' ? sound.once() : sound.twice();
        buzz(m.stage === 'once' ? 30 : [30, 60, 30]);
        break;
      case 'auction:fold': {
        const card = rivalCards.get(m.by);
        card?.classList.add('folded');
        card?.classList.remove('thinking');
        mood(m.by, 'sad', 0);
        say(m.by, m.line);
        active.delete(m.by);
        if (active.size === 2 && phase === 'live') {
          const [a, b] = [...active];
          const name = (acc: string) => (acc === me ? 'YOU' : (rivalCards.get(acc)?.querySelector('.nm')?.textContent ?? '').toUpperCase());
          $('#auctionRoot', root).classList.add('duel');
          duel = active.has(me);
          banner(`HEAD TO HEAD: ${name(a)} vs ${name(b)}`, 'war');
          crowdSwell(1);
        }
        if (m.by !== me) sound.fold();
        if (m.by === me) {
          controls(false);
          $('#who', root).innerHTML = 'You walked away. Watching…';
        }
        break;
      }
      case 'auction:say':
        say(m.by, m.line);
        break;
      case 'auction:refused':
        sound.error();
        toast(esc(m.reason));
        break;
      case 'auction:sold':
        phase = 'sold';
        coachOff();
        for (const a of rivalCards.keys()) mood(a, a === m.winner ? 'happy' : m.winner === me ? 'angry' : 'sad', 0);
        if (m.winner === me) {
          track('win');
          if (myLastSnipe) track('snipe');
          if (myLastWar >= 4) track('war');
          if (duel) track('duel');
        }
        controls(false);
        scanHum(false);
        crowdBed(false);
        $('#auctionRoot', root).classList.remove('duel');
        // hitstop, gavel slam, camera punch, shake: the hammer has to feel heavy
        freezeUntil = performance.now() + 150;
        belt.classList.remove('punch');
        void belt.offsetWidth;
        belt.classList.add('punch');
        slam();
        sound.sold(m.winner === me);
        musicMode('lounge');
        buzz([60, 40, 120]);
        // reveal the whole bag on the belt too
        for (let i = 0; i < covered.length; i++) covered[i] = true;
        for (const s of slots) s.revealed = true;
        showSold({ ...m, tier, flight: startMsg?.flight, sealedTx: startMsg?.sealedTx, me });
        break;
      case 'rival:offer':
        toast(`<b>${esc(m.name)}</b> wants your ${esc(m.itemName)}: <b>${fmt(m.price)} MI</b>. Sell it to them in My Bags.`);
        break;
      case 'ai:voices':
        $('#aichip', root).innerHTML = m.source === 'near-ai' ? `<span class="chip ai">${BOT}voices: NEAR AI</span>` : `<span class="chip ai">${BOT}voices: scripted</span>`;
        break;
      case 'ai:verified':
        $('#aichip', root).innerHTML = m.ok
          ? `<a class="chip ok ai" href="${esc(m.verifyUrl)}" target="_blank" rel="noopener">${BOT}✓ signed by NEAR AI TEE</a>`
          : `<span class="chip warn">voices unverified</span>`;
        break;
      case 'error':
        sound.error();
        toast(esc(m.message));
        if (phase === 'wait') setTimeout(() => go('#home'), 1200);
        break;
      case 'socket:closed':
        if (phase === 'live' || phase === 'scan') toast('Connection lost. The hammer still falls; check My Bags.');
        break;
    }
  });

  ($('#bid', root) as HTMLButtonElement).onclick = () => {
    if (leader === me) return;
    buzz(10);
    void live.send({ type: 'bid' });
  };
  ($('#jump', root) as HTMLButtonElement).onclick = () => {
    if (leader === me) return;
    buzz(10);
    void live.send({ type: 'jump' });
  };
  ($('#fold', root) as HTMLButtonElement).onclick = () => void live.send({ type: 'fold' });

  const onResize = () => manifest.length && layout();
  window.addEventListener('resize', onResize);
  // Keyboard on a computer: Space/Enter bid, J jump, F fold.
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') ($('#bid', root) as HTMLButtonElement).click();
    else if (k === 'j') ($('#jump', root) as HTMLButtonElement).click();
    else if (k === 'f') ($('#fold', root) as HTMLButtonElement).click();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(draw);
  // How the round works, then the bag rolls in.
  let left = false;
  void briefing($('#auctionRoot', root), lotId).then(() => {
    if (!left) void live.send({ type: 'enter', lotId });
  });

  return () => {
    left = true;
    offMsg();
    cancelAnimationFrame(raf);
    scanHum(false);
    crowdBed(false);
    musicMode('lounge');
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    document.querySelector('.overlay')?.remove();
  };
}

export { txLink };
