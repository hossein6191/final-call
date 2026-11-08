import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

process.env.CONTRACT_ID ??= 'finalcall.testnet';
process.env.HOUSE_KEYS ??= 'ed25519:x';
process.env.RIVAL_KEYS ??= '{}';
const { recoverAddress } = await import('../server/ai.ts');

test('recovers the signer of an EIP-191 personal message', () => {
  const priv = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(priv, false);
  const addr = `0x${Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString('hex')}`;
  const text = 'z-ai/glm-5.3-flash:aaaa:bbbb';
  const bytes = new TextEncoder().encode(text);
  const prefixed = Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${bytes.length}`), bytes]);
  const sig = secp256k1.sign(keccak_256(prefixed), priv, { prehash: false, format: 'recovered' });
  // Ethereum layout: r || s || v (27/28)
  const eth = Buffer.concat([Buffer.from(sig.slice(1)), Buffer.from([sig[0] + 27])]);
  assert.equal(recoverAddress(text, `0x${eth.toString('hex')}`), addr);
});
