/**
 * Map a stored vault record onto the public, dapp-facing account shape.
 * Only the active account and its children carry key material (shielded
 * accounts expose their UFVK as `viewingKey`); any other account is listed by
 * identity alone, so a site connected while one wallet is active cannot scan
 * or link the others.
 */
import { AccountType, ZCashKeychainAccount } from "@zillions/types";

import { deviceOf } from "../keyring/types";
import type { KeyStoreType } from "../../storage";

export const toPublicAccount = (
  record: KeyStoreType,
  withKeys: boolean
): ZCashKeychainAccount => {
  const { id, alias, address, parentId, owner } = record;
  const type = record.type as AccountType;

  const account: ZCashKeychainAccount = { id, alias, address, parentId, type };
  if (!withKeys) {
    return account;
  }

  account.hdIndex = record.path.account;
  account.seedFingerprint = record.seedFingerprint;
  account.birthday = record.birthday;
  account.device = deviceOf(record);

  if (type === AccountType.ShieldedKeys) {
    account.viewingKey = owner;
    account.source = record.source as ZCashKeychainAccount["source"];
    account.timestamp = record.timestamp;
  }

  return account;
};
