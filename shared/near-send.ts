// Sends one function call and waits for it to be final, without ever double-sending.
// The transaction is signed once; if the RPC drops the connection we poll the same
// transaction by hash (and re-broadcast the same bytes, which is safe) until it lands.
import { actions, baseEncode, getTransactionLastResult, teraToGas, type Account, type Provider } from 'near-api-js';
import { sha256 } from '@noble/hashes/sha2.js';

export interface Sent<T> {
  hash: string;
  value: T;
  tgas: number;
  events: { standard: string; event: string; data: any[] }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('rpc timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** A failure the chain decided on (a panic or an invalid tx), as opposed to a network hiccup. */
function isFinal(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /panicked|ActionError|FunctionCallError|InvalidTx|NotEnoughBalance|NotEnoughAllowance|MethodNotFound|Access key does not allow|AccessKeyNotFound|InvalidAccessKey/i.test(m);
}

function failureOf(r: any): string | null {
  const outcomes = [r.transaction_outcome, ...(r.receipts_outcome ?? [])];
  const failed = outcomes.find((o: any) => o.outcome.status?.Failure);
  const top = r.status?.Failure ?? failed?.outcome.status.Failure;
  return top ? JSON.stringify(top) : null;
}

function parse<T>(r: any): Sent<T> {
  const fail = failureOf(r);
  if (fail && r.status?.Failure) throw new Error(fail);
  const outcomes = [r.transaction_outcome, ...r.receipts_outcome];
  const burnt = outcomes.reduce((s: number, o: any) => s + Number(o.outcome.gas_burnt), 0);
  const events = outcomes
    .flatMap((o: any) => o.outcome.logs as string[])
    .filter((l) => l.startsWith('EVENT_JSON:'))
    .map((l) => JSON.parse(l.slice('EVENT_JSON:'.length)));
  return { hash: r.transaction.hash, value: getTransactionLastResult(r) as T, tgas: burnt / 1e12, events };
}

export async function sendCall<T = unknown>(
  account: Account,
  provider: Provider,
  contractId: string,
  methodName: string,
  args: object,
  tgas: number,
): Promise<Sent<T>> {
  let signed: any = null;
  for (let attempt = 0; attempt < 3 && !signed; attempt++) {
    try {
      signed = await withTimeout(
        account.createSignedTransaction({ receiverId: contractId, actions: [actions.functionCall(methodName, args, teraToGas(String(tgas)), 0n)] }),
        10_000,
      );
    } catch (e) {
      if (attempt === 2 || isFinal(e)) throw e;
      await sleep(600 * (attempt + 1));
    }
  }
  const hash = baseEncode(sha256(signed.transaction.encode()));
  const deadline = Date.now() + 60_000;
  let lastErr: unknown = null;
  try {
    return parse<T>(await withTimeout(provider.sendTransactionUntil(signed, 'FINAL'), 25_000));
  } catch (e) {
    if (isFinal(e)) throw e;
    lastErr = e;
  }
  // The send may or may not have landed. Ask about this exact transaction until we know.
  while (Date.now() < deadline) {
    await sleep(1500);
    try {
      const r = await withTimeout(provider.viewTransactionStatus({ txHash: hash, accountId: account.accountId, waitUntil: 'FINAL' }), 15_000);
      return parse<T>(r);
    } catch (e) {
      if (isFinal(e)) throw e;
      lastErr = e;
      // Unknown to this node yet: re-broadcast the same signed bytes (no new nonce, no double spend).
      if (/UNKNOWN_TRANSACTION|doesn't exist|not found/i.test(String((e as Error)?.message ?? e))) {
        await withTimeout(provider.sendTransactionAsync(signed), 10_000).catch(() => {});
      }
    }
  }
  throw new Error(`transaction ${hash} not confirmed: ${String((lastErr as Error)?.message ?? lastErr).slice(0, 160)}`);
}
