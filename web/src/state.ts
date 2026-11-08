import { api } from './net.ts';
import { loadIdentity, type Identity } from './wallet.ts';
import { ITEM_BY_ID, LADDER } from '../../shared/catalog.ts';
import { COND_BP, TERMINALS, type Cond } from '../../shared/rules.ts';

export interface Config {
  contract: string;
  network: string;
  explorer: string;
  rpc: string;
  rivals: { sub: string; account: string; name: string; title: string; bio: string; color: string; style: string; loves?: string[] }[];
  terminals: typeof TERMINALS;
}

export const state = {
  cfg: null as Config | null,
  id: loadIdentity() as Identity | null,
  profile: null as any,
  prices: {} as Record<string, number>,
  pending: [] as { id: number; price: number }[],
  netWorth: 0,
};

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const short = (h: string, n = 6) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : '');
export const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const txLink = (hash: string, label = short(hash)) =>
  `<a href="${esc(`${state.cfg!.explorer}/txns/${encodeURIComponent(hash)}`)}" target="_blank" rel="noopener">${esc(label)}</a>`;
export const accLink = (acc: string, label = acc) =>
  `<a href="${esc(`${state.cfg!.explorer}/address/${encodeURIComponent(acc)}`)}" target="_blank" rel="noopener">${esc(label)}</a>`;

export function toast(html: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export const RARITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** Rarity of an item relative to the terminal it came from. */
export function rarityOf(id: string, tier: number): number {
  return Math.max(0, Math.min(4, ITEM_BY_ID[id].level - TERMINALS[tier].ladderStart));
}
export function baseOf(id: string) {
  return LADDER[ITEM_BY_ID[id].level];
}
export function valueOf(id: string, cond: Cond, demandBp = 10000) {
  return Math.floor((baseOf(id) * COND_BP[cond] * demandBp) / 1e8);
}

export async function refreshMe() {
  if (!state.id) return;
  const me = await api(`/me?account=${encodeURIComponent(state.id.account)}`);
  state.profile = me.profile;
  state.prices = me.prices ?? {};
  state.pending = me.pending ?? [];
  const items = (me.profile?.inventory ?? []).reduce((s: number, [t, n]: [string, number]) => s + (state.prices[t] ?? 0) * n, 0);
  state.netWorth = (me.profile?.miles ?? 0) + items - (me.profile?.debt ?? 0);
  document.dispatchEvent(new CustomEvent('me'));
  return me;
}

export function walletHtml() {
  const p = state.profile;
  return `<div class="wallet"><div class="miles">${p ? fmt(p.miles) : '—'}<small>MI</small></div><div class="sub">net worth ${fmt(state.netWorth)}</div></div>`;
}

export function go(hash: string) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
