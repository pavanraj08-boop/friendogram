import { testGame } from "@rarefriends/friendsdk/testing";

const width = Number(process.argv[2] ?? 960);
await testGame("./games/friendogram", {
  width, height: width < 640 ? Math.round(width * 4 / 3) + 80 : Math.round(width * 2 / 3) + 80, timeout: 90_000,
  screenshot: `./artifacts/friendogram-${width}.png`,
  check: async ({ page, game }) => {
    await game.getByRole("button", { name: "Start solving" }).click();
    const svg = game.locator(".fg-board svg");
    const box = await svg.boundingBox();
    const view = await svg.evaluate(node => { const v = node.viewBox.baseVal; return { w: v.width, h: v.height }; });
    const left = await svg.evaluate(node => Number(node.querySelector("g").getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/)[1]));
    const top = await svg.evaluate(node => Number(node.querySelector("g").getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/)[2]));
    const scale = Math.min(box.width / view.w, box.height / view.h);
    const ox = box.x + (box.width - view.w * scale) / 2, oy = box.y + (box.height - view.h * scale) / 2;
    const at = (cx, cy) => [ox + (left + cx * 10 + 5) * scale, oy + (top + cy * 10 + 5) * scale];
    // With Assist on, painting every cell solves the puzzle: wrong fills become marks.
    for (let row = 0; row < 16; row++) {
      const [x0, y] = at(0, row), [x1] = at(15, row);
      await page.mouse.move(x0, y); await page.mouse.down();
      for (let c = 1; c <= 15; c++) await page.mouse.move(x0 + (x1 - x0) * c / 15, y);
      await page.mouse.up();
    }
    await game.getByText(/Solved in/).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `./artifacts/friendogram-${width}-solved.png` });
    // Economy: buy, open, reveal, sell.
    await game.getByRole("button", { name: "Canvases" }).click();
    await game.getByRole("button", { name: /^Buy 1/ }).click();
    await page.getByRole("button", { name: /Confirm/ }).click();
    await game.getByRole("button", { name: /Open a canvas \(1\)/ }).waitFor();
    await game.getByRole("button", { name: /Open a canvas/ }).click();
    await page.waitForTimeout(800);
    const confirm = page.getByRole("button", { name: /Confirm/ });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await game.getByText(/sealed/).first().waitFor();
    await game.getByRole("button", { name: /Reveal now/ }).click();
    await game.getByRole("heading", { name: /Smudge|Pebble|Egg|Crown|Relic|Star/ }).waitFor();
    await page.screenshot({ path: `./artifacts/friendogram-${width}-reward.png` });
    await game.getByRole("button", { name: "Keep it" }).click();
    await game.getByRole("button", { name: "Settings" }).click();
    await game.getByRole("button", { name: "Sound off" }).click();
    await game.getByRole("button", { name: "Sound on" }).waitFor();
  },
});
console.log(`ok ${width}`);
