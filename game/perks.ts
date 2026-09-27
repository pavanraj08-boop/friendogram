/** Family perks: the selected Friend's real on-chain family changes how every puzzle plays. Rarer families get stronger perks. */
export type Perk = Readonly<{
  family: string; name: string; text: string; share: string;
  freeLenses: number;      // free lenses at the start of every puzzle
  lensCostPct: number;     // % of the normal lens price
  forgive: number;         // wrong fills per puzzle that don't count as mistakes (Infinity = all)
  reveal: readonly ("row0" | "col0" | "empty-lines")[]; // lines solved before you start
  bankOnSolve: number;     // lenses banked for later puzzles each time you solve one
  slowTimer: boolean;      // solve timer runs at half speed
}>;

const base = { freeLenses: 0, lensCostPct: 100, forgive: 0, reveal: [], bankOnSolve: 0, slowTimer: false } as const;

export const PERKS: Readonly<Record<string, Perk>> = {
  Skeleton: { ...base, family: "Skeleton", share: "18%", name: "Bare Bones", text: "Your first 3 wrong fills in each puzzle don't count as mistakes.", forgive: 3 },
  Mask: { ...base, family: "Mask", share: "18%", name: "Second Face", text: "The first lens in each puzzle is free.", freeLenses: 1 },
  Family: { ...base, family: "Family", share: "18%", name: "Kinship", text: "Every solved puzzle banks 1 free lens for later.", bankOnSolve: 1 },
  Cellular: { ...base, family: "Cellular", share: "18%", name: "Mitosis", text: "Lenses cost half.", lensCostPct: 50 },
  Asymmetry: { ...base, family: "Asymmetry", share: "18%", name: "Tilt", text: "The first column of every puzzle starts solved.", reveal: ["col0"] },
  Hoverer: { ...base, family: "Hoverer", share: "2.5%", name: "Float", text: "Your solve timer runs at half speed, and the first lens in each puzzle is free.", slowTimer: true, freeLenses: 1 },
  Colossus: { ...base, family: "Colossus", share: "2.5%", name: "Titan", text: "The first row and first column of every puzzle start solved.", reveal: ["row0", "col0"] },
  Sparkling: { ...base, family: "Sparkling", share: "2.5%", name: "Shine", text: "3 free lenses in every puzzle.", freeLenses: 3 },
  Hollow: { ...base, family: "Hollow", share: "2.5%", name: "Void Sight", text: "Empty rows and columns start marked, and wrong fills never count as mistakes.", reveal: ["empty-lines"], forgive: Infinity },
};

export const perkFor = (family: string): Perk => PERKS[family] ?? PERKS.Skeleton;
