import { testGame } from "@rarefriends/friendsdk/testing";
import { RELIC_PICTURES } from "./relic-pictures.mjs";

const results = [];
const ok = (name, pass, info = "") => { results.push(`${pass ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); if (!pass) process.exitCode = 1; };

await testGame("./games/friendogram", {
  width: 960, height: 720, timeout: 150_000, screenshot: "./artifacts/iterate-final.png",
  check: async ({ page, game }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    ok("help explains the no-guess guarantee in steps", await game.getByText(/Never guess\./).isVisible());
    await game.getByRole("button", { name: "Start solving" }).click();
    const svg = game.locator(".fg-board svg");
    const geometry = async () => {
      const box = await svg.boundingBox();
      const info = await svg.evaluate(n => { const v = n.viewBox.baseVal; const m = n.querySelector("g").getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/); return { w: v.width, h: v.height, l: +m[1], t: +m[2] }; });
      const s = Math.min(box.width / info.w, box.height / info.h), ox = box.x + (box.width - info.w * s) / 2, oy = box.y + (box.height - info.h * s) / 2;
      return (x, y) => [ox + (info.l + x * 10 + 5) * s, oy + (info.t + y * 10 + 5) * s];
    };
    ok("difficulty stars and par shown", /[★☆]{4} · par \d+:\d\d/.test(await game.locator(".fg-card").innerText()));

    // Solve the portrait by painting everything (Assist on): celebration appears with stamps line.
    let at = await geometry();
    for (let row = 0; row < 16; row++) { const [x0, y] = at(0, row), [x1] = at(15, row); await page.mouse.move(x0, y); await page.mouse.down(); for (let c = 1; c <= 15; c++) await page.mouse.move(x0 + (x1 - x0) * c / 15, y); await page.mouse.up(); }
    const card = game.locator(".fg-celebrate-card");
    await card.waitFor({ timeout: 5000 });
    ok("celebration shows after a solve", /solved!/i.test(await card.innerText()), (await card.innerText()).replace(/\s+/g, " ").slice(0, 120));
    ok("celebration lists stamps (none for a sloppy solve)", /No stamps this time/.test(await card.innerText()));
    const walkClass = await game.locator(".fg-walk").getAttribute("class"), reduce = await game.locator(".fg-game").evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    ok("walking Friend shown (animated unless reduced motion)", reduce ? walkClass === "fg-walk" : walkClass === "fg-walk fg-walking", `${walkClass}, reduce=${reduce}`);
    await page.screenshot({ path: "./artifacts/iterate-celebrate.png" });
    const before = await game.locator(".fg-card strong").innerText();
    await game.getByRole("button", { name: "Next puzzle" }).click();
    const after = await game.locator(".fg-card strong").innerText();
    ok("Next puzzle moves to another unsolved puzzle", before !== after, `${before} → ${after}`);

    // Force the Hollow Relic (4★, needs anchors). Turn Assist off, solve by exact picture.
    await page.evaluate(() => { const random = crypto.getRandomValues.bind(crypto); crypto.getRandomValues = a => a instanceof Uint32Array && a.length === 1 ? (a[0] = 9300, a) : random(a); });
    await game.getByRole("button", { name: "Settings" }).click();
    await game.getByLabel(/Assist/).uncheck();
    await game.getByRole("button", { name: "Close Settings" }).click();
    await game.getByRole("button", { name: "Canvases" }).click();
    await game.getByRole("button", { name: /^Buy 1/ }).click();
    await page.getByRole("button", { name: /Confirm/ }).click();
    await game.getByRole("button", { name: /Open a canvas \(1\)/ }).waitFor();
    await game.getByRole("button", { name: /Open a canvas/ }).click();
    await page.waitForTimeout(500);
    const confirm = page.getByRole("button", { name: /Confirm/ }); if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await game.getByRole("button", { name: /Reveal now/ }).waitFor();
    const cardText = await game.locator(".fg-card").innerText();
    ok("hard relic shows 4 stars and its anchors", /★★★★ · par 3:45 · 2 anchors/.test(cardText), cardText.split("\n").find(l => /par/.test(l)));
    const anchors = await svg.evaluate(n => n.querySelectorAll("circle.fg-anchor").length);
    ok("anchor cells drawn on the board", anchors === 2, `${anchors}`);
    at = await geometry();
    // Clicking an anchor must not change it.
    const anchorIdx = await svg.evaluate(n => [...n.querySelectorAll("rect.fg-cell")].findIndex(r => r.classList.contains("fg-given")));
    await page.mouse.click(...at(anchorIdx % 16, Math.floor(anchorIdx / 16)));
    ok("anchors are locked", await svg.evaluate((n, i) => n.querySelectorAll("rect.fg-cell")[i].classList.contains("fg-on"), anchorIdx));
    // Clear keeps anchors.
    await game.getByRole("button", { name: "Clear" }).click();
    ok("Clear keeps anchors", await svg.evaluate(n => n.querySelectorAll("circle.fg-anchor").length) === 2);
    const pic = RELIC_PICTURES[4];
    const given = await svg.evaluate(n => [...n.querySelectorAll("rect.fg-cell")].map(r => r.classList.contains("fg-given")));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (pic[y][x] === "#" && !given[y * 16 + x]) await page.mouse.click(...at(x, y));
    await game.getByRole("heading", { name: "Hollow Relic" }).waitFor({ timeout: 5000 });
    const reward = await game.locator(".fg-reward").innerText();
    ok("pure-logic, perfect solve earns stamps on the relic", /◆ Perfect/.test(reward) && /∴ Pure logic/.test(reward), reward.match(/[◆∴»][^\n]*/)?.[0]);
    await game.getByRole("button", { name: /^Sell ·/ }).click();
    await page.getByRole("button", { name: /Confirm/ }).click();
    await game.getByRole("heading", { name: /^Relics/ }).waitFor();

    // Ledger: 1 canvas bought (1 RF), 0.5 burned live, 3.5 RF redeemed, stamps listed.
    const ledger = (await game.locator(".fg-ledger").innerText()).replace(/\s+/g, " ");
    ok("ledger counts purchase, 50% burn, redemption and total", /Canvases bought 1 · 1 RF/.test(ledger) && /burned in live play \(50%\) 0\.5 RF/.test(ledger) && /Relics sold back 3\.5 RF/.test(ledger) && /RF removed from supply 🔥 0\.5 RF/.test(ledger), ledger.slice(0, 220));
    ok("stamp totals shown in gallery", /◆ Perfect[^]*1 earned/.test(await game.locator(".fg-list").nth(2).innerText()) || /1 earned/.test(await game.locator("body").innerText()));
    await page.screenshot({ path: "./artifacts/iterate-gallery.png" });
    await game.getByRole("button", { name: "Close Gallery" }).click();
  },
}).finally(() => console.log(results.join("\n")));
