import { testGame } from "@rarefriends/friendsdk/testing";

const results = [];
const ok = (name, pass, info = "") => { results.push(`${pass ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); if (!pass) process.exitCode = 1; };

await testGame("./games/friendogram", {
  width: 960, height: 720, timeout: 150_000, screenshot: "./artifacts/daily-final.png",
  check: async ({ page, game }) => {
    await game.getByRole("button", { name: "Start solving" }).click();
    const header = () => game.locator(".fg-burn").innerText();
    ok("streak and Ink shown in header", /streak 0 · ×1 · 0 Ink/.test(await header()), await header());
    const openDaily = async () => { await game.getByRole("button", { name: /☀ Daily \d\/5/ }).click(); await game.locator(".fg-streak").waitFor(); };
    const closeDaily = () => game.getByRole("button", { name: /Close ☀ Daily/ }).click();

    await openDaily();
    ok("five tasks listed", await game.locator(".fg-tasks li").count() === 6);
    ok("no claim before opening a canvas", /open a canvas to qualify/.test(await game.locator(".fg-ledger").innerText()));
    await closeDaily();

    // Task: lens (free Hoverer lens).
    await game.getByRole("button", { name: "🔍 Row" }).click();
    ok("lens completes a task and pays Ink", /streak 1 · ×1 · 10 Ink/.test(await header()), await header());

    // Task: open a canvas (+ solve it via painting everything with Assist on → solve_canvas, maybe stamps none).
    await game.getByRole("button", { name: "Canvases" }).click();
    await game.getByRole("button", { name: /^Buy 1/ }).click();
    await page.getByRole("button", { name: /Confirm/ }).click();
    await game.getByRole("button", { name: /Open a canvas \(1\)/ }).waitFor();
    await game.getByRole("button", { name: /Open a canvas/ }).click();
    await page.waitForTimeout(500);
    const confirm = page.getByRole("button", { name: /Confirm/ }); if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await game.getByRole("button", { name: /Reveal now/ }).waitFor();
    ok("opening a canvas completes the canvas task", /☀ Daily 2\/5/.test(await game.locator(".fg-daily-btn").innerText()));

    await openDaily();
    const ledger = (await game.locator(".fg-ledger").innerText()).replace(/\s+/g, " ");
    ok("claim eligible: 4 pts × ×1 = 0.02552 RF, under the 3% cap", /4 × 1 = 4\.0/.test(ledger) && /cap \(3% of 1 RF opened\) 0\.03 RF/.test(ledger) && /Projected pot claim ☀ 0\.02552 RF/.test(ledger), ledger.slice(0, 200));
    // Next day: streak 2, claim settles, new daily puzzle.
    await game.getByRole("button", { name: /Preview: next day/ }).click();
    await game.locator(".fg-streak").waitFor();
    const st = await game.locator(".fg-streak").innerText();
    ok("next day: streak counts on (day 1 → 2 once you play)", /Streak: day 1/.test(st), st.split("\n")[0]);
    ok("tasks reset for the new day", /☀ Daily 0\/5/.test(await game.locator(".fg-daily-btn").innerText()));
    ok("previous day logged with its claim", /4 pts → 0\.02552 RF/.test(await game.locator(".fg-list").last().innerText()));
    ok("pot earned carried over", /Pot earned so far \(simulated\) 0\.02552 RF/.test((await game.locator(".fg-ledger").innerText()).replace(/\s+/g, " ")));
    await closeDaily();
    const options = await game.locator("select option").allInnerTexts();
    ok("a new Friend of the Day was added", options.filter(o => /Friend of the Day/.test(o)).length === 2, options.filter(o => /Friend of the Day/.test(o)).join(" | "));

    // Play something today, then skip a day: streak halves.
    await game.getByRole("button", { name: "🔍 Row" }).click();
    await openDaily();
    ok("streak day 2 while playing today", /Streak: day 2/.test(await game.locator(".fg-streak").innerText()));
    await game.getByRole("button", { name: /Preview: skip a day/ }).click();
    ok("skipping a day halves the streak (2 → 1)", /Streak: day 1\b/.test(await game.locator(".fg-streak").innerText()), (await game.locator(".fg-streak").innerText()).split("\n")[0]);

    // Ink trade needs 50 Ink.
    const trade = game.getByRole("button", { name: /Trade 50 Ink/ });
    ok("50 Ink earned from 3 tasks unlocks a lens trade", await trade.isEnabled() && /\(50 Ink\)/.test(await trade.innerText()));
    await trade.click();
    ok("trade spends Ink and banks a lens", /\(0 Ink\)/.test(await trade.innerText()) && await trade.isDisabled());
    await page.screenshot({ path: "./artifacts/daily-menu.png" });
    await closeDaily();

    // Shop text reflects the real contract.
    await game.getByRole("button", { name: "Canvases" }).click();
    ok("shop explains the edge split, not a 50% burn", /edge feeds the ☀ Daily Pot \(60%\)/.test(await game.locator(".fg-note").first().innerText()));
  },
}).finally(() => console.log(results.join("\n")));
