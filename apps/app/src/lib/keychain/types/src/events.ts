// Constants defining events which may be subscribed to

// Zillions Keychain (zc) extension events
export enum Events {
  AccountChanged = "zc-account-changed",
  NetworkChanged = "zc-network-changed",
  ExtensionLocked = "zc-extension-locked",
  ExtensionUnlocked = "zc-extension-unlocked",
  ConnectionRevoked = "zc-connection-revoked",
}
