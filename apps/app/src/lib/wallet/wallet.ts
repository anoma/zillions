import { WebWallet } from "@chainsafe/webzjs-wallet";
import { db } from "../db";
import { dedupe } from "../utils";

type Network = "main" | "test";

const lightwalletdUrl = import.meta.env.VITE_GRPC_WEB_GATEWAY_URL;

const defaultNetwork: Network = "main";
const minConfirmationsTrusted = 10;
const minConfirmationsUntrusted = 10;

export class Wallet {
  private name: string;
  private wallet: () => Promise<WebWallet>;

  constructor({
    name,
    ufvk,
    birthday,
    network = defaultNetwork,
  }: {
    name: string;
    ufvk: string;
    birthday: number;
    network?: Network;
  }) {
    this.name = name;

    this.wallet = async () => {
      const bytes = await db.get("wallets", name);
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
        await wallet.create_account_view_ufvk(name, ufvk, birthday);
      }
      return wallet;
    };
  }

  sync = dedupe(async () => {
    const wallet = await this.wallet();
    await wallet.sync();
    try {
      const bytes = await wallet.db_to_bytes();
      await db.set("wallets", this.name, bytes);
    } catch (e) {
      console.error("Failed to save wallet cache to IndexedDB", e);
    }
    this._logSummary();
  });

  getBalances = dedupe(
    async (): Promise<{
      orchardBalance: number;
      pendingChange: number;
      pendingSpendable: number;
      saplingBalance: number;
      unshieldedBalance: number;
    }> => {
      const wallet = await this.wallet();
      await this.sync();
      const summary = await wallet.get_wallet_summary();
      const totalBalance = {
        orchardBalance: 0,
        pendingChange: 0,
        pendingSpendable: 0,
        saplingBalance: 0,
        unshieldedBalance: 0,
      };
      if (!summary) {
        console.error("No wallet summary");
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
    },
  );

  private async _logSummary(): Promise<void> {
    const wallet = await this.wallet();
    const summary = await wallet.get_wallet_summary();
    if (summary) {
      console.log("Wallet summary", {
        chainTipHeight: summary.chain_tip_height,
        fullyScannedHeight: summary.fully_scanned_height,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accounts: summary.account_balances.map(([id, balance]: any) => ({
          id,
          ...balance,
        })),
      });
      summary.free();
    } else {
      console.log("No wallet summary");
    }

    // TODO is ID always 1 if the wallet contains only one account?
    const id = 1;
    console.log("get_current_address", await wallet.get_current_address(id));
    console.log(
      "get_current_address_transparent",
      await wallet.get_current_address_transparent(id),
    );
    console.log(
      "get_transaction_history",
      (await wallet.get_transaction_history(id)).toJSON(),
    );
    console.log(
      "get_wallet_summary",
      (await wallet.get_wallet_summary())?.toJSON(),
    );
  }
}
