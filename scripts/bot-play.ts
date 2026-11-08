// Plays one full round against a running server, like the browser would:
// join -> sign in with the browser key -> scan -> bid -> hammer -> pay with own key -> sell.
//   node scripts/bot-play.ts [http://localhost:8787]
import { Account, JsonRpcProvider, KeyPair, teraToGas, type KeyPairString } from 'near-api-js';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const cfg: any = await (await fetch(`${BASE}/api/config`)).json();
const provider = new JsonRpcProvider({ url: cfg.rpc });
const kp = KeyPair.fromRandom('ed25519');

const joined: any = await (
  await fetch(`${BASE}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Bot Tester', publicKey: kp.getPublicKey().toString() }),
  })
).json();
console.log('joined', joined);
if (!joined.account) process.exit(1);

const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws`);
const me = new Account(joined.account, provider, kp.toString() as KeyPairString);
let maxBid = 0;
let done = false;

ws.onmessage = async (ev) => {
  const m = JSON.parse(String(ev.data));
  const t = m.type as string;
  if (t === 'hello') {
    const sig = kp.sign(new TextEncoder().encode(`final-call login ${m.nonce}`)).signature;
    ws.send(JSON.stringify({ type: 'auth', account: joined.account, signature: Buffer.from(sig).toString('base64') }));
  } else if (t === 'auth:ok') {
    console.log('signed in as', m.account);
    ws.send(JSON.stringify({ type: 'enter', lotId: joined.tutorialLot }));
  } else if (t === 'auction:start') {
    maxBid = Math.round(m.appraisal * 1.4);
    console.log(`scan: lot ${m.lotId}, ${m.manifest.length} items, appraisal ${m.appraisal}, rivals ${m.rivals.map((r: any) => r.name).join(', ')}; bot will go to ${maxBid}`);
  } else if (t === 'auction:live' || t === 'auction:bid') {
    if (t === 'auction:bid') console.log(`  ${m.name} bids ${m.price}${m.line ? ` — "${m.line}"` : ''}`);
    if (m.by !== joined.account && m.next <= maxBid) {
      setTimeout(() => ws.send(JSON.stringify({ type: 'bid' })), 700);
    }
  } else if (t === 'auction:fold') {
    console.log(`  ${m.name} folds${m.line ? ` — "${m.line}"` : ''}`);
  } else if (t === 'auction:call') {
    console.log(`  going ${m.stage}...`);
  } else if (t === 'auction:sold') {
    console.log(`SOLD to ${m.winnerName ?? 'nobody'} for ${m.price}. Inside: ${m.items.map((i: any) => `${i.id}@${i.cond}`).join(', ')}`);
    if (m.winner !== joined.account) done = true;
  } else if (t === 'lot:revealed') {
    console.log('revealed on chain', m.url);
    if (!done) {
      const r: any = await me.callFunctionRaw({ contractId: cfg.contract, methodName: 'pay_lot', args: { id: m.lotId }, gas: teraToGas('10'), waitUntil: 'FINAL' });
      console.log('paid with own key', r.transaction.hash);
      const st: any = await (await fetch(`${BASE}/api/lot/${m.lotId}/paid`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx: r.transaction.hash }) })).json();
      console.log('server sees', st);
      const meInfo: any = await (await fetch(`${BASE}/api/me?account=${joined.account}`)).json();
      console.log('miles', meInfo.profile.miles, 'items', meInfo.profile.inventory, 'dealer prices', meInfo.prices);
    }
    ws.close();
  } else if (t === 'lot:paid') {
    console.log('rival paid', m.url);
  } else if (t === 'ai:voices' || t === 'ai:verified') {
    console.log(' ', t, JSON.stringify(m));
  } else if (t === 'error' || t === 'lot:error' || t === 'auth:fail') {
    console.log('ERROR', m);
    ws.close();
  }
};
