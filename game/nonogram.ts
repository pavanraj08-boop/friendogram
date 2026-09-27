/** Pure picross helpers. A picture is 16 strings of "#" (filled) and "." (empty). */
export const SIZE = 16;
export type Cell = 0 | 1 | 2; // 0 unknown, 1 filled, 2 marked empty
export type Picture = readonly string[];

export function runs(line: readonly boolean[]): number[] {
  const out: number[] = [];
  let count = 0;
  for (const filled of line) {
    if (filled) count++;
    else if (count) { out.push(count); count = 0; }
  }
  if (count) out.push(count);
  return out;
}

export function pictureRows(picture: Picture): boolean[][] {
  if (picture.length !== SIZE || picture.some(row => row.length !== SIZE)) throw new RangeError("Pictures must be 16 × 16.");
  return picture.map(row => [...row].map(pixel => pixel === "#"));
}

export function clues(picture: Picture) {
  const rows = pictureRows(picture);
  return {
    rows: rows.map(runs),
    cols: Array.from({ length: SIZE }, (_, x) => runs(rows.map(row => row[x]))),
  };
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => value === b[index]);

export function lineSatisfied(cells: readonly Cell[], clue: readonly number[]) {
  return same(runs(cells.map(cell => cell === 1)), clue);
}

/** Solved when every row and column matches its clue (any valid solution counts). */
export function isSolved(grid: readonly Cell[], picture: Picture) {
  const { rows, cols } = clues(picture);
  for (let y = 0; y < SIZE; y++) if (!lineSatisfied(grid.slice(y * SIZE, y * SIZE + SIZE), rows[y])) return false;
  for (let x = 0; x < SIZE; x++) if (!lineSatisfied(Array.from({ length: SIZE }, (_, y) => grid[y * SIZE + x]), cols[x])) return false;
  return true;
}

export function filledCount(picture: Picture) {
  return picture.reduce((total, row) => total + [...row].filter(pixel => pixel === "#").length, 0);
}

export const emptyGrid = (): Cell[] => Array.from({ length: SIZE * SIZE }, () => 0 as Cell);

/** All placements of a clue in a line of known cells (0 unknown, 1 filled, 2 empty); returns forced cells or null if contradictory. */
export function solveLine(line: readonly Cell[], clue: readonly number[]): Cell[] | null {
  const n = line.length, blocks = clue.filter(v => v > 0);
  let canFill = new Array<boolean>(n).fill(false), canEmpty = new Array<boolean>(n).fill(false), any = false;
  const place = (b: number, start: number, acc: boolean[]) => {
    if (b === blocks.length) {
      for (let i = start; i < n; i++) if (line[i] === 1) return;
      const full = acc.concat(new Array(n - acc.length).fill(false));
      any = true;
      full.forEach((f, i) => { if (f) canFill[i] = true; else canEmpty[i] = true; });
      return;
    }
    const len = blocks[b];
    const rest = blocks.slice(b + 1).reduce((s, v) => s + v + 1, 0);
    for (let s = start; s + len + rest <= n; s++) {
      let okGap = true;
      for (let i = start; i < s; i++) if (line[i] === 1) { okGap = false; break; }
      if (!okGap) break;
      let fits = true;
      for (let i = s; i < s + len; i++) if (line[i] === 2) { fits = false; break; }
      if (!fits) continue;
      if (s + len < n && line[s + len] === 1) continue;
      const next = acc.concat(new Array(s - acc.length).fill(false), new Array(len).fill(true));
      if (s + len < n) next.push(false);
      place(b + 1, s + len + 1, next);
    }
  };
  place(0, 0, []);
  if (!any) return null;
  return line.map((c, i) => (c !== 0 ? c : canFill[i] && !canEmpty[i] ? 1 : canEmpty[i] && !canFill[i] ? 2 : 0) as Cell);
}

/** Pure line logic from a starting grid. Returns the grid reached and how many sweeps it took. */
export function lineSolve(picture: Picture, start: readonly Cell[] = emptyGrid()) {
  const { rows, cols } = clues(picture), grid = start.slice() as Cell[];
  let sweeps = 0, changed = true;
  while (changed) {
    changed = false; sweeps++;
    for (let y = 0; y < SIZE; y++) {
      const next = solveLine(grid.slice(y * SIZE, y * SIZE + SIZE), rows[y]); if (!next) return { grid, sweeps, solved: false };
      next.forEach((c, x) => { if (grid[y * SIZE + x] !== c) { grid[y * SIZE + x] = c; changed = true; } });
    }
    for (let x = 0; x < SIZE; x++) {
      const next = solveLine(Array.from({ length: SIZE }, (_, y) => grid[y * SIZE + x]), cols[x]); if (!next) return { grid, sweeps, solved: false };
      next.forEach((c, y) => { if (grid[y * SIZE + x] !== c) { grid[y * SIZE + x] = c; changed = true; } });
    }
  }
  return { grid, sweeps, solved: grid.every(c => c !== 0) };
}

/**
 * Makes any picture solvable by logic alone: while line logic stalls, reveal one undecided cell
 * (prefer a filled one near the middle of the unknown region) as a fixed "anchor". Deterministic.
 */
export function anchorsFor(picture: Picture): { anchors: number[]; sweeps: number } {
  const solution = pictureRows(picture).flat(), anchors: number[] = [];
  let start = emptyGrid(), result = lineSolve(picture, start), sweeps = result.sweeps;
  while (!result.solved) {
    const unknown = result.grid.map((c, i) => (c === 0 ? i : -1)).filter(i => i >= 0);
    const filled = unknown.filter(i => solution[i]);
    const pool = filled.length ? filled : unknown;
    const pick = pool[Math.floor(pool.length / 2)];
    anchors.push(pick);
    start = result.grid.slice(); start[pick] = solution[pick] ? 1 : 2;
    result = lineSolve(picture, start); sweeps += result.sweeps;
  }
  return { anchors, sweeps };
}

/** 1–4 stars from how long pure logic takes and how many anchors were needed. */
export function difficulty(picture: Picture) {
  const { anchors, sweeps } = anchorsFor(picture);
  const stars = Math.max(1, Math.min(4, Math.round(sweeps / 3) + (anchors.length ? 1 : 0)));
  return { stars, anchors, sweeps };
}
