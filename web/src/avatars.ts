// Rival portraits, drawn as small SVGs so every rival reads at a glance.

const SKIN = ['#f2c7a5', '#c98e63', '#8d5a3b', '#f5d6c0', '#a8714f', '#e6b08a'];

// Every face carries hidden expression layers (brows, mouths, a sweat drop) that the
// auction switches on with a class: expr-happy, expr-angry, expr-think, expr-shock, expr-sad.
const FX = `<g class="fx" stroke="#5a2e1d" stroke-width="2" fill="none" stroke-linecap="round">
    <path class="b-angry" d="M22.5 25.5l7 2.6M41.5 25.5l-7 2.6" stroke="#2a1a10" stroke-width="2.2"/>
    <path class="b-up" d="M22.5 26q4-3.2 8 0M33.5 26q4-3.2 8 0" stroke="#2a1a10"/>
    <path class="b-sad" d="M23 27.5l7-2.2M41 27.5l-7-2.2" stroke="#2a1a10"/>
    <path class="m-smile" d="M25 42q7 7.5 14 0" fill="#7a2a1a" stroke-width="1.6"/>
    <path class="m-frown" d="M26.5 46.5q5.5-4.5 11 0"/>
    <path class="m-flat" d="M28 44.5h8"/>
    <ellipse class="m-o" cx="32" cy="44.5" rx="2.8" ry="3.6" fill="#3a1408" stroke-width="1.4"/>
    <path class="sweat" d="M44.5 22q2.6 4.2 0 6.2q-2.6-2 0-6.2z" fill="#8fd6ff" stroke="none"/>
    <path class="steam" d="M15 18q-2-3 1-5M49 18q2-3-1-5" stroke="#ff6b6b" stroke-width="1.8"/>
  </g>`;

function face(skin: string, extra: string, bg: string, mouth = 'M26 44q6 4 12 0'): string {
  return `<svg viewBox="0 0 64 64" class="face" aria-hidden="true">
    <circle cx="32" cy="32" r="31" fill="${bg}"/>
    <path d="M14 64c2-12 9-18 18-18s16 6 18 18z" fill="rgba(0,0,0,.25)"/>
    <ellipse cx="32" cy="32" rx="14" ry="16" fill="${skin}"/>
    <g class="eyes"><circle cx="26.5" cy="31" r="1.8" fill="#1b1b1b"/><circle cx="37.5" cy="31" r="1.8" fill="#1b1b1b"/></g>
    <path class="m-def" d="${mouth}" stroke="#5a2e1d" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${extra}
    ${FX}
  </svg>`;
}

export const AVATARS: Record<string, string> = {
  marguerite: face(SKIN[3],
    `<circle cx="32" cy="12" r="7" fill="#d9d9d9"/><path d="M18 30c0-12 6-17 14-17s14 5 14 17c-3-6-8-9-14-9s-11 3-14 9z" fill="#d9d9d9"/>
     <circle cx="26.5" cy="31" r="4.5" fill="none" stroke="#e8a33d" stroke-width="1.6"/><circle cx="37.5" cy="31" r="4.5" fill="none" stroke="#e8a33d" stroke-width="1.6"/><path d="M31 31h2" stroke="#e8a33d" stroke-width="1.6"/>`,
    '#3a2a14', 'M27 44h10'),
  bigsal: face(SKIN[1],
    `<path d="M17 28c0-10 7-15 15-15s15 5 15 15c-4-4-9-6-15-6s-11 2-15 6z" fill="#1c1c1c"/>
     <path d="M24 39q8 3 16 0" stroke="#1c1c1c" stroke-width="3" fill="none"/>
     <path d="M20 50q12 8 24 0" stroke="#ffd23f" stroke-width="2.4" fill="none"/>`,
    '#4a1616', 'M25 44q7 5 14 0'),
  dash: face(SKIN[0],
    `<path d="M16 26c0-9 7-14 16-14s16 5 16 14z" fill="#4fb3d9"/><path d="M32 22h20v4H32z" fill="#2c7fa3"/>
     <path d="M22 26h20" stroke="#2c7fa3" stroke-width="2"/>`,
    '#10303d', 'M26 44q6 2 12-2'),
  kip: face(SKIN[5],
    `<path d="M16 28c0-11 7-16 16-16s16 5 16 16z" fill="#7cc46b"/><circle cx="32" cy="11" r="4" fill="#bde6b0"/>
     <path d="M16 27h32" stroke="#4e8f40" stroke-width="3"/>`,
    '#173315', 'M26 43q6 6 12 0'),
  odo: face(SKIN[4],
    `<path d="M19 24c2-8 7-11 13-11s11 3 13 11c-4-3-8-4-13-4s-9 1-13 4z" fill="#5d4a7a"/>
     <path d="M20 38c2 10 7 14 12 14s10-4 12-14c-3 4-7 6-12 6s-9-2-12-6z" fill="#5d4a7a"/>
     <rect x="21.5" y="27.5" width="10" height="7" rx="2" fill="none" stroke="#a37de8" stroke-width="1.6"/><rect x="32.5" y="27.5" width="10" height="7" rx="2" fill="none" stroke="#a37de8" stroke-width="1.6"/>`,
    '#231a33', 'M28 45h8'),
  nell: face(SKIN[2],
    `<path d="M14 34c0-14 8-21 18-21s18 7 18 21c-2-8-6-12-9-12H23c-3 0-7 4-9 12z" fill="#e87db0"/>
     <path d="M44 22l8-2-4 7z" fill="#e87db0"/>`,
    '#3d1729', 'M27 45q5-2 10 0'),
};

export function playerAvatar(name: string): string {
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return face(SKIN[hue % SKIN.length],
    `<path d="M17 29c0-11 7-16 15-16s15 5 15 16c-3-5-8-8-15-8s-12 3-15 8z" fill="hsl(${hue} 35% 25%)"/>`,
    `hsl(${hue} 45% 22%)`);
}

export function avatarFor(account: string, name: string, contract: string): string {
  const sub = account.endsWith(`.${contract}`) ? account.slice(0, -contract.length - 1) : '';
  return AVATARS[sub] ?? playerAvatar(name);
}
