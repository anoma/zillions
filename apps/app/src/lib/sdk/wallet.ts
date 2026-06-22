import { WebWallet } from "@chainsafe/webzjs-wallet";
import { db } from "../db";
import { dedupe } from "../utils";

type Network = "main" | "test";

const defaultNetwork: Network = "main";
const minConfirmationsTrusted = 10;
const minConfirmationsUntrusted = 10;

export class SdkWallet {
  private id: string;
  private wallet: WebWallet;

  static async build({
    id,
    ufvk,
    birthday,
    network = defaultNetwork,
    lightwalletdUrl = import.meta.env.VITE_GRPC_WEB_GATEWAY_URL,
  }: {
    id: string;
    ufvk: string;
    birthday: number;
    network?: Network;
    lightwalletdUrl?: string;
  }): Promise<SdkWallet> {
    const bytes = await db.get("wallets", id);
    const wallet = new WebWallet(
      network,
      lightwalletdUrl,
      minConfirmationsTrusted,
      minConfirmationsUntrusted,
      bytes,
    );
    // Skip create_account when restoring from cache — the account already
    // exists in the bytes. Calling it again would add a duplicate account.
    if (!bytes) {
      await wallet.create_account_view_ufvk(id, ufvk, birthday);
    }
    return new SdkWallet({ id, wallet });
  }

  constructor({ id, wallet }: { id: string; wallet: WebWallet }) {
    this.id = id;
    this.wallet = wallet;
  }

  sync = dedupe(async () => {
    await this.wallet.sync();
    this.updateWalletCache();
  });

  updateWalletCache = dedupe(async () => {
    try {
      const bytes = await this.wallet.db_to_bytes();
      await db.set("wallets", this.id, bytes);
    } catch (e) {
      console.error("Failed to save wallet cache to IndexedDB", e);
    }
  });

  async getBalance() {
    const summary = await this.wallet.get_wallet_summary();
    const totalBalance = {
      orchardBalance: 0,
      pendingChange: 0,
      pendingSpendable: 0,
      saplingBalance: 0,
      unshieldedBalance: 0,
    };
    if (!summary) {
      console.error("Wallet summary is undefined");
      return totalBalance;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary.account_balances.forEach(([, balance]: any) => {
      totalBalance.orchardBalance += balance.orchard_balance;
      totalBalance.pendingChange += balance.pending_change;
      totalBalance.pendingSpendable += balance.pending_spendable;
      totalBalance.saplingBalance += balance.sapling_balance;
      totalBalance.unshieldedBalance += balance.unshielded_balance;
    });
    summary.free();
    return totalBalance;
  }
}
