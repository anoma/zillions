import extensionPackage from "../../package.json";

export const KEYCHAIN_VERSION = extensionPackage.version;

/** Build commit, when the build was given one. */
export const REVISION = process.env.Z_INTERFACE_REVISION ?? "";
