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
import type {
  Network,
  SummaryAccountBalances,
  TransactionReceipt,
} from "./types";

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    parseInt(hex.substring(i * 2, i * 2 + 2), 16),
  );

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
    const newWallet = (bytes?: Uint8Array) =>
      new WebWallet(
        network,
        lightwalletdUrl,
        minConfirmationsTrusted,
        minConfirmationsUntrusted,
        bytes,
      );

    let wallet: WebWallet | undefined;
    let accountId: number | undefined;

    // Restore from cache; corrupt bytes or a bad account state fall through to a blank rebuild.
    try {
      const cached = await db.get("wallets", id);
      wallet = newWallet(cached);

      // Local-only read: reuse the existing account, treating more than one as corrupt state.
      const summary = await wallet.get_wallet_summary();
      const balances = summary?.account_balances as
        | SummaryAccountBalances
        | undefined;
      summary?.free();
      if (balances && balances.length > 1) {
        throw new Error(`Wallet cache holds ${balances.length} accounts`);
      } else {
        accountId = balances?.[0]?.[0];
      }
    } catch (e) {
      console.error("Failed to restore wallet from cache; rebuilding.", e);
      await db.del("wallets", id);
      wallet?.free();
      wallet = undefined;
      accountId = undefined;
    }

    if (!wallet) {
      wallet = newWallet();
    }
    if (accountId === undefined) {
      const fp = SeedFingerprint.from_bytes(hexToBytes(seedFingerprint));
      accountId = await wallet.create_account_ufvk(
        id,
        ufvk,
        fp,
        hdIndex,
        birthday,
      );
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
            }) as TransactionReceipt,
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

  async submitTransfer(
    signedPczt: Pczt,
  ): Promise<{ txid: string; fee: bigint }> {
    await awaitProverParams();
    const provedPczt = await this.wallet.pczt_prove(signedPczt);
    const fee = provedPczt.fee();
    const txid = await this.wallet.pczt_send(provedPczt);
    this.updateWalletCache();
    return { txid, fee };
  }

  free() {
    this.wallet.free();
  }
}
