import { useAccount } from "../hooks/useAccount";

export function AppHeader() {
  const account = useAccount();

  return (
    <header className="h-full flex items-center justify-end border-b border-gray-300 bg-surface overflow-auto">
      <div className="p-5">{account.keychain.alias}</div>
    </header>
  );
}
