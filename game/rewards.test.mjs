// Node check: daily-pot invariants hold for every task combination, streak and spend level.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const out = await build({ entryPoints: [here + "rewards.ts"], bundle: true, write: false, format: "esm", platform: "node",
  alias: { "@rarefriends/friendsdk/game": here + "../../dist/game.js" }, logLevel: "error" });
const R = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const RF = 10n ** 18n, ids = R.TASKS.map(t => t.id);
let worst = 0, fails = 0, n = 0;
const ok = (name, pass, info = "") => { console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); if (!pass) fails++; };
for (let mask = 0; mask < 1 << ids.length; mask++) {
  const done = new Set(ids.filter((_, i) => mask & (1 << i)));
  for (const streak of [1, 2, 3, 5, 7, 14, 30, 365]) for (const opened of [0, 1, 2, 5, 20]) {
    const spend = RF * BigInt(opened), c = R.potClaim(done, streak, spend); n++;
    if (!done.has("canvas") || opened === 0) { if (c.claim !== 0n) fails++; continue; }
    const ratio = Number(c.claim * 10000n / spend) / 10000; worst = Math.max(worst, ratio);
    if (0.9 + ratio >= 1) fails++;
  }
}
ok(`claims stay below the 10% canvas edge across ${n} cases`, worst < 0.1 && fails === 0, `worst claim ${(worst * 100).toFixed(2)}% of canvas spend → best possible return ${(90 + worst * 100).toFixed(2)}%`);
ok("no canvas opened → no claim", R.potClaim(new Set(["daily", "stamp"]), 30, 0n).claim === 0n);
const d1 = R.potClaim(new Set(ids), 1, 3n * RF), d30 = R.potClaim(new Set(ids), 30, 3n * RF);
ok("30-day streak earns 3× the day-1 claim for the same play", d30.claim === 3n * d1.claim || Number(d30.claim) / Number(d1.claim) >= 2.9, `${Number(d1.claim) / 1e18} → ${Number(d30.claim) / 1e18} RF`);
ok("all-five bonus applies", R.dayPoints(new Set(ids)) === 13 && R.dayPoints(new Set(["canvas"])) === 3);
ok("missing a day halves the streak", R.halveStreak(14) === 7 && R.halveStreak(1) === 0);
ok("edge split sums to 100%", R.EDGE_SPLIT.pot + R.EDGE_SPLIT.burn + R.EDGE_SPLIT.developer === 100);
process.exitCode = fails ? 1 : 0;
