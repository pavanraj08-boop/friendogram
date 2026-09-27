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
