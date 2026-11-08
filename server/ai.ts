// Rival voices from NEAR AI Cloud (a model running in a TEE), with the response signature
// checked here. The model only writes lines; bids and money are decided by code.
import { createHash, randomBytes } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { cfg } from './config.ts';
import type { RivalDef } from '../shared/rivals.ts';

const API = 'https://cloud-api.near.ai/v1';

export interface Lines {
  open: string;
  raise: string;
  fold: string;
  win: string;
}

export interface Verification {
  completionId: string;
  model: string;
  requestHash: string;
  responseHash: string;
  signedText: string;
  signature: string;
  signingAddress: string;
  recoveredAddress: string;
  attestedAddress: string | null;
  ok: boolean;
  checkedAt: number;
  verifyUrl: string;
}

export interface Voiced {
  source: 'near-ai' | 'scripted';
  lines: Record<string, Lines>;
  completionId?: string;
  /** Resolves once the TEE signature has been checked (the lines are usable before that). */
  verification?: Promise<Verification | null>;
  error?: string;
}

const SCRIPTED: Record<RivalDef['style'], Lines[]> = {
  expert: [
    { open: 'I know what that silhouette is.', raise: 'Patience is a price too.', fold: 'Not at that number, darling.', win: 'Experience pays. Usually.' },
    { open: 'Hm. Decent stitching.', raise: 'Again?', fold: 'Overpriced. Enjoy it.', win: 'As expected.' },
  ],
  whale: [
    { open: 'Cute bag. Mine now.', raise: 'I spend more on lunch.', fold: 'Fine, have your little suitcase.', win: 'Write it down: Sal wins again.' },
    { open: "Let's make this quick.", raise: 'You still here?', fold: 'Ehh, not worth my time.', win: 'Money talks, kid.' },
  ],
  bluffer: [
    { open: 'Jumping in. Try and keep up.', raise: "I've got a feeling about this one.", fold: '...was bluffing anyway.', win: 'Told you I had a feeling.' },
    { open: 'Big number, big guy.', raise: 'Scared yet?', fold: 'Nah. Read you wrong.', win: 'Nobody calls my bluff.' },
  ],
  rookie: [
    { open: 'Ooh ooh, me!', raise: 'Is this how it works?!', fold: 'Wait, is that a lot of miles?', win: 'I WON? I won!!' },
    { open: 'I watched a video about this!', raise: 'More! I think?', fold: 'My mom says I have to stop.', win: 'Best day ever!' },
  ],
  collector: [
    { open: 'There might be history in there.', raise: 'For the archive.', fold: 'Some stories are too expensive.', win: 'Into the collection it goes.' },
    { open: 'Is that a record sleeve?', raise: 'I simply must.', fold: 'Alas.', win: 'Wonderful. Wonderful.' },
  ],
  bargain: [
    { open: 'I will pay exactly what it is worth.', raise: 'Still a bargain.', fold: 'Only fools pay retail.', win: 'Steal of the day.' },
    { open: 'Lowball time.', raise: 'Fine. One more.', fold: 'Have fun overpaying.', win: 'Cheap and cheerful.' },
  ],
};

export function scriptedLines(lineup: RivalDef[], player = '', memory = ''): Record<string, Lines> {
  return Object.fromEntries(
    lineup.map((r) => {
      const pool = SCRIPTED[r.style];
      const l = { ...pool[Math.floor(Math.random() * pool.length)] };
      if (memory.includes(`${r.sub} has lost`)) l.open = player ? `You again, ${player}? Not this time.` : 'You again? Not this time.';
      else if (memory.includes(`${r.sub} has beaten`)) l.open = player ? `Back for more, ${player}?` : 'Back for more?';
      return [r.sub, l];
    }),
  );
}

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');

function personalMessageHash(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`);
  const all = new Uint8Array(prefix.length + bytes.length);
  all.set(prefix);
  all.set(bytes, prefix.length);
  return keccak_256(all);
}

export function recoverAddress(text: string, sigHex: string): string {
  const sig = Uint8Array.from(Buffer.from(sigHex.replace(/^0x/, ''), 'hex'));
  let v = sig[64];
  if (v >= 27) v -= 27;
  const compact = new Uint8Array(65);
  compact[0] = v;
  compact.set(sig.slice(0, 64), 1);
  const pub = secp256k1.recoverPublicKey(compact, personalMessageHash(text), { prehash: false });
  const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
  const addr = keccak_256(uncompressed.slice(1)).slice(-20);
  return `0x${Buffer.from(addr).toString('hex')}`;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: cfg.nearAiKey ? { authorization: `Bearer ${cfg.nearAiKey}` } : {} });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
  return res.json();
}

/** Checks the TEE signature on a completion: hashes match, signer recovered, signer attested. */
export async function verifyCompletion(id: string, model: string, requestBody: string, responseBody: string): Promise<Verification> {
  const requestHash = sha256hex(requestBody);
  const responseHash = sha256hex(responseBody);
  let sig: any;
  for (let i = 0; i < 4; i++) {
    try {
      sig = await getJson(`${API}/signature/${encodeURIComponent(id)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`);
      break;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  const signedText: string = sig.text;
  const recovered = recoverAddress(signedText, sig.signature);
  let attested: string | null = null;
  try {
    const nonce = randomBytes(32).toString('hex');
    const rep = await getJson(`${API}/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${nonce}`);
    const all = [rep.signing_address, ...(rep.model_attestations ?? []).map((m: any) => m.signing_address), ...(rep.all_attestations ?? []).map((m: any) => m.signing_address)]
      .filter(Boolean)
      .map((a: string) => a.toLowerCase());
    attested = all.find((a: string) => a === recovered.toLowerCase()) ?? all[0] ?? null;
  } catch {
    attested = null;
  }
  const hashesMatch = signedText.includes(`${requestHash}:${responseHash}`);
  const ok = hashesMatch && recovered.toLowerCase() === String(sig.signing_address).toLowerCase() && attested === recovered.toLowerCase();
  const receipt = { completionId: id, model, signingAddress: sig.signing_address, signedText, signature: sig.signature };
  return {
    completionId: id,
    model,
    requestHash,
    responseHash,
    signedText,
    signature: sig.signature,
    signingAddress: sig.signing_address,
    recoveredAddress: recovered,
    attestedAddress: attested,
    ok,
    checkedAt: Date.now(),
    verifyUrl: `https://cloud.near.ai/verify?model=${encodeURIComponent(model)}#receipt=${Buffer.from(JSON.stringify(receipt)).toString('base64url')}`,
  };
}

/**
 * Asks NEAR AI for every rival's lines in one call. The prompt only contains what the X-ray
 * shows, never the sealed contents, so the request hash proves the rivals bid blind.
 */
export async function voiceRivals(lineup: RivalDef[], xray: string, player = 'the newcomer', memory = ''): Promise<Voiced> {
  if (!cfg.nearAiKey) return { source: 'scripted', lines: scriptedLines(lineup, player, memory), error: 'no NEAR AI key' };
  const people = lineup.map((r) => `- ${r.sub}: ${r.name}, ${r.title}. Voice: ${r.voice}.`).join('\n');
  const body = JSON.stringify({
    model: cfg.nearAiModel,
    max_tokens: 400,
    temperature: 0.9,
    reasoning_effort: 'low',
    messages: [
      {
        role: 'system',
        content:
          'You write one-liners for rival bidders at a lost-luggage auction game. Each line is under 9 words, in character, PG, no emoji, never mention real brands. Reply with JSON only.',
      },
      {
        role: 'user',
        content: `The X-ray of the bag shows: ${xray}\nThe human bidder is called ${player}.${memory ? ` History: ${memory}. Let it show in their lines.` : ''}\nRivals:\n${people}\nReturn {"<sub>": {"open": "...", "raise": "...", "fold": "...", "win": "..."}} for every rival sub above.`,
      },
    ],
  });
  try {
    const ctrl = AbortSignal.timeout(9000);
    const res = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.nearAiKey}` },
      body,
      signal: ctrl,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
    const data = JSON.parse(text);
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const json = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    const fallback = scriptedLines(lineup);
    const lines: Record<string, Lines> = {};
    for (const r of lineup) {
      const l = json[r.sub] ?? {};
      const clean = (s: unknown, d: string) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 70) : d);
      lines[r.sub] = {
        open: clean(l.open, fallback[r.sub].open),
        raise: clean(l.raise, fallback[r.sub].raise),
        fold: clean(l.fold, fallback[r.sub].fold),
        win: clean(l.win, fallback[r.sub].win),
      };
    }
    const voiced: Voiced = { source: 'near-ai', lines, completionId: data.id };
    // Verification runs while the lines are already in use; the result goes on the lot record.
    voiced.verification = verifyCompletion(data.id, cfg.nearAiModel, body, text).catch((e) => {
      voiced.error = `verification failed: ${String(e.message ?? e).slice(0, 120)}`;
      return null;
    });
    return voiced;
  } catch (e) {
    return { source: 'scripted', lines: scriptedLines(lineup), error: String((e as Error).message ?? e).slice(0, 160) };
  }
}
