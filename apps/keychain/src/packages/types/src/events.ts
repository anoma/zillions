// Constants defining events which may be subscribed to

// Zillions Keychain (zc) extension events
export const Events = {
  AccountChanged: "zc-account-changed",
  NetworkChanged: "zc-network-changed",
  ExtensionLocked: "zc-extension-locked",
  ExtensionUnlocked: "zc-extension-unlocked",
  ConnectionRevoked: "zc-connection-revoked",
  /** A transaction the site asked for reached a proving step; `detail` names it. */
  ProveStage: "zc-prove-stage",
} as const;

export type Events = (typeof Events)[keyof typeof Events];
