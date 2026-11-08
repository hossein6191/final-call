import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name} (run scripts/setup-testnet.ts first)`);
  return v;
}

export const cfg = {
  network: process.env.NEAR_NETWORK ?? 'testnet',
  contract: need('CONTRACT_ID'),
  rpcs: (process.env.NEAR_RPC ?? 'https://test.rpc.fastnear.com').split(',').map((s) => s.trim()).filter(Boolean),
  houseKeys: need('HOUSE_KEYS').split(',').map((s) => s.trim()),
  rivalKeys: JSON.parse(need('RIVAL_KEYS')) as Record<string, string>,
  nearAiKey: process.env.NEARAI_API_KEY ?? '',
  nearAiModel: process.env.NEARAI_MODEL ?? 'z-ai/glm-5.3-flash',
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.DATA_DIR ?? 'data',
  explorer: process.env.EXPLORER ?? 'https://testnet.nearblocks.io',
  // Joins per IP per hour; each join spends a little testnet NEAR.
  joinLimit: Number(process.env.JOIN_LIMIT ?? 6),
};
