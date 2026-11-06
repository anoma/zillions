/**
 * The passkey consensus constants: the values every derived account's seed
 * depends on. They live alone in this zero-import module so the build
 * (`wxt.config.ts`) and the runtime (`passkey-core.ts`) share one source —
 * the manifest's host permission is DERIVED from `RP_ID` here, so the
 * manifest cannot drift from what the ceremonies claim.
 *
 * CONSENSUS-CRITICAL once any passkey account exists: changing `RP_ID`
 * re-scopes every credential (a synced passkey is only usable under the
 * RP it was created for) and changing `PRF_SALT` turns every passkey
 * account into a different wallet. Either edit is a migration, not a fix.
 * The pin tests in `passkey-constants.test.ts` fail on a silent edit.
 */

/** The RP every passkey ceremony runs under: a dedicated subdomain of the
 * product site. Nothing is ever served from it — no DNS record, no
 * catch-all — so no web page can claim it: an RP ID must be a registrable
 * domain suffix of the caller's origin, and a child of `zillions.money` is
 * never a suffix of it. The extension claims it from its pages via the
 * manifest's host permissions (Chrome 122+, Firefox 150+). */
export const RP_ID = "keychain.zillions.money";

export const RP_NAME = "Zillions";

/**
 * PRF salt: a passkey account's seed is PRF("zillions/zcash-seed/v1").
 * Domain-separated and fixed.
 */
export const PRF_SALT = new TextEncoder().encode("zillions/zcash-seed/v1");

/** The host permission that claims the RP: derived, never duplicated. */
export const rpHostPermissions = (rpId: string): string[] => [
  `https://${rpId}/*`,
];
