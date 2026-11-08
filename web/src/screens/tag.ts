import { api } from '../net.ts';
import { state, $, fmt, esc, txLink, accLink } from '../state.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { commitmentPreimage, parseItemToken } from '../../../shared/rules.ts';
import { iconSvg } from '../icons.ts';

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function tag(root: HTMLElement, id: number) {
  root.innerHTML = `<div class="screen"><div class="h1">Tag check · lot ${id}</div><div id="body"><span class="spinner"></span></div></div>`;
  void (async () => {
    const lot = await api(`/lot/${id}`).catch((e) => ({ error: String(e.message) }));
    const body = $('#body', root);
    if (lot.error) {
      body.innerHTML = `<div class="panel">${esc(lot.error)}</div>`;
      return;
    }
    const chain = await fetch(state.cfg!.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'query',
        params: { request_type: 'call_function', finality: 'final', account_id: lot.contract, method_name: 'get_lot', args_base64: btoa(JSON.stringify({ id })) },
      }),
    })
      .then((r) => r.json())
      .then((j) => JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result))))
      .catch(() => null);

    const rows: string[] = [];
    rows.push(`<div class="line"><i>🔒</i><span>Tag on chain: <span class="hash">${chain?.commitment ?? '?'}</span><br>Sealed in block ${chain?.opened_block ?? '?'} · ${lot.sealedTx ? txLink(lot.sealedTx) : ''}</span></div>`);
    rows.push(`<div class="line"><i>${chain?.commitment === lot.commitment ? '✅' : '❌'}</i><span>Server's copy of the tag matches the contract's</span></div>`);
    if (lot.tokens) {
      const items = lot.tokens.map(parseItemToken);
      const pre = commitmentPreimage(lot.contract, id, lot.tier, items, lot.salt);
      const h = await sha256hex(pre);
      rows.push(`<div class="line"><i>${h === chain?.commitment ? '✅' : '❌'}</i><span>sha256 of the revealed contents, computed in your browser:<br><span class="hash">${h}</span></span></div>`);
      rows.push(`<div class="line"><i>🧾</i><span>Preimage: <span class="hash">${esc(pre)}</span></span></div>`);
      if (lot.closedTx) rows.push(`<div class="line"><i>✅</i><span>Revealed on chain (the contract refuses a mismatch) · ${txLink(lot.closedTx)}</span></div>`);
      if (lot.winner) rows.push(`<div class="line"><i>🏷</i><span>Sold to ${accLink(lot.winner)} for ${fmt(lot.price)} MI${lot.paidTx ? ` · paid ${txLink(lot.paidTx)}` : ''}</span></div>`);
      body.innerHTML = `
        <div class="panel verify">${rows.join('')}</div>
        <div class="section-title">INSIDE</div>
        <div class="items">${items.map((it: any) => `<div class="item in">${iconSvg(it.id)}<div class="nm">${esc(ITEM_BY_ID[it.id].name)}</div><div class="cond">${it.cond}${it.pouch ? ' · pouch' : ''}</div></div>`).join('')}</div>
        ${lot.rivals ? `<div class="section-title">RIVALS' LIMITS (FROM THE X-RAY ONLY)</div><div class="panel small">${lot.rivals.map((r: any) => `${esc(r.name)}: estimate ${fmt(r.estimate)}, max ${fmt(r.max)}`).join('<br>')}</div>` : ''}
        ${lot.ai ? `<div class="section-title">RIVAL VOICES</div><div class="panel small">${lot.ai.source === 'near-ai' ? `Written by NEAR AI (${esc(lot.ai.verification?.model ?? '')}).` : 'Scripted lines.'} ${lot.ai.verification ? `${lot.ai.verification.ok ? '✅ Signed by the key NEAR AI reports for its TEE; request and response hashes match' : '⚠️ signature not confirmed'} · signer <span class="hash">${esc(lot.ai.verification.signingAddress ?? '')}</span> · <a href="${esc(lot.ai.verification.verifyUrl ?? '')}" target="_blank" rel="noopener">full attestation on NEAR AI</a>` : esc(lot.ai.error ?? '')}</div>` : ''}`;
    } else {
      rows.push(`<div class="line"><i>⏳</i><span>Not revealed yet. The contents and salt stay secret until the hammer falls.</span></div>`);
      body.innerHTML = `<div class="panel verify">${rows.join('')}</div>`;
    }
  })();
}
