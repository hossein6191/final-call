// One-time setup after deploying the contract. Run locally, never on the server:
//   node scripts/setup-testnet.ts
// 1. Adds 3 House keys to the contract account. They can only call the House methods.
// 2. Creates the six rival accounts, each holding one key limited to the player methods.
// 3. Writes the server's secrets to .env (gitignored). The contract's full-access key stays
//    in ~/.near-credentials on this machine.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { Account, JsonRpcProvider, KeyPair, PublicKey, actions, teraToGas, type KeyPairString } from 'near-api-js';
import { RIVALS } from '../shared/rivals.ts';

const CONTRACT = process.env.CONTRACT_ID ?? 'finalcall.testnet';
const HOUSE_METHODS = ['create_account', 'open_lots', 'close_lot', 'expire_lot', 'grant_loan'];
const provider = new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' });
const cred = JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${CONTRACT}.json`, 'utf8'));
const owner = new Account(CONTRACT, provider, cred.private_key as KeyPairString);

if (existsSync('.env')) {
  console.error('.env already exists; refusing to overwrite keys. Delete it first if you mean to redo setup.');
  process.exit(1);
}

const houseKeys = [0, 1, 2].map(() => KeyPair.fromRandom('ed25519'));
await owner.signAndSendTransaction({
  receiverId: CONTRACT,
  actions: houseKeys.map((k) => actions.addFunctionCallAccessKey(PublicKey.from(k.getPublicKey().toString()), CONTRACT, HOUSE_METHODS)),
  waitUntil: 'FINAL',
});
console.log(`added ${houseKeys.length} House keys limited to: ${HOUSE_METHODS.join(', ')}`);

const house = new Account(CONTRACT, provider, houseKeys[0].toString() as KeyPairString);
const rivalKeys: Record<string, string> = {};
for (const r of RIVALS) {
  const k = KeyPair.fromRandom('ed25519');
  await house.callFunction({
    contractId: CONTRACT,
    methodName: 'create_account',
    args: { sub: r.sub, public_key: k.getPublicKey().toString(), nickname: r.name, rival: true, starting_miles: r.startMiles },
    gas: teraToGas('60'),
    waitUntil: 'FINAL',
  });
  rivalKeys[r.sub] = k.toString();
  console.log(`created ${r.sub}.${CONTRACT} with ${r.startMiles} miles`);
}

writeFileSync(
  '.env',
  [
    `NEAR_NETWORK=testnet`,
    `CONTRACT_ID=${CONTRACT}`,
    `NEAR_RPC=https://test.rpc.fastnear.com,https://near-testnet.drpc.org`,
    `HOUSE_KEYS=${houseKeys.map((k) => k.toString()).join(',')}`,
    `RIVAL_KEYS=${JSON.stringify(rivalKeys)}`,
    `NEARAI_API_KEY=`,
    `NEARAI_MODEL=z-ai/glm-5.3-flash`,
    `PORT=8787`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);
console.log('wrote .env (secrets, gitignored)');
