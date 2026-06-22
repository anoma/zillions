import { AccountProfile } from "./AccountProfile";

export function AppHeader() {
  return (
    <header className="h-full flex items-center justify-end border-b border-gray-300 bg-surface">
      <AccountProfile />
    </header>
  );
}
