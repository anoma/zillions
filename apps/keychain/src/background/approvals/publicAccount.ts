/**
 * Map a stored vault record onto the public, dapp-facing account shape:
 * shielded accounts expose their UFVK as `viewingKey`.
 */
import { AccountType, ZCashKeychainAccount } from "@zillions/types";

import type { KeyStoreType } from "../../storage";

export const toPublicAccount = (record: KeyStoreType): ZCashKeychainAccount => {
  const { id, alias, address, parentId, owner } = record;
  const type = record.type as AccountType;

  const account: ZCashKeychainAccount = {
    id,
    alias,
    address,
    parentId,
    type,
    hdIndex: record.path.account,
    seedFingerprint: record.seedFingerprint,
    birthday: record.birthday,
  };

  if (type === AccountType.ShieldedKeys) {
    account.viewingKey = owner;
    account.source = record.source as ZCashKeychainAccount["source"];
    account.timestamp = record.timestamp;
  }

  return account;
};
