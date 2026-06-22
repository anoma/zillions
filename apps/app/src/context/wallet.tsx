import { createContext } from "react";
import type { SdkWallet } from "../lib/sdk/wallet";

export const WalletContext = createContext<SdkWallet | undefined>(undefined);
