import type { DeviceKind } from "../../ipc/contract";

export type AccountSource = "imported" | "generated";

/** Plaintext secret material before encryption into the vault. */
export type SensitiveAccountStoreData = { text: string; passphrase?: string };

/**
 * Which hardware wallet a record's keys live on, if any. Records written
 * before the field existed say it with the legacy `"ledger"` type instead.
 */
export const deviceOf = (record: {
  device?: string;
  type: string;
}): DeviceKind | undefined =>
  (record.device as DeviceKind | undefined) ??
  (record.type === "ledger" ? "ledger" : undefined);
