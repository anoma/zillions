import { createContext } from "react";

export const SetNavEnabledContext = createContext<(enabled: boolean) => void>(
  () => {},
);
