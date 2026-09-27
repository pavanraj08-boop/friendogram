# Friendogram economy analysis

`simulate.py` models 1,500 players for 45 days (seeded, deterministic). `results.txt` is its output.

## What the game actually earns from

| Flow | Per unit | Where it goes |
|---|---|---|
| Mystery Canvas | 1 RF | SDK reference `ChanceGame`: **100% into prize stake** (no burn). Relics pay back 0.90 RF on average; the **0.10 RF edge** is free stake the developer can withdraw. |
| Relic redemption | 0–5 RF fixed | Paid from stake, reserved at purchase, no expiry. |
| Lens | 0.1 RF | Proposed custom integration: 100% burned. |

The earlier "50% burned / 50% rewards" line described Rare Friends platform payments (activation, hardwire, upgrades), not this contract. It has been corrected.

## Proposal: route the 10% edge

- **60% → ☀ Daily Pot**, **20% → burned**, **20% → developer**.
- The pot is split each UTC day by *task points × streak weight* among players who opened ≥ 1 canvas that day.
- Each claim is capped at a streak-scaled share of *that day's own canvas spend* (3% on day 1 → 9% at a 30-day streak). The cap is always below the 10% edge, so **no play pattern can get back 100% or more**.
- Unclaimed pot above 2 days of inflow is burned.

## Daily tasks (points, Ink = points × 10)

| Task | Points | Why |
|---|---:|---|
| Open a Mystery Canvas | 3 | Skin in the game; required for a pot claim |
| Solve ☀ Friend of the Day | 3 | Shared daily ritual; spotlights a different Friend |
| Solve a canvas instead of revealing | 2 | Rewards skill over the skip button |
| Earn any stamp | 2 | Ties in Perfect / Pure logic / Swift |
| Use a lens | 1 | Small nudge toward the RF burn |
| All five | +2 | Completion bonus |

Streak tiers: day 1 ×1.0 (3% cap), 2 ×1.15, 3 ×1.3 (4.5%), 5 ×1.6, 7 ×2.0 (6%), 14 ×2.5 (7.5%), 30 ×3.0 (9%). Missing a day **halves** the streak rather than resetting it. Ink (never redeemable for RF) buys lenses at 50 Ink each.

## Results (45 days, 1,500 players)

| Design | Casual return | Daily-player return (canvas RF) | Min-spend grinder | Burn % of spend |
|---|---:|---:|---:|---:|
| No pot (baseline) | 90.0% | 90.0% | 90.0% | 5.7% |
| Pot, uncapped | 92.9% | 97.3% | **105.5% (exploit)** | 7.6% |
| **Chosen: pot + streak caps** | 93.1% | **96.9%** | 97.3% | **8.1%** |

- Daily players earn **6.9% of canvas spend back from the pot vs 3.1% for casual players (2.2×)**, about 0.14 RF per day at 2.2 canvases a day.
- The uncapped version let a one-canvas-a-day grinder take 105% back, draining everyone else. The cap closes it.
- Burn rises from 5.7% to 8.1% of all RF spent, because unclaimed pot overflow burns.
- `rewards.test.mjs` checks all 1,280 task/streak/spend combinations: the worst case returns 99.0%.

## Needs integration before launch

Persistence (streaks across days), a pot contract that receives the edge split and pays claims to canonical Friend wallets, and a lens-burn action. Token rewards for gameplay may need legal review.
