export type Bip44Path = {
  account: number;
  change: number;
  index: number;
};

export type Zip32Path = {
  account: number;
  index?: number;
};
/**
 * Return a properly formatted BIP-044 path
 * @param coinType - SLIP-044 Coin designation
 * @param bip44Path - path object
 * @param [fullPath] - boolean to determine whether to show full path or just path components
 * @returns BIP-044 path
 */
export const makeBip44Path = (
  coinType: number,
  bip44Path: Bip44Path,
  fullPath = true,
): string => {
  const prefix = `m/44'/${coinType}'`;
  const { account, change = 0, index = 0 } = bip44Path;
  const path = `/${account}'/${change}'/${index}'`;
  return fullPath ? `${prefix}${path}` : `${path}`;
};

/**
 * Return a properly formatted Sapling path (Zip32)
 * @param coinType - SLIP-044 Coin designation
 * @param zip32Path - zip32 path object
 * @param [fullPath] - boolean to determine whether to show full path or just path components
 * @returns Sapling path
 */
export const makeSaplingPath = (
  coinType: number,
  zip32Path: Zip32Path,
  fullPath = true,
): string => {
  const { account, index } = zip32Path;
  const prefix = `m/32'/${coinType}'`;
  let path = `/${account}'`;
  if (typeof index === "number") path += `/${index}`;
  return fullPath ? `${prefix}${path}` : path;
};
