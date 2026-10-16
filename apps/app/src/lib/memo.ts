export const MEMO_BYTES = 512;

export function utf8Length(text: string) {
  return new TextEncoder().encode(text).length;
}

/** Why `memo` can't go in a send to this recipient, if it can't. */
export function memoProblem(memo: string, toTransparent: boolean) {
  if (!memo) return undefined;
  if (toTransparent) return "Transparent addresses can't receive messages";
  if (utf8Length(memo) > MEMO_BYTES) return "Message is too long";
  return undefined;
}
