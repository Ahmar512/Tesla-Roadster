// Hand-designed obstacle patterns and the solver that proves each one can be
// beaten. This file has no imports so it can be tested on its own with Node.

/**
 * One character per lane, left to right:
 *   .  empty           c  parked car (hop or dodge)
 *   m  moving car      x  moving car that changes lane
 *   t  truck (dodge)   b  barrier (hop)
 *   s  overhead sign (duck)
 *   r  car carrier: drive up the ramp and ride on top
 */
export type Slot = '.' | 'c' | 'm' | 'x' | 't' | 'b' | 's' | 'r';

export interface Row {
  /** Meters from the start of the pattern to the near end of its obstacles. */
  at: number;
  lanes: string;
}

export interface Pattern {
  name: string;
  /** 0..1; the pattern only appears once the run is at least this hard. */
  minDifficulty: number;
  weight: number;
  rows: Row[];
}

export type Move = 'drive' | 'hop' | 'duck' | 'ride';

export interface Step {
  lane: number;
  move: Move;
}

export const LANE_COUNT = 3;

/** Length of each obstacle along the road. */
export const SLOT_LENGTH: Record<Slot, number> = { '.': 0, c: 4, m: 4, x: 4, t: 8, b: 0.4, s: 0.4, r: 14 };

const MOVE_FOR: Record<Slot, Move | null> = {
  '.': 'drive',
  c: 'hop',
  m: 'hop',
  x: 'hop',
  b: 'hop',
  s: 'duck',
  r: 'ride',
  t: null,
};

/** A hop at top speed carries you this far, so two hops need at least this gap. */
export const HOP_SPACING = 26;

/** Lanes you can cross in `meters` of free road at top speed. */
function reachableLanes(meters: number) {
  return meters >= 18 ? 2 : meters >= 7 ? 1 : 0;
}

export const PATTERNS: Pattern[] = [
  // Warm-up
  { name: 'car', minDifficulty: 0, weight: 3, rows: [{ at: 0, lanes: '.c.' }] },
  { name: 'two-cars', minDifficulty: 0, weight: 3, rows: [{ at: 0, lanes: 'c.c' }] },
  { name: 'truck', minDifficulty: 0, weight: 2, rows: [{ at: 0, lanes: 't..' }] },
  { name: 'barriers', minDifficulty: 0, weight: 2, rows: [{ at: 0, lanes: 'bb.' }] },
  { name: 'sign', minDifficulty: 0, weight: 2, rows: [{ at: 0, lanes: '.ss' }] },
  { name: 'carrier', minDifficulty: 0, weight: 2, rows: [{ at: 0, lanes: '.r.' }] },
  { name: 'staggered', minDifficulty: 0, weight: 2, rows: [{ at: 0, lanes: 'c..' }, { at: 20, lanes: '..c' }] },

  // Getting busy
  { name: 'truck-pair', minDifficulty: 0.12, weight: 2, rows: [{ at: 0, lanes: 'tt.' }] },
  { name: 'hop-row', minDifficulty: 0.12, weight: 2, rows: [{ at: 0, lanes: 'bbb' }] },
  { name: 'duck-row', minDifficulty: 0.12, weight: 2, rows: [{ at: 0, lanes: 'sss' }] },
  { name: 'slalom', minDifficulty: 0.12, weight: 2, rows: [{ at: 0, lanes: 'c..' }, { at: 16, lanes: '.c.' }, { at: 32, lanes: '..c' }] },
  { name: 'carrier-escape', minDifficulty: 0.12, weight: 2, rows: [{ at: 0, lanes: 'trt' }] },
  { name: 'convoy', minDifficulty: 0.12, weight: 2, rows: [{ at: 0, lanes: '.m.' }, { at: 14, lanes: '.m.' }] },
  { name: 'traffic', minDifficulty: 0.12, weight: 2, rows: [{ at: 0, lanes: 'm.m' }] },

  // Real patterns
  { name: 'walls', minDifficulty: 0.3, weight: 2, rows: [{ at: 0, lanes: 'tt.' }, { at: 30, lanes: '.tt' }] },
  { name: 'hop-duck', minDifficulty: 0.3, weight: 2, rows: [{ at: 0, lanes: 'bbb' }, { at: 30, lanes: 'sss' }] },
  { name: 'carrier-run', minDifficulty: 0.3, weight: 2, rows: [{ at: 0, lanes: 'trc' }, { at: 24, lanes: 't.t' }] },
  { name: 'changer', minDifficulty: 0.3, weight: 2, rows: [{ at: 0, lanes: '.x.' }] },
  { name: 'zigzag', minDifficulty: 0.3, weight: 2, rows: [{ at: 0, lanes: 'bb.' }, { at: 26, lanes: '.bb' }, { at: 52, lanes: 'b.b' }] },
  { name: 'busy-street', minDifficulty: 0.3, weight: 2, rows: [{ at: 0, lanes: 'c.t' }, { at: 22, lanes: '.c.' }, { at: 44, lanes: 't.c' }] },

  // Hard
  { name: 'gauntlet', minDifficulty: 0.55, weight: 2, rows: [{ at: 0, lanes: 'tbt' }, { at: 26, lanes: 's.s' }, { at: 50, lanes: 'tt.' }] },
  { name: 'carrier-chain', minDifficulty: 0.55, weight: 2, rows: [{ at: 0, lanes: 'r.t' }, { at: 18, lanes: 'tr.' }] },
  { name: 'dense', minDifficulty: 0.55, weight: 1.5, rows: [{ at: 0, lanes: 'cmc' }] },
  { name: 'duck-hop', minDifficulty: 0.55, weight: 2, rows: [{ at: 0, lanes: 'sbs' }, { at: 28, lanes: 'bsb' }] },
  { name: 'changers', minDifficulty: 0.55, weight: 1.5, rows: [{ at: 0, lanes: 'x.x' }] },
  { name: 'wall-hop', minDifficulty: 0.55, weight: 2, rows: [{ at: 0, lanes: 'tct' }] },
];

export function slotAt(row: Row, lane: number) {
  return row.lanes[lane] as Slot;
}

export function mirrorRows(rows: Row[]): Row[] {
  return rows.map((r) => ({ at: r.at, lanes: [...r.lanes].reverse().join('') }));
}

/** Distance from the pattern start to the far end of its last obstacle. */
export function patternLength(rows: Row[]) {
  let length = 0;
  for (const row of rows) {
    for (let lane = 0; lane < LANE_COUNT; lane++) length = Math.max(length, row.at + SLOT_LENGTH[slotAt(row, lane)]);
  }
  return length;
}

/** The obstacle (if any) still occupying `lane` at `row` from an earlier row. */
function coveringSlot(rows: Row[], index: number, lane: number): Slot | null {
  for (let j = 0; j < index; j++) {
    const slot = slotAt(rows[j], lane);
    if (rows[j].at + SLOT_LENGTH[slot] > rows[index].at) return slot;
  }
  return null;
}

/**
 * Finds the easiest way through a pattern, entering in any lane: one step
 * (lane + move) per row, or null if the pattern can't be beaten. Prefers
 * riding carriers (more fun), then plain driving, then hops/ducks and lane changes.
 */
export function solve(rows: Row[], random: () => number = Math.random): Step[] | null {
  let best: { cost: number; steps: Step[] } | null = null;

  const visit = (index: number, steps: Step[], cost: number, lastHopAt: number) => {
    if (best && cost >= best.cost) return;
    if (index === rows.length) {
      best = { cost, steps: [...steps] };
      return;
    }
    const row = rows[index];
    const prev = steps[index - 1];

    for (const lane of shuffledLanes(random)) {
      const covering = coveringSlot(rows, index, lane);
      let move: Move | null;
      if (covering === 'r') {
        // Still on (or beside) a carrier: only reachable by staying on its deck.
        move = prev?.lane === lane && prev.move === 'ride' ? 'ride' : null;
      } else if (covering && covering !== '.') {
        move = null;
      } else {
        move = MOVE_FOR[slotAt(row, lane)];
      }
      if (!move) continue;
      if (move === 'hop' && row.at - lastHopAt < HOP_SPACING) continue;

      let stepCost = { drive: 0.3, ride: 0, duck: 2, hop: 2 }[move];
      if (prev) {
        const crossed = Math.abs(lane - prev.lane);
        const lo = Math.min(lane, prev.lane);
        const hi = Math.max(lane, prev.lane);
        let blockedUntil = rows[index - 1].at;
        for (let l = lo; l <= hi; l++) {
          blockedUntil = Math.max(blockedUntil, rows[index - 1].at + SLOT_LENGTH[slotAt(rows[index - 1], l)]);
        }
        if (crossed > reachableLanes(row.at - blockedUntil)) continue;
        stepCost += crossed;
      }

      steps.push({ lane, move });
      visit(index + 1, steps, cost + stepCost, move === 'hop' ? row.at : lastHopAt);
      steps.pop();
    }
  };

  visit(0, [], 0, -Infinity);
  return best ? (best as { steps: Step[] }).steps : null;
}

function shuffledLanes(random: () => number) {
  const lanes = [0, 1, 2];
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}
