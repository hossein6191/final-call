// Checks a lot from public chain data only: no server, no secrets.
//   npm run verify -- <lot id>          (or no id: the most recent revealed lot)
// It reads the lot from the contract, rebuilds the committed preimage from the revealed
// items and salt, hashes it locally, and compares with the tag sealed before bidding opened.
import { createHash } from 'node:crypto';

const CONTRACT = process.env.CONTRACT_ID ?? 'finalcall.testnet';
const RPC = process.env.NEAR_RPC?.split(',')[0] ?? 'https://test.rpc.fastnear.com';

async function view(method: string, args: object) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: CONTRACT, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') },
    }),
  });
  const j: any = await res.json();
  if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error ?? j.result.error));
  return JSON.parse(Buffer.from(j.result.result).toString('utf8'));
}

let id = Number(process.argv[2]);
if (!id) {
  const recent: any[] = await view('recent_lots', { limit: 50 });
  const done = recent.find((l) => l.items.length);
  if (!done) throw new Error('no revealed lots yet');
  id = done.id;
}
const lot: any = await view('get_lot', { id });
if (!lot) throw new Error(`lot ${id} not found`);
console.log(`lot ${id} · tier ${lot.tier} · status ${lot.status}`);
console.log(`sealed tag  ${lot.commitment}  (block ${lot.opened_block})`);
if (!lot.items.length) {
  console.log('not revealed yet: contents and salt stay secret until the hammer falls');
  process.exit(0);
}
const pre = `final-call/v1|${CONTRACT}|lot=${id}|tier=${lot.tier}|items=${lot.items.join(',')}|salt=${lot.salt}`;
const local = createHash('sha256').update(pre).digest('hex');
console.log(`preimage    ${pre}`);
console.log(`local hash  ${local}`);
const onChain = await view('check_commitment', { id, items: lot.items, salt: lot.salt });
console.log(`match: ${local === lot.commitment ? 'YES' : 'NO'} (contract's own check_commitment: ${onChain})`);
if (lot.winner) console.log(`sold to ${lot.winner} for ${lot.price} miles`);
process.exit(local === lot.commitment && onChain ? 0 : 1);
