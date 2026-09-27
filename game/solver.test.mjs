// Node check: every relic, daily Friend and a sweep of synthetic sprites is finishable by pure line logic once anchors are placed.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const out = await build({ entryPoints: [here + "solver-entry.ts"], bundle: true, write: false, format: "esm", platform: "node",
  alias: { "@rarefriends/friendsdk/sprites": here + "../../dist/generation-sprites.js" }, logLevel: "error" });
const mod = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const { N, RELICS, DAILY_FRIENDS, decode } = mod;
let fail = 0;
const check = (label, picture) => {
  const { anchors, stars } = N.difficulty(picture);
  const sol = N.pictureRows(picture).flat(), start = N.emptyGrid();
  anchors.forEach(i => { start[i] = sol[i] ? 1 : 2; });
  const r = N.lineSolve(picture, start);
  const matches = r.solved && r.grid.every((c, i) => (c === 1) === sol[i]);
  if (!matches) fail++;
  return `${matches ? "PASS" : "FAIL"} ${label}: ${stars}★, ${anchors.length} anchors`;
};
RELICS.forEach(r => console.log(check(`relic ${r.rarity}`, r.picture)));
DAILY_FRIENDS.forEach(f => console.log(check(`daily #${f.tokenId} ${f.family}`, decode(f.bitmap))));
// Random 16×16 blobs stress the anchor fallback far harder than real sprites.
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
let randomOk = 0;
for (let k = 0; k < 200; k++) {
  const pic = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => (rnd() < 0.5 ? "#" : ".")).join(""));
  if (check("random", pic).startsWith("PASS")) randomOk++;
}
console.log(`${randomOk === 200 ? "PASS" : "FAIL"} 200 random pictures solvable with anchors (${randomOk}/200)`);
if (randomOk !== 200) fail++;
process.exitCode = fail ? 1 : 0;
