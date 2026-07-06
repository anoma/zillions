/**
 * Login gate for approval screens: renders children once the vault is
 * unlocked, the popup Login screen otherwise.
 */
import { useContext } from "react";

import { Login } from "../popup/screens/Login";
import { ClientContext, ExtensionLockContext } from "./ApprovalsApp";

type Props = {
  children: React.ReactNode;
};

export const WithAuth = ({ children }: Props): JSX.Element => {
  const client = useContext(ClientContext);
  const { isUnlocked, setIsUnlocked } = useContext(ExtensionLockContext);

  const handleOnLogin = async (password: string): Promise<boolean> => {
    try {
      const unlocked = (await client?.unlock(password)) ?? false;
      setIsUnlocked?.(unlocked);
      return unlocked;
    } catch {
      setIsUnlocked?.(false);
    }
    return false;
  };

  return isUnlocked ? <>{children}</> : <Login onLogin={handleOnLogin} />;
};
