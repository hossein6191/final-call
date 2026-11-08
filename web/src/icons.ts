// Item art as layered vector paths in a 64x64 box.
// The same paths render as X-ray silhouettes on the scanner and as full-colour cards.

export type Role = 'body' | 'detail' | 'hole';
export interface Layer {
  d: string;
  role: Role;
  color: string; // full-colour fill
}

// ---- path helpers ----
const r = (x: number, y: number, w: number, h: number, rad = 0) =>
  rad
    ? `M${x + rad} ${y}h${w - 2 * rad}a${rad} ${rad} 0 0 1 ${rad} ${rad}v${h - 2 * rad}a${rad} ${rad} 0 0 1 -${rad} ${rad}h-${w - 2 * rad}a${rad} ${rad} 0 0 1 -${rad} -${rad}v-${h - 2 * rad}a${rad} ${rad} 0 0 1 ${rad} -${rad}z`
    : `M${x} ${y}h${w}v${h}h-${w}z`;
const c = (cx: number, cy: number, rad: number) => `M${cx - rad} ${cy}a${rad} ${rad} 0 1 0 ${2 * rad} 0a${rad} ${rad} 0 1 0 -${2 * rad} 0z`;
const e = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 -${2 * rx} 0z`;
const p = (...pts: number[]) => {
  let s = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) s += `L${pts[i]} ${pts[i + 1]}`;
  return `${s}z`;
};

const B = (d: string, color: string): Layer => ({ d, role: 'body', color });
const D = (d: string, color: string): Layer => ({ d, role: 'detail', color });
const H = (d: string): Layer => ({ d, role: 'hole', color: '#0d1320' });

export const ICONS: Record<string, Layer[]> = {
  // ---------- L0 ----------
  'rubber-duck': [
    B('M14 40c0-9 8-14 18-14 4 0 7 1 9 2 1-7 6-12 12-11 5 1 7 6 6 10l7 1-6 4c-1 2-3 4-6 5 3 3 4 6 3 10-1 7-11 10-22 10S14 50 14 40z', '#ffd23f'),
    D(p(52, 22, 61, 23, 55, 27), '#ff8a1f'),
    H(c(49, 20, 2)),
  ],
  paperback: [
    B(r(16, 10, 30, 44, 3), '#5b8def'),
    D(r(46, 12, 4, 40, 1), '#e8e1cf'),
    D(r(21, 18, 20, 3), '#ffffff'),
    D(r(21, 24, 14, 2), '#ffffff'),
    H(p(16, 50, 46, 50, 46, 54, 16, 54)),
  ],
  'flip-flops': [
    B(e(22, 34, 9, 20), '#ff6b8a'),
    B(e(43, 32, 9, 20), '#ff6b8a'),
    D('M22 22q-6 8-7 14M22 22q6 8 7 14', '#ffffff'),
    D('M43 20q-6 8-7 14M43 20q6 8 7 14', '#ffffff'),
  ],
  'neck-pillow': [
    B('M32 10c13 0 23 9 23 21 0 10-6 19-13 22l-3-10c4-2 6-7 6-12 0-7-6-12-13-12s-13 5-13 12c0 5 2 10 6 12l-3 10C15 50 9 41 9 31 9 19 19 10 32 10z', '#8fd3c7'),
    D('M20 22q12-8 24 0', '#ffffff'),
  ],
  'snow-globe': [
    B(c(32, 28, 17), '#a9e0ff'),
    B(r(18, 44, 28, 12, 3), '#7a4b2a'),
    D(p(26, 36, 32, 22, 38, 36), '#2f8f4e'),
    D(c(26, 20, 1.5), '#ffffff'),
    D(c(38, 24, 1.5), '#ffffff'),
  ],
  // ---------- L1 ----------
  headphones: [
    B('M12 40v-6c0-12 9-22 20-22s20 10 20 22v6h-5v-6c0-9-7-17-15-17s-15 8-15 17v6z', '#2d3142'),
    B(r(8, 36, 12, 18, 4), '#ef476f'),
    B(r(44, 36, 12, 18, 4), '#ef476f'),
    D(r(11, 40, 6, 10, 2), '#ffffff'),
  ],
  aviators: [
    B('M6 26h52v4H6z', '#c9a227'),
    B('M8 28c0 10 4 16 11 16s11-6 11-14z', '#3a5a40'),
    B('M34 30c0 8 4 14 11 14s11-6 11-16z', '#3a5a40'),
    D('M12 32l5-3', '#ffffff'),
    D('M38 32l5-3', '#ffffff'),
  ],
  harmonica: [
    B(r(8, 24, 48, 16, 2), '#b8c4d6'),
    D(r(8, 30, 48, 4), '#6c7a8f'),
    H(r(12, 31, 4, 2)),
    H(r(20, 31, 4, 2)),
    H(r(28, 31, 4, 2)),
    H(r(36, 31, 4, 2)),
    H(r(44, 31, 4, 2)),
  ],
  'teddy-bear': [
    B(c(32, 22, 11), '#b07a4a'),
    B(c(21, 13, 5), '#b07a4a'),
    B(c(43, 13, 5), '#b07a4a'),
    B(e(32, 45, 13, 13), '#b07a4a'),
    D(e(32, 26, 5, 4), '#e7c9a3'),
    H(c(28, 20, 1.5)),
    H(c(36, 20, 1.5)),
  ],
  'hot-sauce': [
    B('M27 8h10v8l4 6v32a4 4 0 0 1-4 4H27a4 4 0 0 1-4-4V22l4-6z', '#d62828'),
    D(r(26, 30, 12, 14, 2), '#fcbf49'),
    D(r(27, 6, 10, 4, 1), '#2b2d42'),
  ],
  // ---------- L2 ----------
  'film-camera': [
    B(r(8, 20, 48, 30, 4), '#2b2d42'),
    B(r(16, 14, 14, 8, 2), '#2b2d42'),
    D(c(34, 35, 11), '#8d99ae'),
    H(c(34, 35, 6)),
    D(r(46, 24, 6, 4, 1), '#edf2f4'),
  ],
  sneakers: [
    B('M6 44c0-6 2-12 6-16 3-3 9-4 13-2 5 3 10 6 18 8 8 2 15 4 15 10v4H6z', '#f8f9fa'),
    D(r(6, 48, 52, 4, 1), '#ef233c'),
    D('M18 30l6 4M23 28l6 4M28 30l6 4', '#ef233c'),
  ],
  vinyl: [
    B(r(8, 8, 48, 48, 2), '#3a86ff'),
    B(c(36, 32, 20), '#111111'),
    D(c(36, 32, 7), '#ffbe0b'),
    H(c(36, 32, 1.5)),
    D('M12 14h12', '#ffffff'),
  ],
  comic: [
    B(r(14, 8, 36, 48, 2), '#ff595e'),
    D(r(18, 12, 28, 10, 1), '#ffca3a'),
    D(p(20, 30, 44, 26, 40, 48, 22, 50), '#1982c4'),
    D('M24 16h16', '#111111'),
  ],
  'brass-compass': [
    B(c(32, 34, 20), '#c58b2b'),
    D(c(32, 34, 15), '#f4e3b2'),
    D(p(32, 22, 35, 34, 32, 46, 29, 34), '#d62828'),
    B(r(28, 10, 8, 6, 2), '#c58b2b'),
  ],
  // ---------- L3 ----------
  handheld: [
    B(r(8, 18, 48, 30, 10), '#6c63ff'),
    D(r(22, 23, 20, 18, 2), '#a8dadc'),
    D('M12 31h6M15 28v6', '#ffffff'),
    D(c(48, 29, 2.5), '#ff6b6b'),
    D(c(52, 35, 2.5), '#ffd23f'),
  ],
  'silk-scarf': [
    B('M10 12c8 4 14 2 22 0s14-4 22 0v26c-8-4-14-2-22 0s-14 4-22 0z', '#e63946'),
    B('M30 38l-6 18 6-4 4 6 2-20z', '#e63946'),
    D('M16 20c6 2 10 0 16-1s10-2 16 0M16 28c6 2 10 0 16-1s10-2 16 0', '#ffd6a5'),
  ],
  pearls: [
    B(c(22, 40, 8), '#f1f1f1'),
    B(c(42, 40, 8), '#f1f1f1'),
    D('M22 32V20M42 32V20', '#d4af37'),
    D(c(22, 18, 3), '#d4af37'),
    D(c(42, 18, 3), '#d4af37'),
  ],
  ukulele: [
    B(e(26, 44, 14, 13), '#c68642'),
    B(r(30, 8, 8, 30, 2), '#6f4518'),
    B(r(28, 4, 12, 8, 2), '#6f4518'),
    H(c(26, 44, 4)),
    D('M32 12v40M36 12v40', '#f4e3b2'),
  ],
  'pocket-watch': [
    B(c(32, 36, 19), '#d4af37'),
    D(c(32, 36, 15), '#fffaf0'),
    D('M32 36V25M32 36l7 4', '#2b2d42'),
    B(r(28, 10, 8, 8, 3), '#d4af37'),
    D(c(32, 8, 4), '#d4af37'),
  ],
  // ---------- L4 ----------
  laptop: [
    B(r(12, 12, 40, 28, 2), '#9aa5b1'),
    D(r(15, 15, 34, 22, 1), '#1d3557'),
    B(p(6, 44, 58, 44, 54, 50, 10, 50), '#9aa5b1'),
    D(r(27, 45, 10, 2, 1), '#5c677d'),
  ],
  'leather-bag': [
    B(r(8, 22, 48, 32, 6), '#8b4513'),
    B('M22 22v-6a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v6h-4v-6H26v6z', '#5c2e0e'),
    D(r(8, 30, 48, 4), '#5c2e0e'),
    D(r(28, 28, 8, 8, 1), '#d4af37'),
  ],
  'gold-chain': [
    B('M14 18c0 18 8 34 18 34s18-16 18-34', '#d4af37'),
    D(c(32, 52, 5), '#d4af37'),
    D('M16 24l4 2M18 32l4 1M22 40l4 0M28 47l3-1', '#fff3b0'),
  ],
  violin: [
    B('M32 20c6 0 10 4 10 9 0 3-2 5-2 7s3 4 3 8c0 7-5 12-11 12s-11-5-11-12c0-4 3-6 3-8s-2-4-2-7c0-5 4-9 10-9z', '#a0522d'),
    B(r(30, 4, 4, 18), '#3b1f0e'),
    D('M27 36q1 3 0 6M37 36q-1 3 0 6', '#1a0d05'),
    D('M31 22v30M33 22v30', '#f4e3b2'),
  ],
  meteorite: [
    B(p(14, 28, 24, 14, 42, 12, 54, 24, 52, 42, 38, 52, 20, 48, 10, 38), '#5a4e4d'),
    H(c(26, 28, 4)),
    H(c(40, 34, 5)),
    D(c(36, 22, 2), '#ff9f1c'),
  ],
  // ---------- L5 ----------
  'cinema-camera': [
    B(r(6, 24, 38, 24, 3), '#212529'),
    B(p(44, 28, 58, 22, 58, 50, 44, 44), '#343a40'),
    B(c(16, 16, 8), '#212529'),
    B(c(34, 16, 8), '#212529'),
    D(c(16, 16, 3), '#adb5bd'),
    D(c(34, 16, 3), '#adb5bd'),
    D(r(10, 30, 8, 4, 1), '#e63946'),
  ],
  'couture-jacket': [
    B('M20 10l12 6 12-6 12 10-6 8v28H14V28l-6-8z', '#14213d'),
    D(p(26, 14, 32, 30, 38, 14, 32, 18), '#fca311'),
    D('M32 30v26', '#fca311'),
    D(c(32, 38, 1.5), '#e5e5e5'),
    D(c(32, 46, 1.5), '#e5e5e5'),
  ],
  'diamond-ring': [
    B(c(32, 42, 14), '#d4af37'),
    H(c(32, 42, 10)),
    B(p(24, 22, 28, 16, 36, 16, 40, 22, 32, 32), '#bde0fe'),
    D('M28 16l4 16 4-16M24 22h16', '#ffffff'),
  ],
  'electric-guitar': [
    B('M18 38c-6 2-10 8-8 13 2 6 9 8 15 5 4-2 5-6 9-8 4-1 8 1 9-4 1-4-3-6-6-6-5 0-6-5-11-5-4 0-6 3-8 5z', '#e63946'),
    B(p(33, 33, 54, 8, 57, 11, 36, 36), '#6f4518'),
    D(r(19, 42, 10, 3), '#f8f9fa'),
    D(c(14, 48, 2), '#f8f9fa'),
  ],
  'stamp-album': [
    B(r(10, 8, 44, 48, 3), '#2a9d8f'),
    D(r(16, 16, 14, 14), '#e9c46a'),
    D(r(34, 16, 14, 14), '#f4a261'),
    D(r(16, 34, 14, 14), '#e76f51'),
    D(r(34, 34, 14, 14), '#e9c46a'),
  ],
  // ---------- L6 ----------
  'prototype-phone': [
    B(r(18, 6, 28, 52, 6), '#111827'),
    D(r(21, 10, 22, 40, 2), '#7c3aed'),
    D(c(32, 54, 2), '#9ca3af'),
    D('M24 18l16 12M24 30l16-12', '#f472b6'),
  ],
  chronograph: [
    B(r(26, 4, 12, 56, 4), '#3d405b'),
    B(c(32, 32, 16), '#c0c0c0'),
    D(c(32, 32, 12), '#14213d'),
    D(c(27, 32, 3), '#e5e5e5'),
    D(c(37, 32, 3), '#e5e5e5'),
    D('M32 32l5-6', '#fca311'),
  ],
  'gold-bar': [
    B(p(8, 44, 16, 24, 48, 24, 56, 44), '#e0a800'),
    D(p(16, 24, 48, 24, 44, 30, 20, 30), '#ffe066'),
    D('M24 38h16', '#a67c00'),
  ],
  'golden-mask': [
    B('M32 6c14 0 22 10 22 24 0 16-10 28-22 28S10 46 10 30C10 16 18 6 32 6z', '#e0a800'),
    H(e(23, 28, 6, 4)),
    H(e(41, 28, 6, 4)),
    D('M26 44q6 4 12 0', '#7a4f01'),
    D('M32 32v6', '#7a4f01'),
  ],
  'lost-reel': [
    B(c(32, 32, 24), '#495057'),
    H(c(32, 32, 4)),
    H(c(32, 18, 5)),
    H(c(32, 46, 5)),
    H(c(18, 32, 5)),
    H(c(46, 32, 5)),
    D('M56 32h6v20', '#adb5bd'),
  ],
};

// X-ray false colours used by airport scanners.
export const XRAY: Record<string, string> = {
  organic: '#ff9a3c',
  plastic: '#5bd67a',
  metal: '#4aa8ff',
  dense: '#6b5bff',
};

export function iconSvg(id: string, opts: { xray?: string; size?: number } = {}): string {
  const layers = ICONS[id] ?? [];
  const size = opts.size ?? 64;
  const parts = layers.map((l) => {
    if (opts.xray) {
      if (l.role === 'hole') return `<path d="${l.d}" fill="#05070c" opacity=".85"/>`;
      if (l.role === 'detail') return `<path d="${l.d}" fill="none" stroke="#e8f6ff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>`;
      return `<path d="${l.d}" fill="${opts.xray}" fill-opacity=".62" stroke="${opts.xray}" stroke-width="1.2"/>`;
    }
    const strokeOnly = l.role === 'detail' && /^M[\d. ]+[lLhHvVqQ]/.test(l.d) && !/z$/i.test(l.d);
    if (strokeOnly) return `<path d="${l.d}" fill="none" stroke="${l.color}" stroke-width="2.4" stroke-linecap="round"/>`;
    return `<path d="${l.d}" fill="${l.color}"${l.role === 'body' ? ' stroke="rgba(0,0,0,.35)" stroke-width="1.2"' : ''}/>`;
  });
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${parts.join('')}</svg>`;
}

/** Draws an icon on a canvas (used by the X-ray scanner). */
export function drawIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, rot: number, xray: string) {
  const layers = ICONS[id] ?? [];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size / 64, size / 64);
  ctx.translate(-32, -32);
  for (const l of layers) {
    const path = new Path2D(l.d);
    if (l.role === 'hole') {
      ctx.fillStyle = 'rgba(5,7,12,.85)';
      ctx.fill(path);
    } else if (l.role === 'detail') {
      ctx.strokeStyle = 'rgba(232,246,255,.55)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.stroke(path);
    } else {
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = xray;
      ctx.fill(path);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = xray;
      ctx.lineWidth = 1.2;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}
