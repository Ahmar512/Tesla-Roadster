// Verifies every obstacle pattern (and its mirror image) can be beaten.
// Run with: npm run check:patterns
import { mirrorRows, PATTERNS, solve } from '../src/level/patterns.ts';

let failures = 0;
for (const pattern of PATTERNS) {
  for (const rows of [pattern.rows, mirrorRows(pattern.rows)]) {
    for (let trial = 0; trial < 200; trial++) {
      const steps = solve(rows);
      if (!steps) {
        console.error(`✗ ${pattern.name}: no way through ${rows.map((r) => `${r.at}:${r.lanes}`).join(' ')}`);
        failures++;
        break;
      }
    }
  }
  const path = solve(pattern.rows)!;
  console.log(`✓ ${pattern.name.padEnd(15)} ${path?.map((s) => `L${s.lane}:${s.move}`).join(' → ')}`);
}

if (failures) {
  console.error(`\n${failures} pattern(s) cannot be beaten`);
  process.exit(1);
}
console.log(`\nAll ${PATTERNS.length} patterns (and mirrors) are beatable.`);
