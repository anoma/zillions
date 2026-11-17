/**
 * Resolve the network string ("main" | "test") from the build env
 * (`Z_INTERFACE_ZCASH_CHAIN_ID` like "zcash.testnet"), defaulting to mainnet.
 */
export const getNetwork = (): "main" | "test" => {
  const chainId = process.env.Z_INTERFACE_ZCASH_CHAIN_ID ?? "";
  return chainId.toLowerCase().includes("test") ? "test" : "main";
};
