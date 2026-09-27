"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { expectedReward, maximumPrize, RF as RF_UNIT, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, spriteFrame, type GenerationSprites, type SpriteFacing } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundKit, type FriendSoundCue } from "@rarefriends/friendsdk/sounds";
import { SIZE, clues, difficulty, emptyGrid, isSolved, lineSatisfied, pictureRows, type Cell, type Picture } from "./nonogram";
import { RELICS } from "./relics";
import { perkFor, PERKS, type Perk } from "./perks";
import { dailyFor } from "./daily";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

type Puzzle = Readonly<{
  id: string; kind: "portrait" | "canvas" | "daily"; title: string; picture: Picture; tokenId?: bigint; family?: string;
  facing?: SpriteFacing; walking?: boolean; playId?: bigint; outcomeId?: number;
}>;
type Progress = { grid: Cell[]; initial: Cell[]; given: readonly number[]; stars: number; mistakes: number; seconds: number; solved: boolean; revealed: boolean; lenses: number; freeLeft: number; forgiven: number; assistUsed: boolean; stamps: readonly string[] };
type Menu = "help" | "shop" | "gallery" | "settings" | "reward" | null;
type Tool = "fill" | "mark";

const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const PORTRAIT_POSES: readonly { facing: SpriteFacing; walking: boolean; frame: number; label: string }[] = [
  { facing: "down", walking: false, frame: 0, label: "front" },
  { facing: "right", walking: false, frame: 0, label: "right profile" },
  { facing: "left", walking: false, frame: 0, label: "left profile" },
  { facing: "up", walking: false, frame: 0, label: "back" },
  { facing: "right", walking: true, frame: 2, label: "mid-stride" },
];
const FAMILY_SHARE: Record<string, string> = {
  Skeleton: "18%", Mask: "18%", Family: "18%", Cellular: "18%", Asymmetry: "18%",
  Hoverer: "2.5%", Colossus: "2.5%", Sparkling: "2.5%", Hollow: "2.5%",
};
const LENS_PRICE = RF_UNIT / 10n; // 0.1 RF per lens, 100% burned (simulated)
const DAILY = dailyFor();

const STAMPS: Record<string, { icon: string; text: string }> = {
  Perfect: { icon: "◆", text: "No mistakes and no lenses" },
  "Pure logic": { icon: "∴", text: "Solved with Assist off the whole time" },
  Swift: { icon: "»", text: "Beat par time with 2 mistakes or fewer" },
};
const parSeconds = (stars: number) => 45 + stars * 45;
const starText = (n: number) => "★".repeat(n) + "☆".repeat(4 - n);
const difficultyCache = new Map<string, ReturnType<typeof difficulty>>();
const difficultyOf = (picture: Picture) => {
  const key = picture.join("/");
  let value = difficultyCache.get(key);
  if (!value) { value = difficulty(picture); difficultyCache.set(key, value); }
  return value;
};

/**
 * A fresh board: the family perk's head start, then "anchor" cells that guarantee the puzzle
 * can be finished by pure logic (no guessing), whatever the Friend's sprite looks like.
 */
function newProgress(picture: Picture, perk: Perk): Progress {
  const solution = pictureRows(picture), grid = emptyGrid(), rated = difficultyOf(picture);
  const put = (x: number, y: number) => { grid[y * SIZE + x] = solution[y][x] ? 1 : 2; };
  for (const reveal of perk.reveal) {
    if (reveal === "row0") for (let x = 0; x < SIZE; x++) put(x, 0);
    if (reveal === "col0") for (let y = 0; y < SIZE; y++) put(0, y);
    if (reveal === "empty-lines") for (let i = 0; i < SIZE; i++) {
      if (!solution[i].some(Boolean)) for (let x = 0; x < SIZE; x++) put(x, i);
      if (!solution.some(row => row[i])) for (let y = 0; y < SIZE; y++) put(i, y);
    }
  }
  for (const index of rated.anchors) grid[index] = solution.flat()[index] ? 1 : 2;
  return { grid, initial: grid.slice(), given: rated.anchors, stars: rated.stars, mistakes: 0, seconds: 0, solved: false, revealed: false,
    lenses: 0, freeLeft: perk.freeLenses, forgiven: 0, assistUsed: false, stamps: [] };
}

const revealCue = (outcomeId: number): FriendSoundCue => outcomeId >= 5 ? "reveal-legendary" : outcomeId >= 4 ? "reveal-rare" : "reveal-common";

function portraitPuzzles(sprites: GenerationSprites): Puzzle[] {
  const seen = new Set<bigint>(), out: Puzzle[] = [];
  for (const pose of PORTRAIT_POSES) {
    const { frame, resolvedFacing } = spriteFrame(sprites, pose.facing, pose.walking, pose.frame);
    if (frame.bitmap === 0n || seen.has(frame.bitmap)) continue;
    seen.add(frame.bitmap);
    out.push({ id: `portrait-${out.length}`, kind: "portrait", title: `Portrait · ${pose.label}`, picture: frame.rows, facing: resolvedFacing, walking: pose.walking });
  }
  return out;
}

/** Friendogram: picross puzzles drawn from the selected Friend's own on-chain sprite. */
export default function Friendogram({ friendId, client, paused }: GameComponentProps) {
  const definition = client.definition;
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loadError, setLoadError] = useState(""), [revision, setRevision] = useState(0);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [activeId, setActiveId] = useState("");
  const [tool, setTool] = useState<Tool>("fill"), [assist, setAssist] = useState(true);
  const [cursor, setCursor] = useState(0), [flash, setFlash] = useState(-1);
  const [menu, setMenu] = useState<Menu>("help"), [rewardId, setRewardId] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [muted, setMuted] = useState(true), [reducedMotion, setReducedMotion] = useState(false);
  const [burned, setBurned] = useState(0n), [bank, setBank] = useState(0);
  const [ledger, setLedger] = useState({ spent: 0n, redeemed: 0n, bought: 0n });
  const [celebrate, setCelebrate] = useState("");
  const perk = perkFor(sprites?.familyName ?? "");
  const perkRef = useRef(perk); perkRef.current = perk;
  const slowTick = useRef(false);
  const sound = useRef<FriendSoundKit | null>(null), locked = useRef(false), epoch = useRef(0);
  const drag = useRef<{ value: Cell; pointer: number } | null>(null);
  const preview = useRef<HTMLCanvasElement>(null), board = useRef<SVGSVGElement>(null);

  // Session setup: fresh state per Friend/client; artwork and ledger load together.
  useEffect(() => {
    const version = ++epoch.current;
    sound.current = createFriendSoundKit({ muted: true });
    setSprites(null); setSnapshot(null); setLoadError(""); setPuzzles([]); setProgress({}); setActiveId("");
    setMenu("help"); setBusy(false); setError(""); setMessage(""); setMuted(true); setBurned(0n); setBank(0); setLedger({ spent: 0n, redeemed: 0n, bought: 0n }); setCelebrate(""); locked.current = false;
    void Promise.all([createFriendReader().read(friendId), client.read()]).then(([art, value]) => {
      if (version !== epoch.current) return;
      if (value.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      const list = portraitPuzzles(art);
      setSprites(art); setSnapshot(value); setActiveId(list[0]?.id ?? "");
      const familyPerk = perkFor(art.familyName);
      // Friend of the Day: embedded canonical artwork, identical for every player today.
      const daily: Puzzle = { id: "daily", kind: "daily", title: `Friend of the Day #${DAILY.number}`, picture: DAILY.picture, tokenId: DAILY.tokenId, family: DAILY.family };
      setPuzzles([...list, daily]);
      setProgress(Object.fromEntries([...list, daily].map(p => [p.id, newProgress(p.picture, familyPerk)])));
    }).catch(cause => { if (version === epoch.current) setLoadError(cause instanceof Error ? cause.message : "Could not load your Friend."); });
    return () => { epoch.current++; sound.current?.dispose(); sound.current = null; };
  }, [client, friendId, revision]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches); update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const active = puzzles.find(p => p.id === activeId) ?? null;
  const state = active ? progress[active.id] : undefined;
  const clue = useMemo(() => active ? clues(active.picture) : null, [active]);
  const solution = useMemo(() => active ? pictureRows(active.picture).flat() : [], [active]);
  const blocked = paused || menu !== null || busy;

  // Solve timer and preview animation clock; both stop while paused, in menus or hidden.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden || paused) return;
      if (menu !== null || !active) return;
      if (perkRef.current.slowTimer) { slowTick.current = !slowTick.current; if (slowTick.current) return; }
      setProgress(all => {
        const current = all[active.id];
        return current && !current.solved ? { ...all, [active.id]: { ...current, seconds: current.seconds + 1 } } : all;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused, menu, active]);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reducedMotion) { setFrame(0); return; }
    const timer = window.setInterval(() => { if (!document.hidden && !paused) setFrame(f => (f + 1) % 8); }, 140);
    return () => window.clearInterval(timer);
  }, [reducedMotion, paused]);

  const progressRef = useRef(progress); progressRef.current = progress;
  const solve = useCallback((puzzle: Puzzle, revealed: boolean) => {
    if (!revealed && perkRef.current.bankOnSolve) setBank(b => b + perkRef.current.bankOnSolve);
    const done = progressRef.current[puzzle.id];
    const stamps = revealed || !done ? [] : [
      done.mistakes === 0 && done.lenses === 0 && "Perfect",
      !done.assistUsed && "Pure logic",
      done.seconds <= parSeconds(done.stars) && done.mistakes <= 2 && "Swift",
    ].filter((v): v is string => Boolean(v));
    setProgress(all => ({ ...all, [puzzle.id]: { ...all[puzzle.id], solved: true, revealed, stamps, grid: pictureRows(puzzle.picture).flat().map(on => (on ? 1 : 2) as Cell) } }));
    if (puzzle.kind !== "canvas") setCelebrate(puzzle.id);
    if (puzzle.kind === "canvas" && puzzle.outcomeId) {
      sound.current?.play(revealCue(puzzle.outcomeId)); setMessage(""); setError(""); setRewardId(puzzle.id); setMenu("reward");
    } else if (puzzle.kind === "daily") { sound.current?.play("reveal-legendary"); setMessage(`Friend of the Day solved! #${puzzle.tokenId} is a ${puzzle.family}. Result card in Gallery.`); }
    else { sound.current?.play("reveal-rare"); setMessage(`Solved! That's ${sprites ? `your ${sprites.familyName}` : "your Friend"}.`); }
  }, [sprites]);

  const setCell = useCallback((index: number, value: Cell) => {
    const state = active ? progressRef.current[active.id] : undefined;
    if (!active || !state || state.solved || blocked || state.given.includes(index)) return;
    const current = state.grid[index];
    if (current === value) return;
    let next: Cell = value, mistake = false;
    if (assist && value === 1 && !solution[index]) { next = 2; mistake = true; }
    const grid = state.grid.slice(); grid[index] = next;
    const forgiven = mistake && state.forgiven < perkRef.current.forgive;
    const updated = { ...state, grid, assistUsed: state.assistUsed || assist, mistakes: state.mistakes + (mistake && !forgiven ? 1 : 0), forgiven: state.forgiven + (forgiven ? 1 : 0) };
    progressRef.current = { ...progressRef.current, [active.id]: updated };
    setProgress(all => ({ ...all, [active.id]: { ...updated, seconds: all[active.id]?.seconds ?? updated.seconds } }));
    if (mistake) { setFlash(index); window.setTimeout(() => setFlash(f => (f === index ? -1 : f)), 450); sound.current?.play("impact"); }
    else if (value === 1) sound.current?.play("select");
    if (!mistake && isSolved(grid, active.picture)) solve(active, false);
  }, [active, blocked, assist, solution, solve]);

  /** Lens: reveal the cursor's row or column. Free lenses are used first, then banked ones, then RF (burned). */
  const lensCost = (LENS_PRICE * BigInt(perk.lensCostPct)) / 100n;
  const applyLens = (axis: "row" | "col") => {
    const state = active ? progressRef.current[active.id] : undefined;
    if (!active || !state || state.solved || paused || busy || !snapshot) return;
    const x = cursor % SIZE, y = Math.floor(cursor / SIZE), rows = pictureRows(active.picture);
    const cells: [number, number][] = Array.from({ length: SIZE }, (_, i) => (axis === "row" ? [i, y] : [x, i]));
    if (cells.every(([cx, cy]) => state.grid[cy * SIZE + cx] === (rows[cy][cx] ? 1 : 2))) { setMessage(`That ${axis === "row" ? "row" : "column"} is already solved. Move the cursor to another line.`); return; }
    let paid: "free" | "bank" | "rf" = "free";
    if (state.freeLeft > 0) paid = "free";
    else if (bank > 0) paid = "bank";
    else if (snapshot.mode === "chain") { setError("Paid lenses are preview-only until a burn integration exists. Free and banked lenses still work."); return; }
    else if (snapshot.rfBalance - burned >= lensCost) paid = "rf";
    else { setError("Not enough RF for a lens."); return; }
    const grid = state.grid.slice();
    for (const [cx, cy] of cells) grid[cy * SIZE + cx] = rows[cy][cx] ? 1 : 2;
    const updated = { ...state, grid, lenses: state.lenses + 1, freeLeft: state.freeLeft - (paid === "free" ? 1 : 0) };
    progressRef.current = { ...progressRef.current, [active.id]: updated };
    setProgress(all => ({ ...all, [active.id]: { ...updated, seconds: all[active.id]?.seconds ?? updated.seconds } }));
    if (paid === "bank") setBank(b => b - 1);
    if (paid === "rf") setBurned(b => b + lensCost);
    setError(""); setMessage(paid === "rf" ? `Lens used: ${rf(lensCost)} burned (simulated).` : paid === "bank" ? "Lens used from your Kinship bank." : `Free ${perk.name} lens used.`);
    sound.current?.play("action-ready");
    if (isSolved(grid, active.picture)) solve(active, false);
  };

  // Pointer painting: the first cell decides fill/erase or mark/unmark for the whole drag.
  const cellAt = (event: PointerEvent<SVGSVGElement>) => {
    const svg = board.current, matrix = svg?.getScreenCTM();
    if (!svg || !matrix || !clue) return -1;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const x = Math.floor(point.x / 10) - leftCols, y = Math.floor(point.y / 10) - topRows;
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? y * SIZE + x : -1;
  };
  const leftCols = clue ? Math.max(1, ...clue.rows.map(r => r.length)) : 1;
  const topRows = clue ? Math.max(1, ...clue.cols.map(c => c.length)) : 1;
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!state || blocked) return;
    const index = cellAt(event); if (index < 0) return;
    event.preventDefault(); void sound.current?.unlock();
    const marking = tool === "mark" || event.button === 2;
    const current = state.grid[index];
    const value: Cell = marking ? (current === 2 ? 0 : 2) : (current === 1 ? 0 : 1);
    drag.current = { value, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setCursor(index); setCell(index, value);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const painting = drag.current, latest = active ? progressRef.current[active.id] : undefined;
    if (!painting || painting.pointer !== event.pointerId || !latest) return;
    const index = cellAt(event); if (index < 0) return;
    const current = latest.grid[index];
    // Painting never overwrites the other symbol; erasing only clears the same symbol.
    if (painting.value === 0 ? current !== 0 : current === 0) { setCursor(index); setCell(index, painting.value); }
  };
  const endDrag = () => { drag.current = null; };
  useEffect(() => { if (blocked) drag.current = null; }, [blocked]);

  const onBoardKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!state || blocked) return;
    const key = event.key.toLowerCase(), x = cursor % SIZE, y = Math.floor(cursor / SIZE);
    const move: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
    if (move[key]) { event.preventDefault(); const [dx, dy] = move[key]; setCursor(Math.min(SIZE - 1, Math.max(0, y + dy)) * SIZE + Math.min(SIZE - 1, Math.max(0, x + dx))); return; }
    const current = state.grid[cursor];
    if (key === " " || key === "enter") { event.preventDefault(); void sound.current?.unlock(); setCell(cursor, tool === "fill" ? (current === 1 ? 0 : 1) : (current === 2 ? 0 : 2)); }
    else if (key === "f" || key === "z") { event.preventDefault(); setCell(cursor, current === 1 ? 0 : 1); }
    else if (key === "x") { event.preventDefault(); setCell(cursor, current === 2 ? 0 : 2); }
    else if (key === "t") { event.preventDefault(); setTool(t => (t === "fill" ? "mark" : "fill")); }
    else if (key === "l") { event.preventDefault(); applyLens("row"); }
    else if (key === "k") { event.preventDefault(); applyLens("col"); }
  };

  // Friend preview: live sprite animation once a portrait is solved, otherwise the player's progress.
  useEffect(() => {
    const canvas = preview.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !active || !state) return;
    ctx.clearRect(0, 0, 96, 96); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 96, 96);
    let rows: readonly string[];
    if (state.solved && active.kind === "portrait" && sprites && active.facing) rows = spriteFrame(sprites, active.facing, !reducedMotion, reducedMotion ? 0 : frame).frame.rows;
    else if (state.solved) rows = active.picture;
    else rows = Array.from({ length: SIZE }, (_, y) => state.grid.slice(y * SIZE, y * SIZE + SIZE).map(c => (c === 1 ? "#" : ".")).join(""));
    ctx.fillStyle = "#000";
    rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(x * 6, y * 6, 6, 6); }));
  }, [active, state, sprites, frame, reducedMotion]);

  async function act(work: () => Promise<void>, cue?: FriendSoundCue): Promise<boolean> {
    if (locked.current || paused) return false;
    const version = epoch.current; locked.current = true; setBusy(true); setError(""); setMessage(""); void sound.current?.unlock();
    try { await work(); const value = await client.read(); if (version === epoch.current) { setSnapshot(value); if (cue) sound.current?.play(cue); } return version === epoch.current; }
    catch (cause) { if (version === epoch.current) setError(cause instanceof Error ? cause.message : "The action failed."); return false; }
    finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }

  const addCanvas = (playId: bigint, outcomeId: number) => {
    const id = `canvas-${playId}`;
    const puzzle: Puzzle = { id, kind: "canvas", title: `Mystery Canvas #${playId}`, picture: RELICS[outcomeId - 1].picture, playId, outcomeId };
    setPuzzles(list => (list.some(p => p.id === id) ? list : [...list, puzzle]));
    setProgress(all => (all[id] ? all : { ...all, [id]: newProgress(puzzle.picture, perkRef.current) }));
    setActiveId(id); setMenu(null);
  };
  const paintCanvas = () => act(async () => {
    const version = epoch.current;
    const pending = snapshot?.plays.find(play => play.outcomeId === null);
    const play = pending ?? (await client.play(1n))[0];
    const settled = await client.settle(play.id);
    if (version !== epoch.current) return;
    if (settled.outcomeId === null) { setMessage(`Canvas #${play.id} is still waiting for its randomness. Use Resume canvas.`); return; }
    addCanvas(settled.id, settled.outcomeId);
    setMessage("The canvas is sealed. Solve it to reveal what you found.");
  }, "action-start");

  if (loadError) return <div className="fg-loading" role="alert"><p>{loadError}</p>
    <button type="button" disabled={paused} onClick={() => setRevision(r => r + 1)}>Retry</button></div>;
  if (!snapshot || !sprites || !active || !state || !clue) return <div className="fg-loading" role="status"><div className="fg-spinner" aria-hidden="true" />Reading your Friend's pixels from the chain…</div>;

  const price = definition.price, maxPrize = maximumPrize(definition);
  const spendable = snapshot.rfBalance - burned;
  const canBuy = spendable >= price && snapshot.freeStake >= maxPrize && snapshot.freeStake + price >= maxPrize;
  const pending = snapshot.plays.find(play => play.outcomeId === null);
  const modeLabel = snapshot.mode === "preview" ? "Simulated" : "Live";
  const portraits = puzzles.filter(p => p.kind === "portrait");
  const solvedPortraits = portraits.filter(p => progress[p.id]?.solved).length;
  const reward = puzzles.find(p => p.id === rewardId);
  const rewardOutcome = reward?.outcomeId ? definition.outcomes[reward.outcomeId - 1] : null;
  const heldCount = snapshot.inventory.reduce((total, n) => total + n, 0n);
  const hiddenName = active.kind === "canvas" && !state.solved;
  const W = (leftCols + SIZE) * 10, H = (topRows + SIZE) * 10;
  const rowDone = clue.rows.map((c, y) => lineSatisfied(state.grid.slice(y * SIZE, y * SIZE + SIZE), c));
  const colDone = clue.cols.map((c, x) => lineSatisfied(Array.from({ length: SIZE }, (_, y) => state.grid[y * SIZE + x]), c));
  const feedback = error || message || (busy ? "Waiting for confirmation…" : "");
  const buy = (q: bigint) => void act(() => client.buy(q), "purchase").then(ok => { if (ok) setLedger(l => ({ ...l, spent: l.spent + price * q, bought: l.bought + q })); });
  const sell = (outcomeId: number) => act(() => client.redeem(outcomeId, 1n), "reward").then(ok => { if (ok) setLedger(l => ({ ...l, redeemed: l.redeemed + definition.outcomes[outcomeId - 1].reward })); return ok; });
  const liveBurn = ledger.spent / 2n + burned;
  const nextUnsolved = () => { const i = puzzles.findIndex(p => p.id === active.id); return [...puzzles.slice(i + 1), ...puzzles.slice(0, i)].find(p => !progress[p.id]?.solved && p.kind !== "canvas"); };
  const celebrated = celebrate ? puzzles.find(p => p.id === celebrate) : undefined, cstate = celebrated && progress[celebrated.id];
  const stampLine = (list: readonly string[]) => list.length ? list.map(k => `${STAMPS[k].icon} ${k}`).join("  ") : "No stamps this time";

  return <section className="fg-game" aria-label="Friendogram" aria-busy={busy}>
    <div className="fg-layout" inert={blocked || undefined}>
      <div className="fg-board" tabIndex={0} role="grid" aria-label={`${hiddenName ? "Sealed canvas" : active.title} puzzle, 16 by 16. Arrows move, Space fills, X marks.`}
        aria-rowcount={SIZE} aria-colcount={SIZE} onKeyDown={onBoardKey}>
        <svg ref={board} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={endDrag} onPointerCancel={endDrag} onContextMenu={event => event.preventDefault()}>
          {clue.rows.map((c, y) => <text key={`r${y}`} className={rowDone[y] ? "fg-clue fg-done" : "fg-clue"} x={leftCols * 10 - 3} y={(topRows + y) * 10 + 7.2} textAnchor="end">{(c.length ? c : [0]).join(" ")}</text>)}
          {clue.cols.map((c, x) => (c.length ? c : [0]).map((n, i, all) => <text key={`c${x}-${i}`} className={colDone[x] ? "fg-clue fg-done" : "fg-clue"} x={(leftCols + x) * 10 + 5} y={(topRows - all.length + i) * 10 + 7.2} textAnchor="middle">{n}</text>))}
          <g transform={`translate(${leftCols * 10} ${topRows * 10})`}>
            {state.grid.map((cell, i) => {
              const x = (i % SIZE) * 10, y = Math.floor(i / SIZE) * 10;
              return <g key={i}>
                <rect x={x} y={y} width={10} height={10} className={`fg-cell${cell === 1 ? " fg-on" : ""}${flash === i ? " fg-flash" : ""}${state.solved ? " fg-solved" : ""}${!state.solved && state.given.includes(i) ? " fg-given" : ""}`} />
                {!state.solved && state.given.includes(i) && <circle cx={x + 5} cy={y + 5} r={1.4} className="fg-anchor" />}
                {cell === 2 && !state.solved && <path d={`M${x + 3} ${y + 3}L${x + 7} ${y + 7}M${x + 7} ${y + 3}L${x + 3} ${y + 7}`} className="fg-x" />}
              </g>;
            })}
            {[4, 8, 12].map(n => <g key={n}><line x1={n * 10} y1={0} x2={n * 10} y2={160} className="fg-major" /><line x1={0} y1={n * 10} x2={160} y2={n * 10} className="fg-major" /></g>)}
            <rect x={0} y={0} width={160} height={160} className="fg-frame" />
            {!state.solved && <rect x={(cursor % SIZE) * 10} y={Math.floor(cursor / SIZE) * 10} width={10} height={10} className="fg-cursor" />}
          </g>
        </svg>
      </div>
      {celebrated && cstate && !menu && <div className="fg-celebrate" role="dialog" aria-label="Puzzle solved">
        <div className="fg-celebrate-card">
          <div className={reducedMotion ? "fg-walk" : "fg-walk fg-walking"} aria-hidden="true">
            <canvas width={80} height={80} ref={node => {
              const ctx = node?.getContext("2d"); if (!ctx) return;
              ctx.clearRect(0, 0, 80, 80); ctx.fillStyle = "#000";
              const rows = celebrated.kind === "portrait" && sprites ? spriteFrame(sprites, "right", !reducedMotion, reducedMotion ? 0 : frame).frame.rows : celebrated.picture;
              rows.forEach((row, y) => [...row].forEach((p, x) => { if (p === "#") ctx.fillRect(x * 5, y * 5, 5, 5); }));
            }} />
          </div>
          <h2>{celebrated.kind === "daily" ? `It's #${celebrated.tokenId}, a ${celebrated.family}!` : "Solved!"}</h2>
          <p>{cstate.revealed ? "Revealed" : `${clock(cstate.seconds)} · ${cstate.mistakes} mistake${cstate.mistakes === 1 ? "" : "s"} · ${cstate.lenses} lens${cstate.lenses === 1 ? "" : "es"}`} · {starText(cstate.stars)}</p>
          <p className="fg-stamps">{stampLine(cstate.stamps)}</p>
          <div className="fg-row">
            {nextUnsolved() && <button type="button" className="rf-frame-primary" onClick={() => { const n = nextUnsolved(); if (n) { setActiveId(n.id); setCursor(0); } setCelebrate(""); setMessage(""); }}>Next puzzle</button>}
            <button type="button" onClick={() => setCelebrate("")}>Admire it</button>
          </div>
        </div>
      </div>}

      <aside className="fg-side">
        <header><h1>Friendogram</h1><p className="fg-balance">{modeLabel} · {rf(spendable)} · {snapshot.consumables.toString()} canvas</p>
          <p className="fg-burn" aria-label={`${rf(burned)} burned on lenses`}>🔥 {rf(burned)} burned</p></header>
        <p className="fg-perk" title={perk.text}><strong>{perk.family} perk · {perk.name}</strong> {perk.text}</p>
        <div className="fg-card">
          <canvas ref={preview} width={96} height={96} aria-label={state.solved ? `${active.title} solved` : "Your progress"} />
          <div>
            <strong>{hiddenName ? `${active.title} · sealed` : active.title}</strong>
            <small className="fg-stars" aria-label={`Difficulty ${state.stars} of 4`}>{starText(state.stars)} · par {clock(parSeconds(state.stars))}{state.given.length ? ` · ${state.given.length} anchor${state.given.length > 1 ? "s" : ""}` : ""}</small>
            <small>{active.kind === "daily" ? `${DAILY.key} · #${active.tokenId} · ${state.solved ? `${active.family} family` : "who is it?"}` : active.kind === "portrait" ? `#${friendId} · ${sprites.familyName} family (${FAMILY_SHARE[sprites.familyName]} of designs)` : state.solved && active.outcomeId ? `${definition.outcomes[active.outcomeId - 1].name} · ${RELICS[active.outcomeId - 1].rarity}` : "Prize fixed at opening. Solve to reveal it."}</small>
            <small>{state.solved ? (state.revealed ? "Revealed" : `Solved in ${clock(state.seconds)} · ${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"}`) : `${clock(state.seconds)} · ${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"}`}</small>
          </div>
        </div>
        <label className="fg-select">Puzzle
          <select value={active.id} onChange={event => { setActiveId(event.target.value); setCursor(0); setMessage(""); }}>
            {puzzles.map(p => <option key={p.id} value={p.id}>{progress[p.id]?.solved ? "✓ " : ""}{"★".repeat(progress[p.id]?.stars ?? 1)} {p.kind === "canvas" && !progress[p.id]?.solved ? `${p.title} · sealed` : p.kind === "daily" ? `☀ ${p.title}` : p.title}</option>)}
          </select>
        </label>
        <div className="fg-tools" role="group" aria-label="Tool">
          <button type="button" aria-pressed={tool === "fill"} onClick={() => setTool("fill")}>■ Fill</button>
          <button type="button" aria-pressed={tool === "mark"} onClick={() => setTool("mark")}>✕ Mark</button>
          <button type="button" disabled={state.solved} onClick={() => setProgress(all => ({ ...all, [active.id]: { ...state, grid: state.initial.slice() } }))}>Clear</button>
        </div>
        <div className="fg-tools" role="group" aria-label="Lenses">
          <button type="button" disabled={state.solved} onClick={() => applyLens("row")} title="Reveal the cursor's row (L)">🔍 Row</button>
          <button type="button" disabled={state.solved} onClick={() => applyLens("col")} title="Reveal the cursor's column (K)">🔍 Column</button>
          <span className="fg-lens-note">{state.freeLeft > 0 ? `${state.freeLeft} free` : bank > 0 ? `${bank} banked` : rf(lensCost)}</span>
        </div>
        {active.kind === "canvas" && !state.solved && <button type="button" className="fg-wide" onClick={() => solve(active, true)}>Reveal now (skip puzzle)</button>}
        <div className="fg-actions">
          <button type="button" className="rf-frame-primary" onClick={() => { setMenu("shop"); setError(""); }}>Canvases</button>
          <button type="button" onClick={() => setMenu("gallery")}>Gallery · {solvedPortraits}/{portraits.length}</button>
          <button type="button" onClick={() => setMenu("settings")} aria-label="Settings">Settings</button>
          <button type="button" onClick={() => setMenu("help")} aria-label="How to play">?</button>
        </div>
        <p className="fg-status" role={error ? "alert" : "status"}>{feedback}</p>
      </aside>
    </div>
    {menu && <GameMenu title={menu === "help" ? "Friendogram" : menu === "shop" ? "Mystery Canvas" : menu === "gallery" ? "Gallery" : menu === "reward" ? "Canvas revealed" : "Settings"}
      onClose={busy ? undefined : () => { setMenu(null); setError(""); }}
      footer={menu === "help" ? <button type="button" className="rf-frame-primary" onClick={() => setMenu(null)}>Start solving</button> : undefined}>
      {menu === "help" ? <>
        <p className="fg-lede">Every puzzle is drawn from <strong>#{friendId.toString()}</strong>'s own 16 × 16 on-chain sprite. Solve it and your Friend walks off the board.</p>
        <ol className="fg-steps">
          <li><strong>Read the clues.</strong> Each number is a run of filled squares in that row or column, in order, with gaps between runs. A grey clue means that line is done.</li>
          <li><strong>Paint.</strong> Tap or drag to fill. Right-click or <em>✕ Mark</em> for empty squares. Keys: arrows/WASD, Space, F fill, X mark, T tool, L/K lens.</li>
          <li><strong>Never guess.</strong> Every puzzle can be finished by logic alone. Dotted <span className="fg-dot">•</span> anchors are given where your Friend's shape would otherwise need a guess.</li>
        </ol>
        <p><strong>{perk.family} perk · {perk.name}:</strong> {perk.text}</p>
        <p><strong>Also here:</strong> ☀ Friend of the Day #{DAILY.number} (same Friend for everyone today), lenses ({rf(lensCost)}, 100% burned), stamps for perfect, swift and pure-logic solves, and 1 RF Mystery Canvases. All RF is simulated.</p>
      </> : menu === "shop" ? <>
        <div className="fg-row">
          <button type="button" disabled={!canBuy || busy || paused} onClick={() => buy(1n)}>Buy 1 · {rf(price)}</button>
          <button type="button" disabled={!canBuy || busy || paused || spendable < price * 3n} onClick={() => buy(3n)}>Buy 3 · {rf(price * 3n)}</button>
          <button type="button" className="rf-frame-primary" disabled={busy || paused || (!pending && snapshot.consumables === 0n)} onClick={() => void paintCanvas()}>{pending ? "Resume canvas" : `Open a canvas (${snapshot.consumables.toString()})`}</button>
        </div>
        <p>One canvas costs <strong>{rf(price)}</strong> and holds one relic. The prize is fixed when you open it; solving only reveals it. {snapshot.mode === "preview" && "All RF here is simulated."}</p>
        <table><thead><tr><th>Relic</th><th>Chance</th><th>Value</th></tr></thead>
          <tbody>{definition.outcomes.map((o, i) => <tr key={o.name}><td>{o.name} <small>{RELICS[i].rarity}</small></td><td>{o.chanceBps / 100}%</td><td>{rf(o.reward)}</td></tr>)}</tbody></table>
        <p className="fg-note">Expected value {rf(expectedReward(definition))} per canvas · max {rf(maxPrize)}. In live play, half of each payment is burned and half funds Friend rewards, as with other Rare Friends gameplay.</p>
        {!canBuy && <p>{spendable < price ? "Not enough RF." : "New canvases are paused until there's enough free backing."}</p>}
        {feedback && <p role={error ? "alert" : "status"}>{feedback}</p>}
      </> : menu === "reward" && reward && rewardOutcome && reward.outcomeId ? <div className="fg-reward">
        <canvas width={96} height={96} ref={node => {
          const ctx = node?.getContext("2d"); if (!ctx) return;
          ctx.fillStyle = "#ccff00"; ctx.fillRect(0, 0, 96, 96); ctx.fillStyle = "#000";
          reward.picture.forEach((row, y) => [...row].forEach((p, x) => { if (p === "#") ctx.fillRect(x * 6, y * 6, 6, 6); }));
        }} aria-hidden="true" />
        <h3>{rewardOutcome.name}</h3>
        <p><strong>{RELICS[reward.outcomeId - 1].rarity}</strong> · {rewardOutcome.chanceBps / 100}% · {rf(rewardOutcome.reward)}</p>
        <p>{RELICS[reward.outcomeId - 1].blurb}</p>
        {!progress[reward.id]?.revealed && <p className="fg-stamps">{stampLine(progress[reward.id]?.stamps ?? [])}</p>}
        <p className="fg-note">{snapshot.mode === "preview" ? "Simulated relic. " : ""}It's already in your Friend's inventory and keeps its fixed value with no expiry.</p>
        <div className="fg-row">
          <button type="button" disabled={busy} onClick={() => setMenu(null)}>Keep it</button>
          {rewardOutcome.reward > 0n && <button type="button" disabled={busy || paused || snapshot.inventory[reward.outcomeId - 1] === 0n} onClick={() => void sell(reward.outcomeId!).then(ok => { if (ok) setMenu("gallery"); })}>Sell · {rf(rewardOutcome.reward)}</button>}
        </div>
        {feedback && <p role={error ? "alert" : "status"}>{feedback}</p>}
      </div> : menu === "gallery" ? <>
        <h3>#{friendId.toString()} · {sprites.familyName}</h3>
        <ul className="fg-list">{portraits.map(p => { const s = progress[p.id]; return <li key={p.id}><span>{s?.solved ? "✓" : "·"} {p.title}</span><small>{s?.solved ? `${clock(s.seconds)} · ${s.mistakes} mistakes${s.stamps.length ? " · " + s.stamps.map(k => STAMPS[k].icon).join("") : ""}` : `unsolved · ${starText(s?.stars ?? 1)}`}</small></li>; })}</ul>
        {(() => { const d = puzzles.find(p => p.kind === "daily"), s = d && progress[d.id]; return <>
          <h3>☀ Friend of the Day #{DAILY.number} · {DAILY.key}</h3>
          {d && s?.solved ? <pre className="fg-share">{`Friendogram ☀ #${DAILY.number}\nFriend #${d.tokenId} (${d.family})\n${s.revealed ? "revealed" : `solved in ${clock(s.seconds)}`} · ${s.mistakes} mistakes · ${s.lenses} lenses\n${starText(s.stars)}  ${s.stamps.map(k => STAMPS[k].icon + " " + k).join("  ")}`}</pre>
            : <p>Not solved yet. Pick ☀ Friend of the Day in the puzzle list.</p>}
        </>; })()}
        <h3>Stamps</h3>
        <ul className="fg-list">{Object.entries(STAMPS).map(([k, v]) => <li key={k}><span><strong>{v.icon} {k}</strong> <small>{v.text}</small></span><small>{Object.values(progress).filter(p => p.stamps.includes(k)).length} earned</small></li>)}</ul>
        <h3>Session economy (simulated)</h3>
        <table className="fg-ledger"><tbody>
          <tr><td>Canvases bought</td><td>{ledger.bought.toString()} · {rf(ledger.spent)}</td></tr>
          <tr><td>…burned in live play (50%)</td><td>{rf(ledger.spent / 2n)}</td></tr>
          <tr><td>…to Friend rewards (50%)</td><td>{rf(ledger.spent / 2n)}</td></tr>
          <tr><td>Lens burn (100%) · {Object.values(progress).reduce((n, s) => n + s.lenses, 0)} lenses{bank ? ` · ${bank} banked` : ""}</td><td>{rf(burned)}</td></tr>
          <tr><td>Relics sold back</td><td>{rf(ledger.redeemed)}</td></tr>
          <tr className="fg-total"><td>RF removed from supply</td><td>🔥 {rf(liveBurn)}</td></tr>
        </tbody></table>
        <p className="fg-note">Canvas burns follow the Rare Friends gameplay split and would happen on-chain in live play. Lens burns need a custom integration. Nothing here is a real transaction.</p>
        <h3>Relics · {heldCount.toString()} held</h3>
        <ul className="fg-list">{definition.outcomes.map((o, i) => <li key={o.name}><span><strong>{o.name}</strong> <small>{snapshot.inventory[i].toString()} held · {rf(o.reward)}</small></span>
          <button type="button" disabled={busy || paused || snapshot.inventory[i] === 0n || o.reward === 0n} onClick={() => void sell(i + 1)}>Sell one</button></li>)}</ul>
        <h3>Family perks</h3>
        <ul className="fg-list">{Object.values(PERKS).map(p => <li key={p.family} className={p.family === perk.family ? "fg-mine" : undefined}><span><strong>{p.family}</strong> <small>{p.share}</small></span><small>{p.name}: {p.text}</small></li>)}</ul>
        {feedback && <p role={error ? "alert" : "status"}>{feedback}</p>}
      </> : menu === "settings" ? <>
        <button type="button" aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); sound.current?.setMuted(next); if (!next) void sound.current?.unlock(); }}>{muted ? "Sound off" : "Sound on"}</button>
        <label><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
        <label><input type="checkbox" checked={assist} onChange={event => setAssist(event.target.checked)} /> Assist: catch wrong fills and count mistakes</label>
        <p className="fg-note">Balances, canvases and relics are simulated in preview. Reloading starts a new session. Wallet connection and ownership checks are handled by the SDK.</p>
      </> : null}
    </GameMenu>}
  </section>;
}
