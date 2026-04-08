import crypto from "crypto";

const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateShortInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    const randomByte = crypto.randomInt(0, INVITE_CODE_CHARS.length);
    code += INVITE_CODE_CHARS[randomByte];
  }
  return code;
}
