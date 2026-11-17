/**
 * Map a stored vault record onto the public, dapp-facing account shape.
 * Only the site's current wallet and its children carry their ZIP-32 details;
 * any other account is listed by identity alone. No account carries its
 * viewing key: sites ask the Keychain to use it instead.
 */
import { ZCashKeychainAccount } from "@zillions/types";

import type { KeyStoreType } from "../../storage";

export const toPublicAccount = (
  record: KeyStoreType,
  withKeys: boolean
): ZCashKeychainAccount => {
  const { id, alias, address, parentId } = record;

  const account: ZCashKeychainAccount = { id, alias, address, parentId };
  if (!withKeys) {
    return account;
  }

  account.hdIndex = record.path.account;
  account.seedFingerprint = record.seedFingerprint;
  account.birthday = record.birthday;

  return account;
};
