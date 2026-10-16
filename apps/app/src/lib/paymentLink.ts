// Payment links: product.md 2.10, docs/design/payment-links.md.
import { MEMO_BYTES, utf8Length } from "./memo";

/** Paid along with the link, so the claimer receives exactly its amount. */
export const CLAIM_FEE = 10_000n;

// The link's memo carries a 17-byte header (0xFF, "PAYLINK", version, r₁, r₂)
// before the description.
export const DESCRIPTION_BYTES = MEMO_BYTES - 17;

export function descriptionProblem(description: string) {
  return utf8Length(description) > DESCRIPTION_BYTES
    ? "Description is too long"
    : undefined;
}
