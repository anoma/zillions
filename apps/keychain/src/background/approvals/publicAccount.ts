/**
 * Map a stored vault record onto the public, dapp-facing account shape.
 * Only the site's current wallet and its children carry key material
 * (shielded accounts expose their UFVK as `viewingKey`); any other account is
 * listed by identity alone, so a site cannot scan or link the others.
 */
import { AccountType, ZCashKeychainAccount } from "@zillions/types";

import type { KeyStoreType } from "../../storage";

export const toPublicAccount = (
  record: KeyStoreType,
  withKeys: boolean
): ZCashKeychainAccount => {
  const { id, alias, address, parentId, owner } = record;

  const account: ZCashKeychainAccount = { id, alias, address, parentId };
  if (!withKeys) {
    return account;
  }

  account.hdIndex = record.path.account;
  account.seedFingerprint = record.seedFingerprint;
  account.birthday = record.birthday;

  if (record.type === AccountType.ShieldedKeys) {
    account.viewingKey = owner;
  }

  return account;
};
