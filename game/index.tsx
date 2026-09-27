"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { expectedReward, maximumPrize, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, spriteFrame, type GenerationSprites, type SpriteFacing } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundKit, type FriendSoundCue } from "@rarefriends/friendsdk/sounds";
import { SIZE, clues, emptyGrid, isSolved, lineSatisfied, pictureRows, type Cell, type Picture } from "./nonogram";
import { RELICS } from "./relics";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

type Puzzle = Readonly<{
  id: string; kind: "portrait" | "canvas"; title: string; picture: Picture;
  facing?: SpriteFacing; walking?: boolean; playId?: bigint; outcomeId?: number;
}>;
type Progress = { grid: Cell[]; mistakes: number; seconds: number; solved: boolean; revealed: boolean };
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
  const sound = useRef<FriendSoundKit | null>(null), locked = useRef(false), epoch = useRef(0);
  const drag = useRef<{ value: Cell; pointer: number } | null>(null);
  const preview = useRef<HTMLCanvasElement>(null), board = useRef<SVGSVGElement>(null);

  // Session setup: fresh state per Friend/client; artwork and ledger load together.
  useEffect(() => {
    const version = ++epoch.current;
    sound.current = createFriendSoundKit({ muted: true });
    setSprites(null); setSnapshot(null); setLoadError(""); setPuzzles([]); setProgress({}); setActiveId("");
    setMenu("help"); setBusy(false); setError(""); setMessage(""); setMuted(true); locked.current = false;
    void Promise.all([createFriendReader().read(friendId), client.read()]).then(([art, value]) => {
      if (version !== epoch.current) return;
      if (value.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      const list = portraitPuzzles(art);
      setSprites(art); setSnapshot(value); setPuzzles(list); setActiveId(list[0]?.id ?? "");
      setProgress(Object.fromEntries(list.map(p => [p.id, { grid: emptyGrid(), mistakes: 0, seconds: 0, solved: false, revealed: false }])));
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

  const solve = useCallback((puzzle: Puzzle, revealed: boolean) => {
    setProgress(all => ({ ...all, [puzzle.id]: { ...all[puzzle.id], solved: true, revealed, grid: pictureRows(puzzle.picture).flat().map(on => (on ? 1 : 2) as Cell) } }));
    if (puzzle.kind === "canvas" && puzzle.outcomeId) {
      sound.current?.play(revealCue(puzzle.outcomeId)); setMessage(""); setError(""); setRewardId(puzzle.id); setMenu("reward");
    } else { sound.current?.play("reveal-rare"); setMessage(`Solved! That's ${sprites ? `your ${sprites.familyName}` : "your Friend"}.`); }
  }, [sprites]);

  const progressRef = useRef(progress); progressRef.current = progress;
  const setCell = useCallback((index: number, value: Cell) => {
    const state = active ? progressRef.current[active.id] : undefined;
    if (!active || !state || state.solved || blocked) return;
    const current = state.grid[index];
    if (current === value) return;
    let next: Cell = value, mistake = false;
    if (assist && value === 1 && !solution[index]) { next = 2; mistake = true; }
    const grid = state.grid.slice(); grid[index] = next;
    const updated = { ...state, grid, mistakes: state.mistakes + (mistake ? 1 : 0) };
    progressRef.current = { ...progressRef.current, [active.id]: updated };
    setProgress(all => ({ ...all, [active.id]: { ...updated, seconds: all[active.id]?.seconds ?? updated.seconds } }));
    if (mistake) { setFlash(index); window.setTimeout(() => setFlash(f => (f === index ? -1 : f)), 450); sound.current?.play("impact"); }
    else if (value === 1) sound.current?.play("select");
    if (!mistake && isSolved(grid, active.picture)) solve(active, false);
  }, [active, blocked, assist, solution, solve]);

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

  async function act(work: () => Promise<void>, cue?: FriendSoundCue) {
    if (locked.current || paused) return;
    const version = epoch.current; locked.current = true; setBusy(true); setError(""); setMessage(""); void sound.current?.unlock();
    try { await work(); const value = await client.read(); if (version === epoch.current) { setSnapshot(value); if (cue) sound.current?.play(cue); } }
    catch (cause) { if (version === epoch.current) setError(cause instanceof Error ? cause.message : "The action failed."); }
    finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }

  const addCanvas = (playId: bigint, outcomeId: number) => {
    const id = `canvas-${playId}`;
    const puzzle: Puzzle = { id, kind: "canvas", title: `Mystery Canvas #${playId}`, picture: RELICS[outcomeId - 1].picture, playId, outcomeId };
    setPuzzles(list => (list.some(p => p.id === id) ? list : [...list, puzzle]));
    setProgress(all => (all[id] ? all : { ...all, [id]: { grid: emptyGrid(), mistakes: 0, seconds: 0, solved: false, revealed: false } }));
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
  const canBuy = snapshot.rfBalance >= price && snapshot.freeStake >= maxPrize && snapshot.freeStake + price >= maxPrize;
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
                <rect x={x} y={y} width={10} height={10} className={`fg-cell${cell === 1 ? " fg-on" : ""}${flash === i ? " fg-flash" : ""}${state.solved ? " fg-solved" : ""}`} />
                {cell === 2 && !state.solved && <path d={`M${x + 3} ${y + 3}L${x + 7} ${y + 7}M${x + 7} ${y + 3}L${x + 3} ${y + 7}`} className="fg-x" />}
              </g>;
            })}
            {[4, 8, 12].map(n => <g key={n}><line x1={n * 10} y1={0} x2={n * 10} y2={160} className="fg-major" /><line x1={0} y1={n * 10} x2={160} y2={n * 10} className="fg-major" /></g>)}
            <rect x={0} y={0} width={160} height={160} className="fg-frame" />
            {!state.solved && <rect x={(cursor % SIZE) * 10} y={Math.floor(cursor / SIZE) * 10} width={10} height={10} className="fg-cursor" />}
          </g>
        </svg>
      </div>
      <aside className="fg-side">
        <header><h1>Friendogram</h1><p className="fg-balance">{modeLabel} · {rf(snapshot.rfBalance)} · {snapshot.consumables.toString()} canvas</p></header>
        <div className="fg-card">
          <canvas ref={preview} width={96} height={96} aria-label={state.solved ? `${active.title} solved` : "Your progress"} />
          <div>
            <strong>{hiddenName ? `${active.title} · sealed` : active.title}</strong>
            <small>{active.kind === "portrait" ? `#${friendId} · ${sprites.familyName} family (${FAMILY_SHARE[sprites.familyName]} of designs)` : state.solved && active.outcomeId ? `${definition.outcomes[active.outcomeId - 1].name} · ${RELICS[active.outcomeId - 1].rarity}` : "Prize fixed at opening. Solve to reveal it."}</small>
            <small>{state.solved ? (state.revealed ? "Revealed" : `Solved in ${clock(state.seconds)} · ${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"}`) : `${clock(state.seconds)} · ${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"}`}</small>
          </div>
        </div>
        <label className="fg-select">Puzzle
          <select value={active.id} onChange={event => { setActiveId(event.target.value); setCursor(0); setMessage(""); }}>
            {puzzles.map(p => <option key={p.id} value={p.id}>{progress[p.id]?.solved ? "✓ " : ""}{p.kind === "canvas" && !progress[p.id]?.solved ? `${p.title} · sealed` : p.title}</option>)}
          </select>
        </label>
        <div className="fg-tools" role="group" aria-label="Tool">
          <button type="button" aria-pressed={tool === "fill"} onClick={() => setTool("fill")}>■ Fill</button>
          <button type="button" aria-pressed={tool === "mark"} onClick={() => setTool("mark")}>✕ Mark</button>
          <button type="button" disabled={state.solved} onClick={() => setProgress(all => ({ ...all, [active.id]: { ...state, grid: emptyGrid() } }))}>Clear</button>
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
        <p>Every puzzle here is drawn from <strong>#{friendId.toString()}</strong>'s own 16 × 16 on-chain sprite. Solve it and your Friend walks off the board.</p>
        <p>Numbers are runs of filled squares in that row or column, in order, with at least one gap between runs. Fill squares, mark ones you know are empty, and grey clues mean a line is done.</p>
        <p><strong>Controls:</strong> tap or drag to paint · right-click or ✕ Mark to mark · keyboard: arrows/WASD move, Space fills with the current tool, F fills, X marks, T switches tool.</p>
        <p><strong>Mystery Canvas</strong> ({rf(price)}, simulated): its relic is fixed when you open it. Solve the picture to reveal it, then keep it or sell it back for its fixed RF value.</p>
      </> : menu === "shop" ? <>
        <div className="fg-row">
          <button type="button" disabled={!canBuy || busy || paused} onClick={() => void act(() => client.buy(1n), "purchase")}>Buy 1 · {rf(price)}</button>
          <button type="button" disabled={!canBuy || busy || paused || snapshot.rfBalance < price * 3n} onClick={() => void act(() => client.buy(3n), "purchase")}>Buy 3 · {rf(price * 3n)}</button>
          <button type="button" className="rf-frame-primary" disabled={busy || paused || (!pending && snapshot.consumables === 0n)} onClick={() => void paintCanvas()}>{pending ? "Resume canvas" : `Open a canvas (${snapshot.consumables.toString()})`}</button>
        </div>
        <p>One canvas costs <strong>{rf(price)}</strong> and holds one relic. The prize is fixed when you open it; solving only reveals it. {snapshot.mode === "preview" && "All RF here is simulated."}</p>
        <table><thead><tr><th>Relic</th><th>Chance</th><th>Value</th></tr></thead>
          <tbody>{definition.outcomes.map((o, i) => <tr key={o.name}><td>{o.name} <small>{RELICS[i].rarity}</small></td><td>{o.chanceBps / 100}%</td><td>{rf(o.reward)}</td></tr>)}</tbody></table>
        <p className="fg-note">Expected value {rf(expectedReward(definition))} per canvas · max {rf(maxPrize)}. In live play, half of each payment is burned and half funds Friend rewards, as with other Rare Friends gameplay.</p>
        {!canBuy && <p>{snapshot.rfBalance < price ? "Not enough RF." : "New canvases are paused until there's enough free backing."}</p>}
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
        <p className="fg-note">{snapshot.mode === "preview" ? "Simulated relic. " : ""}It's already in your Friend's inventory and keeps its fixed value with no expiry.</p>
        <div className="fg-row">
          <button type="button" disabled={busy} onClick={() => setMenu(null)}>Keep it</button>
          {rewardOutcome.reward > 0n && <button type="button" disabled={busy || paused || snapshot.inventory[reward.outcomeId - 1] === 0n} onClick={() => void act(() => client.redeem(reward.outcomeId!, 1n), "reward").then(() => setMenu("gallery"))}>Sell · {rf(rewardOutcome.reward)}</button>}
        </div>
        {feedback && <p role={error ? "alert" : "status"}>{feedback}</p>}
      </div> : menu === "gallery" ? <>
        <h3>#{friendId.toString()} · {sprites.familyName}</h3>
        <ul className="fg-list">{portraits.map(p => { const s = progress[p.id]; return <li key={p.id}><span>{s?.solved ? "✓" : "·"} {p.title}</span><small>{s?.solved ? `${clock(s.seconds)} · ${s.mistakes} mistakes` : "unsolved"}</small></li>; })}</ul>
        <h3>Relics · {heldCount.toString()} held</h3>
        <ul className="fg-list">{definition.outcomes.map((o, i) => <li key={o.name}><span><strong>{o.name}</strong> <small>{snapshot.inventory[i].toString()} held · {rf(o.reward)}</small></span>
          <button type="button" disabled={busy || paused || snapshot.inventory[i] === 0n || o.reward === 0n} onClick={() => void act(() => client.redeem(i + 1, 1n), "reward")}>Sell one</button></li>)}</ul>
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
