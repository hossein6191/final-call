// The six rival bidders. Each one is a real account on NEAR with its own miles.
// Their bidding is deterministic code driven by these numbers; NEAR AI only writes their lines.

import type { Category } from './catalog.ts';

export interface RivalDef {
  sub: string; // account = <sub>.<contract>
  name: string;
  title: string;
  bio: string;
  color: string;
  startMiles: number;
  noise: number; // estimate error, +- share
  greed: [number, number]; // max bid = estimate * greed (random in range per lot)
  walletShare: number; // never commits more than this share of free miles to one lot
  style: 'expert' | 'whale' | 'bluffer' | 'rookie' | 'collector' | 'bargain';
  loves?: Category[]; // collectors pay +50% for these and post buy orders
  voice: string; // prompt hint for their lines
}

export const RIVALS: RivalDef[] = [
  {
    sub: 'marguerite', name: 'Marguerite', title: 'Vintage dealer', color: '#e8a33d',
    bio: 'Forty years of flea markets. Reads an X-ray like a menu.',
    startMiles: 6000, noise: 0.08, greed: [0.92, 1.0], walletShare: 0.45, style: 'expert',
    loves: ['jewelry', 'style'],
    voice: 'dry, elegant, faintly condescending antiques dealer; short sentences',
  },
  {
    sub: 'bigsal', name: 'Big Sal', title: 'The whale', color: '#d94f4f',
    bio: 'Owns three pawn shops and hates losing to newcomers.',
    startMiles: 25000, noise: 0.18, greed: [0.95, 1.12], walletShare: 0.35, style: 'whale',
    voice: 'loud, boastful, rich pawn-shop owner who teases newcomers',
  },
  {
    sub: 'dash', name: 'Dash', title: 'The bluffer', color: '#4fb3d9',
    bio: 'Jumps the price early and hopes you flinch.',
    startMiles: 3000, noise: 0.2, greed: [0.8, 0.95], walletShare: 0.6, style: 'bluffer',
    voice: 'cocky streetwise reseller who talks fast and bluffs',
  },
  {
    sub: 'kip', name: 'Kip', title: 'The rookie', color: '#7cc46b',
    bio: 'Watched one video about luggage auctions. Very excited.',
    startMiles: 2000, noise: 0.35, greed: [0.95, 1.2], walletShare: 0.6, style: 'rookie',
    voice: 'over-excited beginner, says the wrong thing, lots of exclamation marks',
  },
  {
    sub: 'odo', name: 'Professor Odo', title: 'The collector', color: '#a37de8',
    bio: 'Collects records, comics and anything with a story.',
    startMiles: 5000, noise: 0.12, greed: [0.85, 1.0], walletShare: 0.45, style: 'collector',
    loves: ['music', 'collectibles'],
    voice: 'gentle, nerdy professor who gets emotional about records and old comics',
  },
  {
    sub: 'nell', name: 'Nell', title: 'Bargain hunter', color: '#e87db0',
    bio: 'Never pays retail. Never.',
    startMiles: 2500, noise: 0.1, greed: [0.62, 0.75], walletShare: 0.5, style: 'bargain',
    voice: 'thrifty, practical, sarcastic about anyone who overpays',
  },
];

export const RIVAL_BY_SUB: Record<string, RivalDef> = Object.fromEntries(RIVALS.map((r) => [r.sub, r]));
