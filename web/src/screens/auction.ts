import { live } from '../net.ts';
import { state, $, fmt, short, esc, toast, go, baseOf, txLink } from '../state.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { makeRng, type ManifestSlot } from '../../../shared/rules.ts';
import { drawIcon, XRAY } from '../icons.ts';
import { AVATARS } from '../avatars.ts';
import { sound, scanHum, buzz } from '../audio.ts';
import { showSold } from './unzip.ts';

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

export function auction(root: HTMLElement, lotId: number) {
  root.innerHTML = `
  <div class="auction">
    <div class="lot-head"><b id="flight">Boarding…</b><span id="origin"></span><span class="grow"></span><span id="aichip"></span></div>
    <div class="belt" id="belt">
      <canvas id="xray"></canvas>
      <div class="scanbar"><i id="scanfill" style="width:0%"></i></div>
      <div class="hint" id="hint">WAITING FOR THE BELT…</div>
      <div class="chip tagchip" id="tagchip" hidden></div>
    </div>
    <div class="appraise" id="appraise"></div>
    <div class="price">
      <div class="callout" id="callout"></div>
      <div class="amt" id="amt">—</div>
      <div class="who" id="who">Opening bid</div>
    </div>
    <div class="rivals" id="rivals"></div>
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
  let phase: 'wait' | 'scan' | 'live' | 'sold' = 'wait';
  let scanStart = 0;
  let scanMs = 6000;
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
    covered.length = 0;
    for (let i = 0; i < 160; i++) covered.push(false);
    const n = manifest.length;
    const cols = n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const rng = makeRng(lotId);
    const cw = caseBox.w / cols;
    const ch = caseBox.h / rows;
    slots = manifest.map((m, i) => {
      const cx = caseBox.x + cw * (i % cols) + cw / 2 + (rng() - 0.5) * cw * 0.25;
      const cy = caseBox.y + ch * Math.floor(i / cols) + ch / 2 + (rng() - 0.5) * ch * 0.2;
      return { m, x: cx, y: cy, size: Math.min(cw, ch) * (0.78 + rng() * 0.12), rot: (rng() - 0.5) * 0.7, revealed: false, tagged: false };
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
    if (!W) return;
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
        beamX += beamDir * (W / 260);
        if (beamX > W * 0.95) beamDir = -1;
        if (beamX < W * 0.05) beamDir = 1;
      }
      const bw = W * 0.12;
      const a = Math.floor(((beamX - bw / 2) / W) * covered.length);
      const b = Math.ceil(((beamX + bw / 2) / W) * covered.length);
      for (let i = Math.max(0, a); i < Math.min(covered.length, b); i++) covered[i] = true;
      for (const s of slots) if (Math.abs(s.x - beamX) < bw / 2) s.revealed = true;
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

  function updateRing(t: number) {
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
    sound.tap();
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
          <div class="think"><i></i><i></i><i></i></div>
          ${AVATARS[r.sub] ?? ''}
          <div class="nm" style="color:${r.color}">${esc(r.name)}</div>
          <div class="wl">${fmt(r.miles)} MI</div>
        </div>`,
      )
      .join('');
    box.querySelectorAll<HTMLElement>('.rival').forEach((el) => rivalCards.set(el.dataset.acc!, el));
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
        $('#origin', root).textContent = `from ${m.flight.origin} · ${state.cfg!.terminals[m.tier].name}`;
        const chip = $('#tagchip', root);
        chip.hidden = false;
        chip.innerHTML = `🔒 tag ${short(m.commitment, 6)}`;
        chip.onclick = () => window.open(`#lot/${lotId}`, '_blank');
        drawRivals(m.rivals);
        layout();
        appraise();
        phase = 'scan';
        scanStart = performance.now();
        beamX = W * 0.05;
        $('#hint', root).textContent = 'DRAG TO SCAN · TAP ITEMS TO APPRAISE';
        $('#amt', root).textContent = fmt(m.opening);
        $('#who', root).innerHTML = `Opening bid · you have <b>${fmt(m.you.miles)}</b> MI`;
        $('#bidv', root).textContent = fmt(m.opening);
        scanHum(true);
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
        if (m.by !== me) buzz(15);
        say(m.by, m.line);
        break;
      }
      case 'auction:call':
        showCallout(m.stage);
        m.stage === 'once' ? sound.once() : sound.twice();
        buzz(m.stage === 'once' ? 30 : [30, 60, 30]);
        break;
      case 'auction:fold': {
        const card = rivalCards.get(m.by);
        card?.classList.add('folded');
        say(m.by, m.line);
        if (m.by !== me) sound.fold();
        if (m.by === me) {
          controls(false);
          $('#who', root).innerHTML = 'You walked away. Watching…';
        }
        break;
      }
      case 'auction:refused':
        sound.error();
        toast(esc(m.reason));
        break;
      case 'auction:sold':
        phase = 'sold';
        controls(false);
        scanHum(false);
        sound.sold(m.winner === me);
        buzz([60, 40, 120]);
        // reveal the whole bag on the belt too
        for (let i = 0; i < covered.length; i++) covered[i] = true;
        for (const s of slots) s.revealed = true;
        showSold({ ...m, tier, flight: startMsg?.flight, sealedTx: startMsg?.sealedTx, me });
        break;
      case 'ai:voices':
        $('#aichip', root).innerHTML = m.source === 'near-ai' ? '<span class="chip">voices: NEAR AI</span>' : '<span class="chip">voices: scripted</span>';
        break;
      case 'ai:verified':
        $('#aichip', root).innerHTML = m.ok
          ? `<a class="chip ok" href="${m.verifyUrl}" target="_blank" rel="noopener">✓ voices signed in TEE</a>`
          : `<span class="chip warn">voices unverified</span>`;
        break;
      case 'error':
        sound.error();
        toast(esc(m.message));
        if (phase === 'wait') setTimeout(() => go('#arrivals'), 1200);
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
  raf = requestAnimationFrame(draw);
  void live.send({ type: 'enter', lotId });

  return () => {
    offMsg();
    cancelAnimationFrame(raf);
    scanHum(false);
    window.removeEventListener('resize', onResize);
    document.querySelector('.overlay')?.remove();
  };
}

export { txLink };
