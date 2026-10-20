import Transport from "@ledgerhq/hw-transport";
import TransportUSB from "@ledgerhq/hw-transport-webusb";
import {
  GetFullViewingKeyDAReturnType,
  SignerZcashBuilder,
} from "@ledgerhq/device-signer-kit-zcash";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";
import {
  ConsoleLogger,
  DeviceManagementKit,
  DeviceManagementKitBuilder,
} from "@ledgerhq/device-management-kit";
// import semver from "semver";
import { randomUUID } from "crypto";
import { makeBip44Path, makeSaplingPath } from "./path";
import { DefaultSignerZcash } from "@ledgerhq/device-signer-kit-zcash/internal/DefaultSignerZcash.js";
import { GetAddressDAReturnType } from "@ledgerhq/device-signer-kit-zcash/api/app-binder/GetAddressDeviceActionTypes.js";
import { SignMessageDAReturnType } from "@ledgerhq/device-signer-kit-zcash/api/app-binder/SignMessageDeviceActionTypes.js";

export type LedgerAddressAndPublicKey = { address: string; publicKey: string };
export type LedgerViewingKey = {
  ufvk: Uint8Array;
};

export const LEDGER_ZCASH_MIN_VERSION = "3.0.0";
export const LEDGER_ZCASH_BLACKLISTED = ["nanoS"];
const coinType = 133;
/**
 * Initialize USB transport
 * @async
 * @returns Transport object
 */
export const initLedgerUSBTransport = async (): Promise<Transport> => {
  return await TransportUSB.create();
};

/**
 * Returns a list of ledger devices
 * @async
 * @returns List of USB devices
 */
export const ledgerUSBList = async (): Promise<USBDevice[]> => {
  return await TransportUSB.list();
};

/**
 * Request ledger device - opens a popup to request the user to connect a ledger device
 * @async
 * @returns Transport object
 */
export const requestLedgerDevice = async (): Promise<TransportUSB> => {
  return await TransportUSB.request();
};

export const DEFAULT_LEDGER_BIP44_PATH = makeBip44Path(coinType, {
  account: 0,
  change: 0,
  index: 0,
});

export const DEFAULT_LEDGER_ZIP32_PATH = makeSaplingPath(coinType, {
  account: 0,
});

/**
 * Functionality for interacting with Zcash app on Ledger Hardware Wallets
 */
export class Ledger {
  /**
   * @param signer - Inititalized Zcash signer
   * @param dmk - Inititalized Device Management Kit
   */
  private constructor(
    public readonly signer: DefaultSignerZcash,
    public readonly dmk: DeviceManagementKit,
  ) {}

  /**
   * Initialize and return Ledger class instance with initialized Transport
   * @returns Ledger class instance
   */
  static init(): Ledger {
    try {
      const dmk = new DeviceManagementKitBuilder()
        .addLogger(new ConsoleLogger())
        .addTransport(webHidTransportFactory)
        .build();
      const sessionId = randomUUID();
      const signerZcash = new SignerZcashBuilder({ dmk, sessionId }).build();
      const ledger = new Ledger(signerZcash, dmk);
      return ledger;
    } catch (e) {
      throw new Error(`${e}`);
    }
  }

  /**
   * Get address and public key associated with optional path, otherwise, use default path
   * Throw exception if app is not initialized.
   * @param [path] Bip44 path for deriving key
   * @returns Address and public key
   */
  public getAddress(
    path: string = DEFAULT_LEDGER_BIP44_PATH,
  ): GetAddressDAReturnType {
    const address = this.signer.getAddress(path);
    return address;
  }

  /**
   * Prompt user to get viewing key associated with optional path, otherwise, use default path.
   * Throw exception if app is not initialized, zip32 is not supported, or key is not returned.
   * @async
   * @param [path] Zip32 path for deriving key
   * @returns ShieldedKeys
   */
  public async getViewingKey(
    path: string = DEFAULT_LEDGER_ZIP32_PATH,
  ): Promise<GetFullViewingKeyDAReturnType> {
    try {
      // await this.validateZcashSupport();

      return this.signer.getFullViewingKey(path);
    } catch (e) {
      throw new Error(`${e}`);
    }
  }

  /**
   * Sign tx bytes with the key associated with the provided (or default) path.
   * Throw exception if app is not initialized.
   * @param msg - tx data blob to sign
   * @param [path] Bip44 path for signing account
   * @returns Response signature
   */
  public sign(
    msg: Uint8Array,
    path: string = DEFAULT_LEDGER_BIP44_PATH,
  ): SignMessageDAReturnType {
    const buffer = Buffer.from(msg);

    return this.signer.signMessage(path, buffer);
  }

  /**
   * Close the initialized transport, which may be needed if Ledger needs to be reinitialized due to error state
   * Throw exception if app is not initialized.
   * @async
   * @returns void
   */
  public closeTransport(): void {
    return this.dmk.close();
  }

  /**
   * Check if Zcash app is supported by the installed app's version.
   * Throws error if app is not initialized
   * @async
   * @returns boolean
   */
  // TODO: Implement status
  // public async isZcashSupported(): Promise<boolean> {
  //   const {
  //     info: { appVersion },
  //     deviceId,
  //   } = await this.status();
  //   const isSupportedVersion = !semver.lt(appVersion, LEDGER_ZCASH_MIN_VERSION);
  //   const isSupportedDevice = deviceId !== LEDGER_ZCASH_BLACKLISTED;
  //
  //   return isSupportedVersion && isSupportedDevice;
  // }

  /**
   * Validate the version against the minimum required version and
   * device type for Zip32 functionality.
   * Throw error if it is unsupported or app is not initialized.
   * @async
   * @returns void
   */
  // TODO: Implement status
  // private async validateZcashSupport(): Promise<void> {
  //   if (!(await this.isZcashSupported())) {
  //     const {
  //       info: { appVersion },
  //       deviceId,
  //       deviceName,
  //     } = await this.status();
  //
  //     if (deviceId === LEDGER_ZCASH_BLACKLISTED) {
  //       throw new Error(`This method is not supported on ${deviceName}!`);
  //     }
  //
  //     throw new Error(
  //       `Version ${appVersion} is unsupported! ` +
  //         `Please update to at least ${LEDGER_ZCASH_MIN_VERSION}!`,
  //     );
  //   }
  // }
}
