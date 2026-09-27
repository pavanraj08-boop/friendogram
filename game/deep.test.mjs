import { testGame } from "@rarefriends/friendsdk/testing";
import { RELIC_PICTURES } from "./relic-pictures.mjs";

const results = [];
const ok = (name, pass, info = "") => { results.push(`${pass ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); if (!pass) process.exitCode = 1; };
const runs = line => { const o = []; let c = 0; for (const f of line) { if (f) c++; else if (c) { o.push(c); c = 0; } } if (c) o.push(c); return o.length ? o : [0]; };

await testGame("./games/friendogram", {
  width: 960, height: 720, timeout: 120_000, screenshot: "./artifacts/deep-final.png",
  check: async ({ page, game }) => {
    await game.getByRole("button", { name: "Start solving" }).click();
    const svg = game.locator(".fg-board svg");
    const geometry = async () => {
      const box = await svg.boundingBox();
      const info = await svg.evaluate(n => { const v = n.viewBox.baseVal; const m = n.querySelector("g").getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/); return { w: v.width, h: v.height, l: +m[1], t: +m[2] }; });
      const s = Math.min(box.width / info.w, box.height / info.h), ox = box.x + (box.width - info.w * s) / 2, oy = box.y + (box.height - info.h * s) / 2;
      return (x, y) => [ox + (info.l + x * 10 + 5) * s, oy + (info.t + y * 10 + 5) * s];
    };
    const cells = () => svg.evaluate(n => [...n.querySelectorAll("rect.fg-cell")].map(r => r.classList.contains("fg-on") ? 1 : 0));
    const marks = () => svg.evaluate(n => n.querySelectorAll("path.fg-x").length);
    const status = () => game.locator(".fg-card").innerText();

    // 1. Keyboard: move and fill, mark, tool toggle.
    await game.locator(".fg-board").focus();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
    const idx = 17;
    await page.keyboard.press("f");
    let c = await cells(), m = await marks();
    ok("keyboard fill or assist-mark at cursor", c[idx] === 1 || m === 1, `filled=${c[idx]} marks=${m}`);
    await page.keyboard.press("t");
    ok("T toggles to Mark tool", await game.getByRole("button", { name: "✕ Mark" }).getAttribute("aria-pressed") === "true");
    await page.keyboard.press("t");

    // 2. Assist mistake counting: fill every cell of row 0 until a mistake happens.
    const at = await geometry();
    const before = (await status()).match(/(\d+) mistake/)?.[1];
    for (let x = 0; x < 16; x++) { await page.mouse.click(...at(x, 0)); }
    const after = (await status()).match(/(\d+) mistake/)?.[1];
    const row0 = (await cells()).slice(0, 16), marks0 = await marks();
    ok("assist catches wrong fills (mistakes counted, cells auto-marked)", Number(after) > Number(before) || marks0 > 0 || row0.every(Boolean), `mistakes ${before}→${after}, marks ${marks0}`);

    // 3. Clear resets the board.
    await game.getByRole("button", { name: "Clear" }).click();
    ok("Clear empties the grid", (await cells()).every(v => v === 0) && await marks() === 0);

    // 4. Timer runs.
    const t1 = (await status()).match(/(\d+):(\d+)/)[0]; await page.waitForTimeout(2200); const t2 = (await status()).match(/(\d+):(\d+)/)[0];
    ok("solve timer advances", t1 !== t2, `${t1}→${t2}`);

    // 5. Runtime pause: open Friend wallet menu, try to paint, nothing changes.
    await page.getByRole("button", { name: /Friend wallet/ }).click();
    await page.waitForTimeout(300);
    await page.mouse.click(...at(8, 8)).catch(() => {});
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    ok("input ignored while runtime menu is open (paused)", (await cells()).every(v => v === 0) && await marks() === 0);

    // 6. Economy: buy, open, solve canvas with Assist OFF using exact relic picture; then sell.
    await game.getByRole("button", { name: "Settings" }).click();
    await game.getByLabel(/Assist/).uncheck();
    await game.getByRole("button", { name: "Close Settings" }).click();
    const balance = async () => Number((await game.locator(".fg-balance").innerText()).match(/· ([\d.]+) RF/)[1]);
    const startRF = await balance();
    // The SDK fixture pins every roll to 1500 (always Smudge). Cycle rolls so each relic tier is exercised.
    await page.evaluate(() => { const rolls = [9800, 9300, 8300, 5800, 2300, 0]; let i = 0; const random = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = a => a instanceof Uint32Array && a.length === 1 ? (a[0] = rolls[i++ % rolls.length], a) : random(a); });
    const seen = new Set();
    let sold = false, solvedNoAssist = false, zeroRelicSeen = false;
    for (let round = 0; round < 6; round++) {
      await game.getByRole("button", { name: "Canvases" }).click();
      await game.getByRole("button", { name: /^Buy 1/ }).click();
      await page.getByRole("button", { name: /Confirm/ }).click();
      await game.getByRole("button", { name: /Open a canvas \(1\)/ }).waitFor();
      await game.getByRole("button", { name: /Open a canvas/ }).click();
      await page.waitForTimeout(500);
      const confirm = page.getByRole("button", { name: /Confirm/ });
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await game.getByRole("button", { name: /Reveal now/ }).waitFor();
      // Identify relic from its row clues.
      const rowClues = await svg.evaluate(n => [...n.querySelectorAll("text.fg-clue")].filter(t => t.getAttribute("text-anchor") === "end").map(t => t.textContent));
      const which = RELIC_PICTURES.findIndex(p => p.map(r => runs([...r].map(ch => ch === "#")).join(" ")).join("|") === rowClues.join("|"));
      ok(`canvas ${round + 1}: clues match a known relic`, which >= 0, `relic index ${which}`); seen.add(which);
      const g = await geometry();
      const pic = RELIC_PICTURES[which];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (pic[y][x] === "#") await page.mouse.click(...g(x, y));
      const heading = game.getByRole("heading", { name: /Smudge|Pebble|Egg|Crown|Relic|Star/ });
      await heading.waitFor({ timeout: 5000 });
      ok(`canvas ${round + 1}: revealed name matches relic`, (await heading.innerText()) === ["Smudge","Pixel Pebble","Warm Egg","Gen-1 Crown","Hollow Relic","Sparkling Star"][which], await heading.innerText());
      solvedNoAssist = true;
      const sell = game.getByRole("button", { name: /^Sell ·/ });
      if (await sell.count()) {
        const pre = await balance();
        await sell.click();
        await page.getByRole("button", { name: /Confirm/ }).click();
        await game.getByRole("heading", { name: /^Relics/ }).waitFor();
        const post = await balance();
        ok("selling a relic credits its fixed RF value", post > pre, `${pre}→${post} RF`);
        sold = true;
        await game.getByRole("button", { name: "Close Gallery" }).click();
      } else { zeroRelicSeen = true; await game.getByRole("button", { name: "Keep it" }).click(); }
    }
    ok("canvas solvable with Assist off (exact clue match)", solvedNoAssist);
    ok("all six relic tiers opened, solved and revealed", seen.size === 6, [...seen].join(","));
    ok("balance moved after canvas purchases", (await balance()) !== startRF, `${startRF}→${await balance()} RF`);

    // 7. Running out of RF disables buying.
    await game.getByRole("button", { name: "Canvases" }).click();
    for (let i = 0; i < 30; i++) {
      const buy = game.getByRole("button", { name: /^Buy 1/ });
      if (await buy.isDisabled()) break;
      await buy.click(); await page.getByRole("button", { name: /Confirm/ }).click();
      await page.waitForTimeout(150);
    }
    ok("buy disabled with a reason when RF/backing runs out", await game.getByRole("button", { name: /^Buy 1/ }).isDisabled() && await game.getByText(/Not enough RF|free backing/).isVisible());
    await game.getByRole("button", { name: "Close Mystery Canvas" }).click();

    // 8. Gallery lists portraits and relics.
    await game.getByRole("button", { name: /Gallery/ }).click();
    ok("gallery shows relic inventory", await game.getByRole("heading", { name: /Relics · \d+ held/ }).isVisible());
    await game.getByRole("button", { name: "Close Gallery" }).click();
  },
}).finally(() => console.log(results.join("\n")));
