import { api } from '../net.ts';
import { newPublicKey, saveIdentity, loadIdentity } from '../wallet.ts';
import { state, $, esc, txLink, go, accLink } from '../state.ts';
import { unlock, sound } from '../audio.ts';

function flap(text: string) {
  return [...text]
    .map((ch, i) => (ch === ' ' ? '<span class="gap"></span>' : `<span style="animation-delay:${i * 70}ms">${ch}</span>`))
    .join('');
}

export function welcome(root: HTMLElement) {
  root.innerHTML = `
  <div class="welcome">
    <div class="flap" aria-label="Final Call">${flap('FINAL CALL')}</div>
    <div class="tagline">Unclaimed airport luggage goes under the hammer. Scan each bag on the X-ray, outbid rivals who carry real wallets, and flip what you find.</div>
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
    <div class="small muted">Runs on NEAR testnet. Miles are play money.</div>
  </div>`;

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
      <div class="step busy" id="s1"><i></i> Creating your NEAR account. Your browser keeps its only key.</div>
      <div class="step" id="s2"><i>2</i> Sealing your first bag on chain.</div>`;
    try {
      const publicKey = newPublicKey();
      const res = await api('/join', { nickname, publicKey });
      saveIdentity(res.account, res.nickname);
      state.id = loadIdentity();
      $('#s1', root).className = 'step done';
      $('#s1', root).innerHTML = `<i>✓</i> ${accLink(res.account, esc(res.account))} · ${txLink(res.tx)}`;
      $('#s2', root).className = 'step done';
      $('#s2', root).innerHTML = `<i>✓</i> First bag sealed. Lot #${res.tutorialLot}.`;
      sound.breakEven();
      setTimeout(() => go('#arrivals'), 900);
    } catch (e) {
      sound.error();
      prog.innerHTML = `<div class="step"><i>!</i> ${esc(String((e as Error).message))}</div>`;
      ($('#go', root) as HTMLButtonElement).disabled = false;
    }
  };
}
