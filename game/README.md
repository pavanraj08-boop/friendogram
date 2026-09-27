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

Checks (typecheck, SDK validation, mock-wallet browser run at 960 px and 360 px):

```sh
npm install -D playwright && npx playwright install chromium   # once
npm run check:friendogram
```

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
- Settings: sound on/off (muted by default), reduce motion, Assist.

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

Skill never changes payouts; puzzles are presentation for an already-settled outcome.
Intended live integration: canvas payments follow Rare Friends gameplay rules
(50% burned, 50% to Friend rewards). All balances, relics and sales here are
simulated. No transactions are sent.

## Notes and limits

- Uses only public SDK modules: runtime props, `sprites` (canonical artwork),
  `game`, `frame` (`GameMenu`), `ui`, `sounds`.
- Wallet, Friend selection and the ownership gate are the SDK runtime's.
- Progress is session-only (the SDK supplies no persistence).
- Relic artwork is original 16 × 16 pixel art made for this game.
- Future work: hint purchases burning RF, daily shared puzzle, leaderboard (needs persistence).
