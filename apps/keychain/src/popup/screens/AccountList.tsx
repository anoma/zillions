/**
 * Account list ("Select Account"): parent accounts as KeyListItem rows with a
 * per-account dropdown (set default / view keys / rename / delete / seed
 * phrase), an Add Keys button opening the Setup tab, and the compatible-apps
 * footer.
 */
import {
  ActionButton,
  GapPatterns,
  KeyListItem,
  Loading,
  Stack,
  Text,
} from "@zillions/components";
import { AccountType } from "@zillions/types";
import { useNavigate } from "react-router-dom";
import { useAccounts } from "../context/AccountContext";
import { openSetupTab } from "../openSetup";
import routes from "../routes";
import { PageHeader } from "../ui/PageHeader";

export const AccountList = (): JSX.Element => {
  const navigate = useNavigate();
  const { parentAccounts, activeAccountId, status, changeActiveAccount } =
    useAccounts();

  if (status === "pending") {
    return <Loading status="Loading accounts…" />;
  }

  if (status === "error") {
    return (
      <Text className="text-center text-neutral-400 py-6">
        Could not load accounts.
      </Text>
    );
  }

  // Newest first.
  const accounts = [...parentAccounts].reverse();

  return (
    <Stack
      gap={GapPatterns.TitleContent}
      full
      className="max-h-[calc(100vh-40px)]"
    >
      <PageHeader title="Select Account" />
      <Stack gap={4} className="flex-1 overflow-auto">
        <nav className="flex items-end justify-between gap-2">
          <p className="text-black font-medium text-xs">Set default keys</p>
          <div className="w-26">
            <ActionButton size="xs" onClick={() => void openSetupTab()}>
              Add Keys
            </ActionButton>
          </div>
        </nav>
        <Stack as="ul" gap={3} className="flex-1 overflow-auto">
          {accounts.map((account, idx) => (
            <KeyListItem
              key={`key-listitem-${account.id}`}
              as="li"
              alias={account.alias}
              type={account.type as AccountType}
              outdated={false}
              dropdownPosition={
                idx > 2 && idx > accounts.length - 4 ? "bottom" : "top"
              }
              isMainKey={activeAccountId === account.id}
              onRename={() => navigate(routes.renameAccount(account.id))}
              onDelete={() => navigate(routes.deleteAccount(account.id))}
              onViewAccount={() => navigate(routes.viewAccount(account.id))}
              onViewRecoveryPhrase={() =>
                navigate(routes.viewMnemonic(account.id))
              }
              // No disposable (refund) accounts in the Zcash keychain.
              onDisposableKeyDetails={() => undefined}
              onSelectAccount={() =>
                void changeActiveAccount(account.id, account.type)
              }
            />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};
