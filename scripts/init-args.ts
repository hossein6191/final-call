// Prints the contract's init arguments built from the shared catalog.
import { ITEMS, LADDER } from '../shared/catalog.ts';

const house = process.argv[2] ?? 'finalcall.testnet';
const args = {
  house,
  items: ITEMS.map((i) => ({ id: i.id, base: LADDER[i.level], category: i.category, level: i.level })),
  account_funding: '30000000000000000000000', // 0.03 NEAR for gas
  key_allowance: '250000000000000000000000', // 0.25 NEAR max gas spend per player key
};
console.log(JSON.stringify(args));
