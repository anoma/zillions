import { createContext } from "react";
import type { Wallet } from "../lib/wallet/wallet";

export const WalletContext = createContext<Wallet | undefined>(undefined);
