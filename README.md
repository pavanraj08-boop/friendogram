# Friendogram

Picross (nonogram) puzzles drawn from **your own Rare Friend's 16 × 16 on-chain sprite**. Solve the grid and your Friend walks off the board.

Rare Friends Vibeathon entry · FriendSDK **v0.1.2** · Builder: Pavan Raj R.

**Play:** https://pavanraj08-boop.github.io/friendogram/ (needs a browser wallet on Robinhood mainnet, chain 4663, holding a hardwired Generations NFT, generation 1 or higher; all RF is simulated)

![Solved portrait](game/screenshot.png)

## What's in it

- **Portrait puzzles** from your Friend's own poses (front, profiles, back, mid-stride).
- **Family perks:** your Friend's real family changes the rules; rarer families (2.5%) get stronger perks.
- **Lenses:** reveal a row or column. After free ones, each costs 0.1 RF and **100% is burned**. The HUD tracks total RF burned.
- **☀ Friend of the Day:** the same mystery Rare Friend for every player each day, with a shareable result card.
- **Mystery Canvas (1 RF):** a chance-backed relic (6 tiers, 0.90 RF expected value) you reveal by solving it, then keep or sell.

## Repository layout

- `game/`: game source (`index.tsx`, `nonogram.ts`, `relics.ts`, `perks.ts`, `daily.ts`, `perks.ts`, `daily.ts`, `game.json`, `style.css`, `host.css`), rules README and browser tests
- `docs/`: the built static preview served by GitHub Pages (output of `npx friendsdk build`)

## Run locally

```sh
git clone https://github.com/spokesz/friendsdk.git && cd friendsdk
git checkout v0.1.2
mkdir -p games && cp -r ../friendogram/game games/friendogram
npm ci
npm run dev:game -- games/friendogram
```

Open `http://localhost:4173`, connect your wallet and select your Friend.

Checks: `npx friendsdk check games/friendogram`, `npx friendsdk test games/friendogram`, then `node games/friendogram/browser.test.mjs 960`, `deep.test.mjs` and `features.test.mjs` (needs `npm i -D playwright && npx playwright install chromium`).

Full rules, perks, odds and economy terms: [game/README.md](game/README.md).
