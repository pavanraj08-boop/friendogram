import { testGame } from "@rarefriends/friendsdk/testing";

const results = [];
const ok = (name, pass, info = "") => { results.push(`${pass ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); if (!pass) process.exitCode = 1; };

await testGame("./games/friendogram", {
  width: 960, height: 720, timeout: 120_000, screenshot: "./artifacts/features.png",
  check: async ({ page, game }) => {
    await game.getByRole("button", { name: "Start solving" }).click();
    const svg = game.locator(".fg-board svg");
    const cells = () => svg.evaluate(n => [...n.querySelectorAll("rect.fg-cell")].map(r => r.classList.contains("fg-on") ? 1 : 0));
    const marks = () => svg.evaluate(n => n.querySelectorAll("path.fg-x").length);
    const balance = async () => Number((await game.locator(".fg-balance").innerText()).match(/· ([\d.]+) RF/)[1]);
    const burned = async () => Number((await game.locator(".fg-burn").innerText()).match(/([\d.]+) RF/)[1]);

    // Family perk shown for the sample Friend (Hoverer → Float).
    const perkText = await game.locator(".fg-perk").innerText();
    ok("family perk shown for the selected Friend", /Hoverer perk · Float/.test(perkText), perkText.split("\n")[0]);
    ok("lens counter shows the free Float lens", /1 free/.test(await game.locator(".fg-lens-note").innerText()));

    // Lens 1: free. Cursor starts at row 0.
    const startRF = await balance();
    await game.getByRole("button", { name: "🔍 Row" }).click();
    const row0 = (await cells()).slice(0, 16), m1 = await marks();
    ok("free lens solves row 0 (all cells decided)", row0.filter(Boolean).length + m1 >= 16, `filled ${row0.filter(Boolean).length}, marked ${m1}`);
    ok("free lens burns nothing", (await burned()) === 0 && (await balance()) === startRF);

    // Lens 2: paid, 0.1 RF burned (move cursor to row 5 with keyboard, then press L).
    await game.locator(".fg-board").focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("l");
    ok("paid lens burns 0.1 RF", (await burned()) === 0.1, `${await burned()} RF burned`);
    ok("spendable balance drops by the burn", Math.abs((await balance()) - (startRF - 0.1)) < 1e-9, `${startRF} → ${await balance()}`);
    // K = column lens.
    await page.keyboard.press("k");
    ok("column lens (K) burns another 0.1 RF", Math.abs((await burned()) - 0.2) < 1e-9);
    // Same line twice is refused without charge.
    await page.keyboard.press("l");
    ok("re-lensing a solved line costs nothing", Math.abs((await burned()) - 0.2) < 1e-9);

    // Friend of the Day: present, solvable, share card in gallery.
    const options = await game.locator(".fg-select select option").allInnerTexts();
    const daily = options.find(o => o.includes("Friend of the Day"));
    ok("Friend of the Day listed", Boolean(daily), daily);
    await game.locator(".fg-select select").selectOption({ label: daily });
    ok("daily Friend hidden until solved", /who is it\?/.test(await game.locator(".fg-card").innerText()));
    const box = await svg.boundingBox();
    const info = await svg.evaluate(n => { const v = n.viewBox.baseVal; const m = n.querySelector("g").getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/); return { w: v.width, h: v.height, l: +m[1], t: +m[2] }; });
    const s = Math.min(box.width / info.w, box.height / info.h), ox = box.x + (box.width - info.w * s) / 2, oy = box.y + (box.height - info.h * s) / 2;
    const at = (x, y) => [ox + (info.l + x * 10 + 5) * s, oy + (info.t + y * 10 + 5) * s];
    for (let y = 0; y < 16; y++) { await page.mouse.move(...at(0, y)); await page.mouse.down(); for (let x = 1; x < 16; x++) await page.mouse.move(...at(x, y)); await page.mouse.up(); }
    await game.getByText(/Friend of the Day solved!/).waitFor({ timeout: 5000 });
    const card = await game.locator(".fg-card").innerText();
    ok("daily reveals the Friend's family", /(Skeleton|Mask|Family|Cellular|Asymmetry|Hoverer|Colossus|Sparkling|Hollow) family/.test(card), card.split("\n")[1]);
    await game.getByRole("button", { name: /Gallery/ }).click();
    const share = await game.locator(".fg-share").innerText();
    ok("gallery shows daily result card", /Friendogram ☀ #\d+/.test(share) && /solved in/.test(share), share.replace(/\n/g, " | "));
    const ledgerText = await game.locator(".fg-ledger").innerText();
    ok("gallery ledger shows lens burn and total removed", /Lens burn[^\n]*\t?\s*0\.2 RF/.test(ledgerText) && /RF removed from supply\s*🔥 [\d.]+ RF/.test(ledgerText), ledgerText.replace(/\s+/g, " ").slice(0, 160));
    ok("gallery lists all 9 family perks", (await game.locator(".fg-list li").filter({ hasText: /Bare Bones|Second Face|Kinship|Mitosis|Tilt|Float|Titan|Shine|Void Sight/ }).count()) === 9);
    await page.screenshot({ path: "./artifacts/features-gallery.png" });
    await game.getByRole("button", { name: "Close Gallery" }).click();

    // Burn limits purchases: buy canvases until spendable RF (balance − burned) blocks buying.
    await game.getByRole("button", { name: "Canvases" }).click();
    for (let i = 0; i < 25; i++) {
      const buy = game.getByRole("button", { name: /^Buy 1/ });
      if (await buy.isDisabled()) break;
      await buy.click(); await page.getByRole("button", { name: /Confirm/ }).click(); await page.waitForTimeout(120);
    }
    ok("purchases stop at the RF/backing limit", await game.getByRole("button", { name: /^Buy 1/ }).isDisabled(), `spendable ${await balance()} RF`);
  },
}).finally(() => console.log(results.join("\n")));
