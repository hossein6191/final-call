// Small shared pieces: game tips, an animated hourglass, and the navigation icons.

export const TIPS = [
  'Heavy pouches are dense. Metal and jewelry often hide inside.',
  'A ✦ glint on the X-ray means something shiny is sealed in that pouch.',
  "Thinking dots over a rival mean they're close to their limit. Push a little more.",
  'Every bid resets the 5-second clock: going once at 2 s, going twice at 3.5 s, SOLD at 5 s.',
  'After 25 seconds the heat kicks in and every bid moves double steps.',
  'JUMP raises by 3 steps at once. Weak bidders often fold right away.',
  'Big Sal is a whale: he bids big early, then gets bored. Wait him out.',
  'Marguerite knows jewelry. If she bids hard, the bag is probably worth it.',
  "Dash bluffs. His early bids don't tell you much.",
  'Each sale to the Customs Dealer drops that item’s price for everyone by 4%. It recovers 6% an hour.',
  'Collectors pay 30–50% over the dealer for the items they love. Check My Bags for offers.',
  'A rival with no miles is grounded for 30 minutes. Fewer rivals, cheaper bags.',
  'Every bag was sealed on NEAR before bidding opened. Tap the 🔒 tag on any bag to check it.',
  'International opens at 3,000 net worth, the Lounge at 12,000. Bigger bags, bigger finds.',
  'The appraisal chip adds up everything you tagged. Stop bidding near that number unless the pouches look good.',
  'Win against the same rival twice and they hold a grudge: they bid 10% higher against you.',
];

let tipIdx = Math.floor(Math.random() * TIPS.length);
export function nextTip() {
  tipIdx = (tipIdx + 1) % TIPS.length;
  return TIPS[tipIdx];
}

let hg = 0;
export function hourglassSvg(size = 40) {
  const id = `hg${++hg}`;
  return `<svg class="hourglass" viewBox="0 0 40 60" width="${size}" height="${size * 1.5}" aria-hidden="true">
    <defs>
      <clipPath id="${id}t"><path d="M9 6h22c0 10-7 16-11 24C16 22 9 16 9 6z"/></clipPath>
      <clipPath id="${id}b"><path d="M20 30c4 8 11 14 11 24H9c0-10 7-16 11-24z"/></clipPath>
    </defs>
    <g clip-path="url(#${id}t)"><rect class="hg-top" x="0" y="8" width="40" height="22" fill="#ffd23f"/></g>
    <g clip-path="url(#${id}b)"><rect class="hg-bot" x="0" y="34" width="40" height="20" fill="#ffd23f"/></g>
    <line class="hg-stream" x1="20" y1="30" x2="20" y2="54" stroke="#ffd23f" stroke-width="1.4"/>
    <path d="M9 6h22c0 10-7 16-11 24c4 8 11 14 11 24H9c0-10 7-16 11-24C16 22 9 16 9 6z" fill="rgba(160,200,255,.08)" stroke="#9fb3d6" stroke-width="2"/>
    <rect x="5" y="2" width="30" height="4.5" rx="2" fill="#8b5a2b"/><rect x="5" y="53.5" width="30" height="4.5" rx="2" fill="#8b5a2b"/>
  </svg>`;
}

const S = (d: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  home: S('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  plane: S('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
  bag: S('<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M8 11v5M16 11v5"/>'),
  album: S('<path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="m12 7 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>'),
  trophy: S('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  help: S('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
  share: S('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  info: S('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
};
