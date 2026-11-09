// End-to-end check on testnet for backing a broke rival and for the gas stipend:
// a broke test rival is backed by a test player, wins a bag, sells, and the contract pays
// the backer; a player who wins a bag gets gas money. Accounts are e2e-* (hidden from the board).
// Uses the contract's local full-access key from ~/.near-credentials (never shipped to the server).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPair, teraToGas, getTransactionLastResult, type KeyPairString } from 'near-api-js';
import { commitmentPreimage, itemToken, makeRng, rollBag } from '../shared/rules.ts';

const CONTRACT = 'finalcall.testnet';
const provider = new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' });
const cred = JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${CONTRACT}.json`, 'utf8'));
const house = new Account(CONTRACT, provider, cred.private_key as KeyPairString);
const view = (method: string, args: object) => provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<any>;
async function call(acct: Account, methodName: string, args: object, tgas: string) {
  const r: any = await acct.callFunctionRaw({ contractId: CONTRACT, methodName, args, gas: teraToGas(tgas), waitUntil: 'FINAL' });
  console.log(`   [${methodName}] tx ${r.transaction.hash}`);
  return getTransactionLastResult(r);
}
const balance = async (id: string) => Number(BigInt((await provider.viewAccount({ accountId: id }) as any).amount) / 10n ** 18n) / 1e6;

const tag = randomBytes(2).toString('hex');
const rk = KeyPair.fromRandom('ed25519');
const pk = KeyPair.fromRandom('ed25519');
const rivalId = `e2e-rival-${tag}.${CONTRACT}`;
const playerId = `e2e-backer-${tag}.${CONTRACT}`;

console.log('1) create a broke test rival (40 miles) and a test player');
await call(house, 'create_account', { sub: `e2e-rival-${tag}`, public_key: rk.getPublicKey().toString(), nickname: 'E2E Rival', rival: true, starting_miles: 40 }, '60');
await call(house, 'create_account', { sub: `e2e-backer-${tag}`, public_key: pk.getPublicKey().toString(), nickname: 'E2E Backer', rival: false }, '60');
const keys = await new Account(playerId, provider).getAccessKeyList();
console.log('   player key methods:', JSON.stringify((keys.keys[0] as any).access_key.permission.FunctionCall.method_names));

console.log('2) player backs the rival with 200 miles (own key)');
const player = new Account(playerId, provider, pk.toString() as KeyPairString);
const owed = await call(player, 'invest', { rival_id: rivalId, amount: 200 }, '12');
console.log('   owed', owed, 'stakes', JSON.stringify(await view('stakes', { rival_id: rivalId })));
console.log('   rival miles now', (await view('get_profile', { account_id: rivalId })).miles);

console.log('3) rival wins a bag, pays, sells the first item');
const lotId = Date.now() % 1_000_000_000;
const items = rollBag(makeRng(lotId), 0);
const salt = randomBytes(16).toString('hex');
const commitment = createHash('sha256').update(commitmentPreimage(CONTRACT, lotId, 0, items, salt)).digest('hex');
await call(house, 'open_lots', { lots: [{ id: lotId, tier: 0, commitment, opening: 100 }] }, '30');
await call(house, 'close_lot', { id: lotId, winner: rivalId, price: 100, items: items.map(itemToken), salt }, '30');
const rival = new Account(rivalId, provider, rk.toString() as KeyPairString);
const minted = (await call(rival, 'pay_lot', { id: lotId }, '12')) as string[];
const before = (await view('get_profile', { account_id: playerId })).miles;
const best = minted.sort((a, b) => b.localeCompare(a))[0];
const got = await call(rival, 'sell', { token_id: best, amount: 1 }, '12');
const after = (await view('get_profile', { account_id: playerId })).miles;
console.log(`   rival sold ${best} for ${got}; backer miles ${before} -> ${after} (+${after - before}); stakes`, JSON.stringify(await view('stakes', { rival_id: rivalId })));

console.log('4) gas stipend: player wins a bag');
const lot2 = lotId + 1;
const items2 = rollBag(makeRng(lot2), 0);
const salt2 = randomBytes(16).toString('hex');
const c2 = createHash('sha256').update(commitmentPreimage(CONTRACT, lot2, 0, items2, salt2)).digest('hex');
await call(house, 'open_lots', { lots: [{ id: lot2, tier: 0, commitment: c2, opening: 100 }] }, '30');
const b0 = await balance(playerId);
await call(house, 'close_lot', { id: lot2, winner: playerId, price: 100, items: items2.map(itemToken), salt: salt2 }, '30');
await new Promise((r) => setTimeout(r, 3000));
const b1 = await balance(playerId);
console.log(`   player NEAR ${b0.toFixed(5)} -> ${b1.toFixed(5)} (+${(b1 - b0).toFixed(5)})`);
await call(player, 'pay_lot', { id: lot2 }, '12');
console.log('done');
