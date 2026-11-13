// Rival tricks and the table host. The server decides when a trick fires; these only stage it.
import { esc } from '../state.ts';
import { AVATARS } from '../avatars.ts';
import { sound } from '../audio.ts';

export interface TableInfo {
  rivals: { sub: string; name: string; power: { name: string; text: string } | null }[];
  cheatRisk: number;
  teamUps: boolean;
}

const HOST_SVG = `<svg viewBox="0 0 64 64" class="host-face" aria-hidden="true"><circle cx="32" cy="34" r="20" fill="#d9a77c"/><path d="M14 24q18-16 36 0v-4q-18-12-36 0z" fill="#2a1a10"/><circle cx="25" cy="33" r="2.4" fill="#2a1a10"/><circle cx="39" cy="33" r="2.4" fill="#2a1a10"/><path d="M24 43q8 6 16 0" stroke="#5a2e1d" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M22 52l10 4 10-4-10 8z" fill="#c23a4a"/><circle cx="32" cy="55" r="2" fill="#ffd23f"/></svg>`;

/** The host walks on during the scan and says who is at the table and what to watch for. */
export function showHost(host: HTMLElement, t: TableInfo) {
  host.querySelector('.host')?.remove();
  const tricks = t.rivals.filter((r) => r.power);
  const notes: string[] = [];
  for (const r of tricks) notes.push(`<li><b>${esc(r.name)}</b> ${esc(r.power!.text)} (<i>${esc(r.power!.name)}</i>).</li>`);
  if (t.teamUps) notes.push('<li>Two rivals may <b>team up</b> against you tonight.</li>');
  if (t.cheatRisk >= 0.4) notes.push('<li>Word is someone at this table <b>peeks inside the bags</b>. Report them after the hammer.</li>');
  else if (t.cheatRisk > 0) notes.push('<li>Now and then a rival <b>peeks inside</b>. If one bids too sure of themselves, report them.</li>');
  const el = document.createElement('div');
  el.className = 'host';
  el.innerHTML = `${HOST_SVG}<div class="host-bub"><b>Your host</b><span>Tonight: ${t.rivals.map((r) => esc(r.name)).join(', ')}.</span>${notes.length ? `<ul>${notes.join('')}</ul>` : '<span>A clean table. Good luck.</span>'}</div>`;
  host.appendChild(el);
  const leave = () => {
    if (!el.isConnected) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
  };
  el.onclick = leave;
  setTimeout(leave, notes.length ? 5200 : 3000);
}

/** Lights out: the table goes dark, the rival laughs, and the bid buttons are dead for a moment. */
export function blackout(host: HTMLElement, sub: string, name: string, line: string, ms: number) {
  const el = document.createElement('div');
  el.className = 'blackout';
  el.innerHTML = `<div class="bo-face">${AVATARS[sub] ?? ''}</div><b>LIGHTS OUT</b><span>${esc(name)}: “${esc(line)}”</span>`;
  host.appendChild(el);
  (el.querySelector('.bo-face') as HTMLElement).classList.add('expr-happy');
  sound.laugh();
  const btns = [...host.querySelectorAll<HTMLButtonElement>('#bid, #jump')];
  btns.forEach((b) => b.classList.add('dark'));
  setTimeout(() => {
    el.classList.add('out');
    btns.forEach((b) => b.classList.remove('dark'));
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Make it rain: coins pour over the table and it shakes. */
export function rain(host: HTMLElement, ms: number) {
  const el = document.createElement('div');
  el.className = 'rain';
  el.innerHTML = Array.from({ length: 26 }, () => {
    const x = Math.random() * 100;
    const d = 0.7 + Math.random() * 0.9;
    const delay = Math.random() * 0.5;
    return `<i style="left:${x}%;animation-duration:${d}s;animation-delay:${delay}s"></i>`;
  }).join('');
  host.appendChild(el);
  host.classList.remove('shake');
  void host.offsetWidth;
  host.classList.add('shake');
  sound.coins();
  setTimeout(() => el.remove(), ms + 600);
}

/** Lecture: the X-ray fogs over while the professor talks. */
export function fog(belt: HTMLElement, ms: number) {
  const el = document.createElement('div');
  el.className = 'fog';
  belt.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  }, ms);
}
