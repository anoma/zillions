import { WebWallet } from '@chainsafe/webzjs-wallet'
import { dedupe, singleton } from './utils'

const lightwalletdUrl = import.meta.env.VITE_GRPC_WEB_GATEWAY_URL
const seedPhrase = import.meta.env.VITE_WALLET_SEED_PHRASE
const birthdayHeight = import.meta.env.VITE_WALLET_BIRTHDAY_HEIGHT

const accountId = 'default'

const DB_NAME = 'zillions-wallet'
const DB_VERSION = 1
const STORE_NAME = 'wallet-bytes'

function openWalletDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadAccount(key: string): Promise<Uint8Array | undefined> {
  const db = await openWalletDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result ?? undefined)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

async function saveAccount(key: string, bytes: Uint8Array): Promise<void> {
  const db = await openWalletDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(bytes, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

class ZillionsWallet {
  getWallet = singleton(async () => {
    const bytes = await loadAccount(accountId)
    const wallet = new WebWallet('main', lightwalletdUrl, 1, 1, bytes)
    // Skip create_account when restoring from cache — the account already
    // exists in the bytes. Calling it again (e.g. after a Vite HMR refresh)
    // would add a duplicate account.
    if (!bytes) {
      await wallet.create_account(accountId, seedPhrase, 0, birthdayHeight)
    }
    return wallet
  })

  sync = dedupe(async () => {
    const wallet = await this.getWallet()
    await wallet.sync()
    try {
      const bytes = await wallet.db_to_bytes()
      await saveAccount(accountId, bytes)
    } catch (e) {
      console.error('Failed to save wallet cache to IndexedDB', e)
    }
    this._logSummary()
  })

  getBalances = dedupe(
    async (): Promise<{
      orchardBalance: number
      pendingChange: number
      pendingSpendable: number
      saplingBalance: number
      unshieldedBalance: number
    }> => {
      const wallet = await this.getWallet()
      await this.sync()
      const summary = await wallet.get_wallet_summary()
      const totalBalance = {
        orchardBalance: 0,
        pendingChange: 0,
        pendingSpendable: 0,
        saplingBalance: 0,
        unshieldedBalance: 0,
      }
      if (!summary) {
        console.error('No wallet summary')
        return totalBalance
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summary.account_balances.forEach(([_id, balance]: any) => {
        totalBalance.orchardBalance += balance.orchard_balance
        totalBalance.pendingChange += balance.pending_change
        totalBalance.pendingSpendable += balance.pending_spendable
        totalBalance.saplingBalance += balance.sapling_balance
        totalBalance.unshieldedBalance += balance.unshielded_balance
      })
      summary.free()
      return totalBalance
    }
  )

  private async _logSummary(): Promise<void> {
    const wallet = await this.getWallet()
    const summary = await wallet.get_wallet_summary()
    if (summary) {
      console.log('Wallet summary', {
        chainTipHeight: summary.chain_tip_height,
        fullyScannedHeight: summary.fully_scanned_height,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accounts: summary.account_balances.map(([id, balance]: any) => ({
          id,
          ...balance,
        })),
      })
      summary.free()
    } else {
      console.log('No wallet summary')
    }
  }
}

export const zillionsWallet = new ZillionsWallet()
