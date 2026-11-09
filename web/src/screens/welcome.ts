import { api } from '../net.ts';
import { newPublicKey, saveIdentity, loadIdentity } from '../wallet.ts';
import { state, $, esc, txLink, go, accLink } from '../state.ts';
import { unlock, sound } from '../audio.ts';
import { showHowto, howtoSeen } from './howto.ts';
import { carousel } from './home.ts';
import { AVATARS } from '../avatars.ts';
import { hourglassSvg, nextTip } from '../ui/bits.ts';

function flap(text: string) {
  return [...text]
    .map((ch, i) => (ch === ' ' ? '<span class="gap"></span>' : `<span style="animation-delay:${i * 70}ms">${ch}</span>`))
    .join('');
}

export function welcome(root: HTMLElement) {
  root.innerHTML = `
  <div class="welcome">
    <div class="flap" aria-label="Final Call">${flap('FINAL CALL')}</div>
    ${carousel()}
    <div class="tagline">Unclaimed airport luggage goes under the hammer. <b>X-ray</b> each bag, <b>outbid</b> AI rivals who carry real wallets, and <b>flip</b> what you find.</div>
    <div class="lineup">${(state.cfg?.rivals ?? []).map((r) => `<div class="lu" title="${esc(r.title)}">${AVATARS[r.sub] ?? ''}<b style="color:${r.color}">${esc(r.name)}</b></div>`).join('')}</div>
    <div class="small muted" style="text-align:center;margin-top:-8px">Tonight's rivals. Each one is an AI agent with its own NEAR wallet.</div>
    <div class="panel checklist">
      <div class="step done"><i>✓</i> No wallet, no seed phrase, no popups.</div>
      <div class="step done"><i>✓</i> Every bag is sealed on NEAR before you bid. Check any tag.</div>
      <div class="step done"><i>✓</i> Your rivals' money is real and public. They can go broke.</div>
    </div>
    <form class="field" id="join">
      <label for="nick" class="small muted">Your traveller name</label>
      <input id="nick" maxlength="16" autocomplete="nickname" placeholder="e.g. Rosa" required />
      <button class="btn primary" id="go" type="submit">CHECK IN</button>
    </form>
    <div id="progress" class="checklist" hidden></div>
    <div class="row small"><button class="btn ghost" id="how" style="min-height:36px;font-size:15px;padding:6px 10px">HOW TO PLAY</button><span class="grow"></span><span class="muted">Runs on NEAR testnet. Miles are play money.</span></div>
  </div>`;
  ($('#how', root) as HTMLButtonElement).onclick = () => showHowto();
  if (!howtoSeen()) setTimeout(() => showHowto(), 900);

  const form = $('#join', root) as HTMLFormElement;
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    unlock();
    sound.tap();
    const nickname = ($('#nick', root) as HTMLInputElement).value.trim();
    if (!/^[\p{L}\p{N} _.-]{2,16}$/u.test(nickname)) {
      ($('#nick', root) as HTMLInputElement).setCustomValidity('2-16 letters or numbers');
      form.reportValidity();
      return;
    }
    ($('#go', root) as HTMLButtonElement).disabled = true;
    const prog = $('#progress', root);
    prog.hidden = false;
    prog.innerHTML = `
      <div class="loading-card">
        ${hourglassSvg(34)}
        <div class="grow">
          <b>CHECKING YOU IN…</b>
          <div class="lbar"><i id="lfill"></i></div>
          <div class="step busy" id="s1"><i></i> Creating your NEAR account. Your browser keeps its only key.</div>
          <div class="step" id="s2"><i>2</i> Sealing your first bag on chain.</div>
          <div class="ltip" id="ltip">${esc(nextTip())}</div>
        </div>
      </div>`;
    prog.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const fill = $('#lfill', root) as HTMLElement;
    const t0 = performance.now();
    const grow = setInterval(() => (fill.style.width = `${Math.min(92, (1 - Math.exp(-(performance.now() - t0) / 4000)) * 100)}%`), 120);
    const tips = setInterval(() => ($('#ltip', root).textContent = nextTip()), 3500);
    const stop = () => {
      clearInterval(grow);
      clearInterval(tips);
    };
    try {
      const publicKey = newPublicKey();
      const res = await api('/join', { nickname, publicKey });
      saveIdentity(res.account, res.nickname);
      state.id = loadIdentity();
      $('#s1', root).className = 'step done';
      $('#s1', root).innerHTML = `<i>✓</i> ${accLink(res.account, esc(res.account))} · ${txLink(res.tx)}`;
      $('#s2', root).className = 'step done';
      $('#s2', root).innerHTML = `<i>✓</i> First bag sealed. Lot #${res.tutorialLot}.`;
      stop();
      fill.style.width = '100%';
      sound.breakEven();
      setTimeout(() => go('#home'), 900);
    } catch (e) {
      stop();
      sound.error();
      prog.innerHTML = `<div class="step"><i>!</i> ${esc(String((e as Error).message))}</div>`;
      ($('#go', root) as HTMLButtonElement).disabled = false;
    }
  };
}
