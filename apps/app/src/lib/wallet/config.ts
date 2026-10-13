export const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";
export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;
export const LIGHTWALLETD_URL = import.meta.env.VITE_GRPC_URL;
/** Each pool's first chunk from about a year before this build: where setup ends. */
export const SETUP_CHUNKS = __SETUP_CHUNKS__;
