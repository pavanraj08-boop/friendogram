export * as N from "./nonogram";
export { RELICS } from "./relics";
export { DAILY_FRIENDS } from "./daily";
import { decodeSpriteBitmap } from "@rarefriends/friendsdk/sprites";
export const decode = (b: bigint) => decodeSpriteBitmap(b).rows;
