import { createContext } from "react";
import type { ZWallet } from "../lib/zcrawler/ZWallet";

export const WalletContext = createContext<ZWallet | undefined>(undefined);
