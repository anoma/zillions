/**
 * Map a stored vault record onto the public, dapp-facing account shape.
 * Only ever called for the site's own wallet and its children. No account
 * carries its viewing key: sites ask the Keychain to use it instead.
 */
import { ZCashKeychainAccount } from "@zillions/types";

import type { KeyStoreType } from "../../storage";

export const toPublicAccount = (record: KeyStoreType): ZCashKeychainAccount => {
  const { id, alias, address, parentId } = record;
  return {
    id,
    alias,
    address,
    parentId,
    hdIndex: record.path.account,
    seedFingerprint: record.seedFingerprint,
    birthday: record.birthday,
  };
};
