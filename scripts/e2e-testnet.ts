// End-to-end check on testnet: create a player account, seal a bag, reveal it,
// let the player pay with their own scoped key, then sell one item.
// Uses the contract's local full-access key from ~/.near-credentials (never shipped to the server).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPair, teraToGas, getTransactionLastResult, type KeyPairString } from 'near-api-js';
import { commitmentPreimage, itemToken, makeRng, rollBag, openingBid } from '../shared/rules.ts';

const CONTRACT = 'finalcall.testnet';
const provider = new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' });
const cred = JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${CONTRACT}.json`, 'utf8'));
const house = new Account(CONTRACT, provider, cred.private_key as KeyPairString);
const view = (method: string, args: object) => provider.callFunction({ contractId: CONTRACT, method, args });
// Sends a call, waits for every receipt (so gas refunds have landed), prints gas burnt.
async function call(acct: Account, methodName: string, args: object, tgas: string) {
  const r: any = await acct.callFunctionRaw({ contractId: CONTRACT, methodName, args, gas: teraToGas(tgas), waitUntil: 'FINAL' });
  const burnt = [r.transaction_outcome, ...r.receipts_outcome].reduce((s: number, o: any) => s + o.outcome.gas_burnt, 0);
  console.log(`   [${methodName}] ${(burnt / 1e12).toFixed(2)} TGas burnt, tx ${r.transaction.hash}`);
  return getTransactionLastResult(r);
}

const kp = KeyPair.fromRandom('ed25519');
const sub = `e2e-${randomBytes(3).toString('hex')}`;
const player = `${sub}.${CONTRACT}`;

console.log('1) create', player);
const created = await call(house, 'create_account', { sub, public_key: kp.getPublicKey().toString(), nickname: 'E2E Tester', rival: false }, '60');
console.log('   result', created);
const keys = await new Account(player, provider).getAccessKeyList();
console.log('   keys on account:', JSON.stringify(keys.keys.map((k: any) => k.access_key.permission)));

const lotId = Date.now() % 1_000_000_000;
const items = rollBag(makeRng(lotId), 0);
const salt = randomBytes(16).toString('hex');
const commitment = createHash('sha256').update(commitmentPreimage(CONTRACT, lotId, 0, items, salt)).digest('hex');
console.log('2) seal lot', lotId, commitment);
await call(house, 'open_lots', { lots: [{ id: lotId, tier: 0, commitment, opening: openingBid(0) }] }, '30');

console.log('3) reveal, winner', player);
await call(house, 'close_lot', { id: lotId, winner: player, price: openingBid(0), items: items.map(itemToken), salt }, '30');

console.log('4) player pays with own key');
const me = new Account(player, provider, kp.toString() as KeyPairString);
const minted = await call(me, 'pay_lot', { id: lotId }, '10');
console.log('   minted', minted);

const tok = (minted as string[])[0];
console.log('5) sell', tok, 'quote', await view('dealer_quote', { token_id: tok, amount: 1 }));
const got = await call(me, 'sell', { token_id: tok, amount: 1 }, '10');
console.log('   got', got);
const prof: any = await view('get_profile', { account_id: player });
console.log('6) profile miles', prof.miles, 'won', prof.lots_won, 'inventory', prof.inventory.length);
console.log('   check_commitment', await view('check_commitment', { id: lotId, items: items.map(itemToken), salt }));

console.log('7) player key cannot call house methods:');
try {
  await call(me, 'grant_loan', { account_id: player, amount: 5000 }, '10');
  console.log('   UNEXPECTED: succeeded');
} catch (e) {
  console.log('   refused:', String((e as Error).message).slice(0, 120));
}
