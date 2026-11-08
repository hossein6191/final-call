// NEAR access for the server. Every signer gets its own queue so nonces never collide.
// The House uses three function-call keys (House methods only); each rival has one key
// limited to the player methods. No full-access key is ever loaded here.
import { Account, FailoverRpcProvider, JsonRpcProvider, getTransactionLastResult, teraToGas, type KeyPairString } from 'near-api-js';
import { cfg } from './config.ts';

export const provider = new FailoverRpcProvider(cfg.rpcs.map((url) => new JsonRpcProvider({ url })));

export async function view<T = any>(method: string, args: object = {}): Promise<T> {
  return (await provider.callFunction({ contractId: cfg.contract, method, args })) as T;
}

export interface TxResult<T = unknown> {
  hash: string;
  value: T;
  tgas: number;
  events: { standard: string; event: string; data: any[] }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /nonce|timeout|timed out|TooManyRequests|429|fetch failed|ECONNRESET|503|502|Expired|InvalidNonce/i.test(m);
}

export function panicMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  const hit = /Smart contract panicked: (.*?)(?:"|$)/.exec(m);
  return hit ? hit[1] : m.slice(0, 200);
}

async function send<T>(acct: Account, methodName: string, args: object, tgas: number): Promise<TxResult<T>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r: any = await acct.callFunctionRaw({
        contractId: cfg.contract,
        methodName,
        args,
        gas: teraToGas(String(tgas)),
        waitUntil: 'FINAL',
      });
      const outcomes = [r.transaction_outcome, ...r.receipts_outcome];
      const burnt = outcomes.reduce((s: number, o: any) => s + o.outcome.gas_burnt, 0);
      const events = outcomes
        .flatMap((o: any) => o.outcome.logs as string[])
        .filter((l) => l.startsWith('EVENT_JSON:'))
        .map((l) => JSON.parse(l.slice('EVENT_JSON:'.length)));
      return { hash: r.transaction.hash, value: getTransactionLastResult(r) as T, tgas: burnt / 1e12, events };
    } catch (e) {
      if (attempt < 3 && isTransient(e)) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
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
