# Friendogram

FriendSDK **v0.1.2** game. Picross (nonogram) puzzles drawn from **your own Rare
Friend's 16 × 16 on-chain sprite**. Solve a puzzle and your Friend walks off the board.
A simulated **Mystery Canvas** (1 RF) rolls a relic that you reveal by solving it.

## Run

From the SDK root (Node.js 22+):

```sh
npm ci
npm run dev:friendogram        # same as: npm run dev:game -- games/friendogram
```

Checks (typecheck, SDK validation, solver proof, mock-wallet browser runs):

```sh
npm install -D playwright && npx playwright install chromium   # once
npm run check:friendogram
```

Browser checks: `browser.test.mjs` (desktop/phone smoke + solve), `deep.test.mjs`
(controls, pause, all six relic tiers, selling, limits), `features.test.mjs` (perks,
lenses and burn, Friend of the Day).

![Solved portrait](screenshot.png)

Open `http://localhost:4173`, connect a wallet on Robinhood mainnet (4663),
choose an owned hardwired Generations Friend (generation ≥ 1) and play.

## How to play

- Clues list the runs of filled squares in each row and column, in order.
- **Tap/click** or **drag** to fill. **Right-click** or switch to **✕ Mark** to mark
  empty squares. Clues turn grey once their line is satisfied.
- Keyboard: focus the board, then arrows/WASD move, Space applies the current tool,
  F fills, X marks, T switches tool.
- **Assist** (on by default, in Settings) catches wrong fills and counts mistakes.
  With Assist off, any grid that satisfies every clue counts as solved.
- **Portrait puzzles (free):** up to five poses of the selected Friend (front,
  profiles, back, mid-stride). Duplicate poses are skipped. Solved portraits animate
  with your Friend's canonical walk cycle and show its family.
- **Mystery Canvas (simulated):** buy in *Canvases*, then open one. Its relic is fixed
  by the SDK's chance client **when opened**. Solving only reveals it, and
  *Reveal now* skips the puzzle. Keep the relic or sell it for its fixed RF value.
- **Family perks:** your Friend's real on-chain family changes the rules, and rarer
  families (2.5% of designs) get stronger perks:

  | Family | Share | Perk |
  | --- | --- | --- |
  | Skeleton | 18% | Bare Bones: first 3 wrong fills per puzzle don't count |
  | Mask | 18% | Second Face: first lens per puzzle is free |
  | Family | 18% | Kinship: each solved puzzle banks 1 free lens |
  | Cellular | 18% | Mitosis: lenses cost half |
  | Asymmetry | 18% | Tilt: first column starts solved |
  | Hoverer | 2.5% | Float: timer runs at half speed + first lens free |
  | Colossus | 2.5% | Titan: first row and column start solved |
  | Sparkling | 2.5% | Shine: 3 free lenses per puzzle |
  | Hollow | 2.5% | Void Sight: empty lines pre-marked, mistakes never count |

- **Lenses (RF burn):** reveal the row or column under the cursor (buttons, or L / K).
  Free and banked lenses are used first; after that a lens costs **0.1 RF, 100% burned**
  (0.05 RF for Cellular). The HUD shows total RF burned. Burned RF reduces the spendable
  balance used for canvas purchases. Solving an already-solved line is refused at no cost.
- **☀ Friend of the Day:** every player gets the same Rare Friend each UTC day, cycling
  through 18 hand-picked hardwired Friends (two per family). It stays anonymous until
  solved, then the Gallery shows a result card (puzzle number, Friend, time, mistakes,
  lenses) to screenshot and share. The artwork is the Friend's canonical on-chain frame,
  read once and embedded, so the game never reads other token IDs at runtime.
- Settings: sound on/off (muted by default), reduce motion, Assist.

- **No guessing, ever:** a built-in line solver checks every puzzle when it loads (your
  Friend's sprite, relics, daily Friends). If pure row/column logic would stall, it places the
  fewest locked **anchor** cells (dotted) needed to finish by logic. The two rarest relics need 2
  anchors each; `solver.test.mjs` also proves 200 random pictures come out uniquely solvable.
- **Difficulty and par:** each puzzle is rated ★–★★★★ from how many logic sweeps it takes,
  with a par time of 45 s + 45 s per star.
- **Stamps (cosmetic, no RF value):** ◆ Perfect (no mistakes, no lenses), ∴ Pure logic
  (Assist off throughout), » Swift (under par with ≤ 2 mistakes). Shown on the solve card,
  canvas reveals, the daily result card and the Gallery.
- **Solve celebration:** your Friend walks across a card with time, stars and stamps, plus
  *Next puzzle*. It stays still with reduced motion.
- **Session economy ledger (Gallery):** canvases bought, the live-play 50% burn / 50%
  rewards split, lens burn, relics sold back, and total RF removed from supply.

## Economy (simulated)

| Rule | Exact value |
| --- | --- |
| Mystery Canvas price | 1 RF (`1000000000000000000` base units) |
| Smudge (Junk) | 23% / 2,300 bps · 0 RF |
| Pixel Pebble (Common) | 35% / 3,500 bps · 0.5 RF |
| Warm Egg (Uncommon) | 25% / 2,500 bps · 1 RF |
| Gen-1 Crown (Rare) | 10% / 1,000 bps · 2 RF |
| Hollow Relic (Epic) | 5% / 500 bps · 3.5 RF |
| Sparkling Star (Legendary) | 2% / 200 bps · 5 RF |
| Expected reward | 0.90 RF per canvas (10% edge) |
| Maximum prize / reserve per canvas | 5 RF |
| Consumable | One canvas produces exactly one relic; no reroll |
| Redemption | Fixed value, no expiry, to the Friend's canonical wallet |

Skill, perks and lenses never change canvas payouts; puzzles are presentation for an
already-settled outcome.

Lens burns are tracked by the game itself: the SDK v0.1.2 bridge has no generic
spend/burn action, so the burn total is simulated and subtracted from the spendable
balance shown in-game. Intended live integration: a lens burns 0.1 RF from the Friend's
canonical wallet (100% burn, no reward share).
Intended live integration: canvas payments follow Rare Friends gameplay rules
(50% burned, 50% to Friend rewards). All balances, relics and sales here are
simulated. No transactions are sent.

## Notes and limits

- Uses only public SDK modules: runtime props, `sprites` (canonical artwork),
  `game`, `frame` (`GameMenu`), `ui`, `sounds`.
- Wallet, Friend selection and the ownership gate are the SDK runtime's.
- Progress is session-only (the SDK supplies no persistence).
- Relic artwork is original 16 × 16 pixel art made for this game.
- Future work: on-chain lens burns, a shared daily leaderboard (needs persistence),
  a Puzzle Maker where players' drawings become canvases with creator fees.
