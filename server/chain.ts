// NEAR access for the server. Every signer gets its own queue so nonces never collide.
// The House uses three function-call keys (House methods only); each rival has one key
// limited to the player methods. No full-access key is ever loaded here.
import { Account, FailoverRpcProvider, JsonRpcProvider, type KeyPairString } from 'near-api-js';
import { sendCall, type Sent } from '../shared/near-send.ts';
import { cfg } from './config.ts';

export const provider = new FailoverRpcProvider(cfg.rpcs.map((url) => new JsonRpcProvider({ url })));

export async function view<T = any>(method: string, args: object = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await Promise.race([
        provider.callFunction({ contractId: cfg.contract, method, args }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('view timeout')), 8000)),
      ])) as T;
    } catch (e) {
      if (attempt >= 2 || /panicked/.test(String((e as Error).message))) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

export type TxResult<T = unknown> = Sent<T>;

export function panicMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  const hit = /Smart contract panicked: (.*?)(?:\\?"|$)/.exec(m);
  return hit ? hit[1] : m.slice(0, 200);
}

function send<T>(acct: Account, methodName: string, args: object, tgas: number): Promise<TxResult<T>> {
  return sendCall<T>(acct, provider, cfg.contract, methodName, args, tgas);
}

class Lane {
  private tail: Promise<unknown> = Promise.resolve();
  pending = 0;
  readonly account: Account;
  constructor(account: Account) {
    this.account = account;
  }

  call<T>(method: string, args: object, tgas: number): Promise<TxResult<T>> {
    this.pending++;
    const run = this.tail.then(() => send<T>(this.account, method, args, tgas));
    this.tail = run.then(
      () => this.pending--,
      () => this.pending--,
    );
    return run;
  }
}

const houseLanes = cfg.houseKeys.map((k) => new Lane(new Account(cfg.contract, provider, k as KeyPairString)));

export function house<T = unknown>(method: string, args: object, tgas = 30): Promise<TxResult<T>> {
  const lane = houseLanes.reduce((a, b) => (b.pending < a.pending ? b : a));
  return lane.call<T>(method, args, tgas);
}

const rivalLanes = new Map<string, Lane>();
for (const [sub, key] of Object.entries(cfg.rivalKeys)) {
  rivalLanes.set(sub, new Lane(new Account(`${sub}.${cfg.contract}`, provider, key as KeyPairString)));
}

export function rival<T = unknown>(sub: string, method: string, args: object, tgas = 15): Promise<TxResult<T>> {
  const lane = rivalLanes.get(sub);
  if (!lane) throw new Error(`no key for rival ${sub}`);
  return lane.call<T>(method, args, tgas);
}

export function accountOf(sub: string): string {
  return `${sub}.${cfg.contract}`;
}

export function txUrl(hash: string): string {
  return `${cfg.explorer}/txns/${hash}`;
}

export async function nearBalance(accountId: string): Promise<number> {
  const a: any = await provider.viewAccount({ accountId });
  return Number(BigInt(a.amount) / 10n ** 18n) / 1e6;
}
