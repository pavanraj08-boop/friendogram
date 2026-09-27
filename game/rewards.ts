/**
 * Daily tasks, streaks and the Daily Pot. Numbers come from economy/simulate.py (see economy/README.md).
 * The pot is funded only by RF the game already took in, so it can never pay out more than it holds,
 * and a player's claim is capped below the canvas edge, so no play pattern returns more than it costs.
 */
import { RF } from "@rarefriends/friendsdk/game";

export type TaskId = "daily" | "canvas" | "solve_canvas" | "stamp" | "lens";
export const TASKS: readonly { id: TaskId; label: string; points: number; hint: string }[] = [
  { id: "canvas", label: "Open a Mystery Canvas", points: 3, hint: "Required to share in today's pot" },
  { id: "daily", label: "Solve ☀ Friend of the Day", points: 3, hint: "Solve it, don't reveal it" },
  { id: "solve_canvas", label: "Solve a canvas instead of revealing it", points: 2, hint: "Skill over the skip button" },
  { id: "stamp", label: "Earn any stamp", points: 2, hint: "◆ Perfect, ∴ Pure logic or » Swift" },
  { id: "lens", label: "Use a lens", points: 1, hint: "Paid lenses burn RF" },
];
export const ALL_TASKS_BONUS = 2;
export const INK_PER_POINT = 10;
export const INK_PER_LENS = 50;

/** Streak tiers: [days, share weight, claim cap as % of today's canvas spend]. Missing a day halves the streak. */
export const STREAK_TIERS: readonly [number, number, number][] = [
  [1, 1.0, 3], [2, 1.15, 3], [3, 1.3, 4.5], [5, 1.6, 4.5], [7, 2.0, 6], [14, 2.5, 7.5], [30, 3.0, 9],
];
export const tierFor = (streak: number) => [...STREAK_TIERS].reverse().find(([d]) => streak >= d) ?? STREAK_TIERS[0];
export const nextTier = (streak: number) => STREAK_TIERS.find(([d]) => d > streak);

/** Canvas edge routing proposed for a live contract (reference ChanceGame keeps 100% as developer stake). */
export const EDGE_SPLIT = { pot: 60, burn: 20, developer: 20 } as const; // the pot share then pays 10% to the featured Friend
/** Steady-state pot per weighted point from the 1,500-player simulation, after the royalty (0.00577 RF). */
export const POT_RF_PER_WEIGHTED_POINT = 5_770_000_000_000_000n; // 0.00577 RF in base units
/** The day's ☀ Friend of the Day earns this share of the pot, paid to that Friend's own wallet. */
export const FEATURED_ROYALTY_PCT = 10;
/** Model figures for 1,500 players: pot inflow ≈ 78 RF/day, featured-Friend royalty ≈ 7.8 RF/day. */
export const MODEL_POT_PER_DAY = 78_000_000_000_000_000_000n;
export const MODEL_ROYALTY_PER_DAY = (MODEL_POT_PER_DAY * BigInt(FEATURED_ROYALTY_PCT)) / 100n;

/** Generation bonus (Grow): earlier generations earn more Ink. Ink only, never pot weight or RF. */
export const GENERATION_INK_BONUS: Readonly<Record<number, number>> = { 1: 50, 2: 40, 3: 30, 4: 20, 5: 10, 6: 0 };
export const inkFor = (points: number, generation: number | null) =>
  Math.round(points * INK_PER_POINT * (100 + (generation ? GENERATION_INK_BONUS[generation] ?? 0 : 0)) / 100);

/** Happiness (simulated): each task adds 5%, all five adds another 5%. A live version would feed rarefriends.com Happiness. */
export const HAPPINESS_PER_TASK = 5;
export const HAPPINESS_ALL_BONUS = 5;
export const happinessFor = (done: ReadonlySet<TaskId>) => done.size * HAPPINESS_PER_TASK + (done.size === TASKS.length ? HAPPINESS_ALL_BONUS : 0);
export const POT_OVERFLOW_DAYS = 2; // unclaimed pot above 2 days of inflow is burned

export function dayPoints(done: ReadonlySet<TaskId>) {
  const base = TASKS.reduce((n, t) => n + (done.has(t.id) ? t.points : 0), 0);
  return base + (done.size === TASKS.length ? ALL_TASKS_BONUS : 0);
}

/** A player's pot claim for the day: weighted share, capped by streak tier and today's canvas spend. */
export function potClaim(done: ReadonlySet<TaskId>, streak: number, canvasSpend: bigint) {
  const [, weight, capPct] = tierFor(streak);
  const eligible = done.has("canvas") && canvasSpend > 0n;
  const weighted = dayPoints(done) * weight;
  const share = (POT_RF_PER_WEIGHTED_POINT * BigInt(Math.round(weighted * 100))) / 100n;
  const cap = (canvasSpend * BigInt(Math.round(capPct * 10))) / 1000n;
  return { eligible, weighted, share, cap, claim: eligible ? (share < cap ? share : cap) : 0n, capped: eligible && share > cap };
}

export const halveStreak = (streak: number) => Math.max(0, Math.floor(streak / 2));
export const RF_UNIT = RF;
