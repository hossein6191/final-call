// Fast-forward a week of the economy with the real rules and print who won, who went broke,
// and how dealer demand moved.  node scripts/simulate.ts [seed]
import { simulateWeek } from '../shared/sim.ts';

const t0 = performance.now();
const r = simulateWeek(Number(process.argv[2] ?? 7));
console.log(`${r.lots} lots in ${r.hours} simulated hours (${Math.round(performance.now() - t0)} ms)`);
for (const b of [...r.bidders].sort((a, b) => b.history.at(-1)! - a.history.at(-1)!)) {
  const start = b.history[0];
  const end = b.history.at(-1)!;
  console.log(`${b.name.padEnd(14)} ${String(start).padStart(7)} -> ${String(end).padStart(7)}  won ${String(b.won).padStart(4)} bags  debt ${b.debt}`);
}
console.log(`bankruptcies: ${r.bankruptcies.length} (${[...new Set(r.bankruptcies.map((x) => x.name))].join(', ')})`);
console.log(`jackpots: ${r.jackpots.length}; best flip: ${r.bestFlip?.name} paid ${r.bestFlip?.paid} for ${r.bestFlip?.worth}`);
for (const [k, v] of Object.entries(r.demand)) console.log(`demand ${k.padEnd(13)} min ${(Math.min(...v) / 100).toFixed(0)}%  end ${(v.at(-1)! / 100).toFixed(0)}%`);
