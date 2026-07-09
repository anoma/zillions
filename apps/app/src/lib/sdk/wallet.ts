import type { SyncProgress } from "@zillions/sdk";
import {
  awaitProverParams,
  Pczt,
  SeedFingerprint,
  syncWallet,
  TransactionHistoryResponse,
  WalletSummary,
  WebWallet,
} from "@zillions/sdk";
import { db } from "../db";
import { dedupe } from "../utils";

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    parseInt(hex.substring(i * 2, i * 2 + 2), 16),
  );

type Network = "main" | "test";

type SummaryAccountBalances = Array<
  [
    number, // account id
    {
      sapling_balance: number;
      orchard_balance: number;
      unshielded_balance: number;
      pending_change: number;
      pending_spendable: number;
    },
  ]
>;

type Transaction = {
  txid: string;
  tx_type: "Received" | "Sent" | "Shield" | "Unshield" | "Shielded";
  value: bigint;
  fee: bigint;
  block_height: number;
  confirmations: number;
  status: "Confirmed" | "Pending" | "Expired";
  memo: string | undefined;
  timestamp: number;
  pool: "orchard" | "sapling" | "transparent" | "mixed";
  to_address: string | undefined;
  from_address: string | undefined;
};

const defaultNetwork: Network = import.meta.env.VITE_ZCASH_NETWORK ?? "main";
const minConfirmationsTrusted = 3;
const minConfirmationsUntrusted = 10;

export class SdkWallet {
  public id: string;
  private accountId: number;
  private wallet: WebWallet;

  private syncProgressListeners = new Set<(progress: SyncProgress) => void>();

  static async build({
    id,
    ufvk,
    birthday,
    seedFingerprint,
    hdIndex,
    network = defaultNetwork,
    lightwalletdUrl = import.meta.env.VITE_GRPC_WEB_GATEWAY_URL,
  }: {
    id: string;
    ufvk: string;
    birthday: number;
    seedFingerprint: string;
    hdIndex: number;
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

    let accountId: number;
    if (!bytes) {
      const fp = SeedFingerprint.from_bytes(hexToBytes(seedFingerprint));
      // create_account_ufvk takes ownership of fp — do NOT call fp.free().
      accountId = await wallet.create_account_ufvk(
        id,
        ufvk,
        fp,
        hdIndex,
        birthday,
      );
    } else {
      // Restoring from cache: the account already exists; read its ID from
      // the wallet summary rather than re-creating it.
      const summary = await wallet.get_wallet_summary();
      const balances = summary?.account_balances as
        | SummaryAccountBalances
        | undefined;
      accountId = balances?.[0]?.[0] ?? 0;
      summary?.free();
    }

    return new SdkWallet({ id, wallet, accountId });
  }

  constructor({
    id,
    wallet,
    accountId,
  }: {
    id: string;
    wallet: WebWallet;
    accountId: number;
  }) {
    this.id = id;
    this.wallet = wallet;
    this.accountId = accountId;
  }

  /** Subscribe to per-batch sync progress; returns an unsubscribe function. */
  subscribeSyncProgress(listener: (progress: SyncProgress) => void) {
    this.syncProgressListeners.add(listener);
    return () => {
      this.syncProgressListeners.delete(listener);
    };
  }

  sync = dedupe(async () => {
    await syncWallet(this.wallet, {
      onProgress: (progress) =>
        this.syncProgressListeners.forEach((listener) => listener(progress)),
      // Checkpoints persist scan progress across page refreshes: the wallet
      // is restored from these bytes and resumes where it left off.
      onCheckpoint: async (bytes) => {
        await db.set("wallets", this.id, bytes);
      },
    });
  });

  private updateWalletCache = dedupe(async () => {
    try {
      const bytes = await this.wallet.db_to_bytes();
      await db.set("wallets", this.id, bytes);
    } catch (e) {
      console.error("Failed to save wallet cache to IndexedDB", e);
    }
  });

  async getBalance() {
    let summary: WalletSummary | undefined;
    try {
      summary = await this.wallet.get_wallet_summary();
      const totalBalance = {
        orchardBalance: 0n,
        pendingChange: 0n,
        pendingSpendable: 0n,
        saplingBalance: 0n,
        unshieldedBalance: 0n,
      };

      (summary?.account_balances as SummaryAccountBalances).forEach(
        ([, balance]) => {
          totalBalance.orchardBalance += BigInt(balance.orchard_balance);
          totalBalance.pendingChange += BigInt(balance.pending_change);
          totalBalance.pendingSpendable += BigInt(balance.pending_spendable);
          totalBalance.saplingBalance += BigInt(balance.sapling_balance);
          totalBalance.unshieldedBalance += BigInt(balance.unshielded_balance);
        },
      );
      return totalBalance;
    } finally {
      summary?.free();
    }
  }

  // TODO implement pagination
  async getTransactionHistory() {
    let summary: WalletSummary | undefined;
    let histories: TransactionHistoryResponse[] = [];
    try {
      summary = await this.wallet.get_wallet_summary();
      histories = await Promise.all(
        (summary?.account_balances as SummaryAccountBalances).map(([id]) =>
          this.wallet.get_transaction_history(id),
        ),
      );
      return histories
        .flatMap((r) => r.transactions)
        .map(
          (t) =>
            ({
              ...t,
              value: BigInt(t.value),
              fee: BigInt(t.fee ?? 0),
            }) as Transaction,
        );
    } finally {
      summary?.free();
      histories.forEach((r) => r.free());
    }
  }

  /** Prepare a transfer spending shielded funds; `to` may be shielded or transparent. */
  async prepareTransferFromShielded(to: string, amount: bigint): Promise<Pczt> {
    await this.sync();
    return this.wallet.pczt_create_from_shielded(this.accountId, to, amount);
  }

  /** Prepare a transfer spending transparent funds; `to` may be shielded or transparent. */
  async prepareTransferFromTransparent(
    to: string,
    amount: bigint,
  ): Promise<Pczt> {
    await this.sync();
    return this.wallet.pczt_create_from_transparent(this.accountId, to, amount);
  }

  /** Prepare a shielding PCZT; sweeps all transparent funds, or at least `amount` when given. */
  async prepareShield(amount?: bigint): Promise<Pczt> {
    await this.sync();
    return this.wallet.pczt_shield(this.accountId, amount);
  }

  async submitTransfer(signedPczt: Pczt): Promise<void> {
    await awaitProverParams();
    const provedPczt = await this.wallet.pczt_prove(signedPczt);
    await this.wallet.pczt_send(provedPczt);
    this.updateWalletCache();
  }

  free() {
    this.wallet.free();
  }
}
