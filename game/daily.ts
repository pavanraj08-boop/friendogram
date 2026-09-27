import { decodeSpriteBitmap } from "@rarefriends/friendsdk/sprites";
import type { Picture } from "./nonogram";

/**
 * Friend of the Day: 18 hand-picked hardwired Generations Friends (two per family). Their canonical
 * front-facing idle frame (Colossus: side frame) was read once from the on-chain families registry
 * (frames(family, seed), 2026-09-27) and is embedded here, so the game never reads other token IDs
 * at runtime and never scans the collection. Everyone gets the same Friend on the same UTC day.
 */
export const DAILY_FRIENDS: readonly { tokenId: bigint; family: string; bitmap: bigint }[] = [
  { tokenId: 334803n, family: "Skeleton", bitmap: 0x0000066006600ff00ff003c003c00ff019981ff807e006600420000000000000n },
  { tokenId: 334809n, family: "Mask", bitmap: 0x000006600660066007e00e700ff00ff00ff007e0018007e00e700db007e00000n },
  { tokenId: 334830n, family: "Family", bitmap: 0x00000e700e7007e00ff00ff007e006600ff00ff01db807e00660066006600000n },
  { tokenId: 334821n, family: "Cellular", bitmap: 0x00000660066007e00ff00ff007e00180018007e005a005a007e005a004200000n },
  { tokenId: 334812n, family: "Asymmetry", bitmap: 0x00001818181818181ff81ff81c381c381ff80ff80db00db007e0000000000000n },
  { tokenId: 334890n, family: "Hoverer", bitmap: 0x00000ff0000000000240024007e007e003c003c01ff817e81ff8181810080000n },
  { tokenId: 334294n, family: "Colossus", bitmap: 0x00000f0f07070707070707ff07ff07ff07fe07fc06affc013c003c0024003c00n },
  { tokenId: 334845n, family: "Sparkling", bitmap: 0x00000c300c300c303ffc1ff81ff81ff803c0066025a477ea23c406600c300000n },
  { tokenId: 334800n, family: "Hollow", bitmap: 0x00000c300c301c3817e810081ff801800ff008100a5008100ff006600c300000n },
  { tokenId: 334878n, family: "Skeleton", bitmap: 0x0000024002400240024003c003c003c003c003c003c003c01ff817e83ffc0000n },
  { tokenId: 334899n, family: "Mask", bitmap: 0x00000e70066007e007e007e00ff00ff00ff007e01ff81db81db80ff00c300000n },
  { tokenId: 334881n, family: "Family", bitmap: 0x0000066006600ff00ff00ff007e007e00ff019980ff007e00420042004200000n },
  { tokenId: 334884n, family: "Cellular", bitmap: 0x00000660024002400ff01ff81ff803c007e00db00ff00ff00810081000000000n },
  { tokenId: 334896n, family: "Asymmetry", bitmap: 0x00000660066007e007b007f807e8018803c00ff0099009900ff00c300c300000n },
  { tokenId: 334182n, family: "Hoverer", bitmap: 0x00000ff000000000124812481ff81ff81ff80ff009900ff007e0024002400000n },
  { tokenId: 335106n, family: "Colossus", bitmap: 0x00001eae0cac0cac0fff0fff0fff0ffe0ffc0c060c03f8013800f800c800f800n },
  { tokenId: 334483n, family: "Sparkling", bitmap: 0x00001a580a500a520ff507e20ff027e453ce218407e00ff00ff00db007e00000n },
  { tokenId: 334887n, family: "Hollow", bitmap: 0x00000240024006600ff00c3007e0018007e00c3008100a500a5008100ff00000n },
];

export function dailyFor(now: Date = new Date()) {
  const key = now.toISOString().slice(0, 10);
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  const pick = DAILY_FRIENDS[((day % DAILY_FRIENDS.length) + DAILY_FRIENDS.length) % DAILY_FRIENDS.length];
  const picture: Picture = decodeSpriteBitmap(pick.bitmap).rows;
  return { key, number: day - 20_722, tokenId: pick.tokenId, family: pick.family, picture };
}
