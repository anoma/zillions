export type ZillionsKeychain = {
  isConnected: () => Promise<boolean>;
  connect: () => Promise<void>;
};

declare global {
  interface Window {
    zc?: ZillionsKeychain;
  }
}
