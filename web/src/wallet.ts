// The player's key lives only in this browser. It can call the six player methods on the
// game contract and nothing else, so the game never shows a wallet popup.
import { Account, JsonRpcProvider, KeyPair, type KeyPairString } from 'near-api-js';
import { sendCall } from '../../shared/near-send.ts';

const K = { key: 'fc:key', account: 'fc:account', nick: 'fc:nick' };

function get(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

export interface Identity {
  account: string;
  nickname: string;
  key: KeyPairString;
}

export function loadIdentity(): Identity | null {
  const key = get(K.key);
  const account = get(K.account);
  const nickname = get(K.nick);
  return key && account && nickname ? { key: key as KeyPairString, account, nickname } : null;
}

let pendingKey: KeyPair | null = null;
export function newPublicKey(): string {
  pendingKey = KeyPair.fromRandom('ed25519');
  return pendingKey.getPublicKey().toString();
}

export function saveIdentity(account: string, nickname: string) {
  if (!pendingKey) throw new Error('no key');
  set(K.key, pendingKey.toString());
  set(K.account, account);
  set(K.nick, nickname);
}

export function forget() {
  for (const k of Object.values(K)) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function publicKeyOf(id: Identity): string {
  return KeyPair.fromString(id.key).getPublicKey().toString();
}

export function signLogin(id: Identity, nonce: string): string {
  const kp = KeyPair.fromString(id.key);
  return b64(kp.sign(new TextEncoder().encode(`final-call login ${nonce}`)).signature);
}

// ---------- contract calls, one at a time so gas refunds land between them ----------

let account: Account | null = null;
let provider: JsonRpcProvider | null = null;
let contractId = '';
let queue: Promise<unknown> = Promise.resolve();

export function connectChain(id: Identity, rpc: string, contract: string) {
  contractId = contract;
  provider = new JsonRpcProvider({ url: rpc });
  account = new Account(id.account, provider, id.key);
}

export interface Sent<T> {
  hash: string;
  value: T;
}

export function call<T = unknown>(methodName: string, args: object): Promise<Sent<T>> {
  const run = queue.then(async () => {
    if (!account || !provider) throw new Error('not connected');
    const r = await sendCall<T>(account, provider, contractId, methodName, args, 12);
    return { hash: r.hash, value: r.value };
  });
  queue = run.catch(() => {});
  return run;
}

export function errorText(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  const hit = /Smart contract panicked: ([^"\n]+)/.exec(m);
  return hit ? hit[1] : m.slice(0, 140);
}
