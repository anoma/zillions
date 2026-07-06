/**
 * Downloads (or restores from IndexedDB) the Sapling proving parameters and
 * installs them into the wasm. Idempotent: concurrent and repeat calls share
 * one in-flight promise; a failed attempt can be retried by calling again.
 *
 * Must be called after the wallet wasm module has been initialized.
 *
 * @param baseUrl Base URL to fetch the .params files from. Defaults to the
 *   files served out of @zillions-sdk/sapling-params.
 */
export declare function loadProverParams(baseUrl?: string): Promise<void>;

/** Returns whether the params are already installed in the wasm. */
export declare function proverParamsLoaded(): boolean;
