/**
 * Home: the accounts, active one tagged, others one tap from being used. A
 * row opens the account; rows drag to reorder. The current tab's connection
 * shows on top.
 */
import clsx from "clsx";
import { useMemo, useState } from "react";
import { GoGear, GoGrabber, GoLinkExternal, GoLock, GoPlus } from "react-icons/go";
import { useNavigate } from "react-router-dom";

import { shortenAddress } from "@zillions/utils";

import { createBackgroundClient } from "../../ipc/client";
import type { StoredAccount } from "../../ipc/contract";
import { useAccounts } from "../context/AccountContext";
import { useVault } from "../context/VaultContext";
import { useCurrentSite } from "../currentSite";
import { openSetupTab } from "../openSetup";
import { setAccountOrder, sortByOrder, useAccountOrder } from "../prefs";
import routes from "../routes";
import { Avatar } from "../ui/Avatar";
import { Button, buttonClass } from "../ui/Button";
import { Eyebrow, Row } from "../ui/Row";
import { IconButton, ScreenHeader } from "../ui/ScreenHeader";
import { SiteStatus } from "../ui/SiteStatus";
import { Tag } from "../ui/Tag";
import { ZILLIONS_APP_URL } from "../links";

const AccountSubtitle = ({ account }: { account: StoredAccount }) => (
  <>
    {account.type === "ledger" && "Ledger · "}
    <span className="font-mono text-[11px]">
      {shortenAddress(account.address, 4, 4, "…")}
    </span>
  </>
);

export const AccountList = () => {
  const navigate = useNavigate();
  const client = useMemo(() => createBackgroundClient(), []);
  const { lock } = useVault();
  const { parentAccounts, activeAccountId, status, changeActiveAccount } =
    useAccounts();
  const order = useAccountOrder();
  const site = useCurrentSite(client);
  const [dragging, setDragging] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();

  const accounts = sortByOrder(parentAccounts, order);

  const drop = (targetId: string): void => {
    if (dragging && dragging !== targetId) {
      const ids = accounts.map((a) => a.id).filter((id) => id !== dragging);
      ids.splice(ids.indexOf(targetId), 0, dragging);
      setAccountOrder(ids);
    }
    setDragging(undefined);
    setDropTarget(undefined);
  };

  return (
    <>
      <ScreenHeader
        title="Accounts"
        left={
          <IconButton label="Lock Keychain" onClick={() => void lock()}>
            <GoLock />
          </IconButton>
        }
        right={
          <IconButton label="Settings" onClick={() => navigate(routes.settings())}>
            <GoGear />
          </IconButton>
        }
      />
      <SiteStatus
        site={site}
        accountName={accounts.find((a) => a.id === site?.accountId)?.alias}
      />
      <div className="flex items-center justify-between mt-[18px] mb-1.5">
        <Eyebrow className="m-0">Accounts</Eyebrow>
        <Button variant="secondary" size="sm" onClick={() => void openSetupTab()}>
          <GoPlus className="size-3.5" />
          Add account
        </Button>
      </div>
      {status === "error" && (
        <p className="text-[12.5px] text-muted py-4">Could not load accounts.</p>
      )}
      <ul className="m-0 p-0 list-none">
        {accounts.map((account) => {
          const isActive = account.id === activeAccountId;
          return (
            <li
              key={account.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragging(account.id);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setDropTarget(account.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(account.id);
              }}
              onDragEnd={() => {
                setDragging(undefined);
                setDropTarget(undefined);
              }}
              className={clsx(
                "group/drag relative border-b border-line last:border-b-0 transition-opacity",
                // A gold bar on the popup's edge marks the active account.
                isActive &&
                  "after:absolute after:-left-5 after:inset-y-2.5 after:w-[3px] after:rounded-r-pill after:bg-gold",
                dragging === account.id && "opacity-40",
                dropTarget === account.id &&
                  dragging !== account.id &&
                  "before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-gold"
              )}
            >
              <Row
                className="border-b-0"
                onClick={() => navigate(routes.viewAccount(account.id))}
                lead={<Avatar accountId={account.id} alias={account.alias} />}
                title={<span className="text-sm">{account.alias}</span>}
                subtitle={<AccountSubtitle account={account} />}
                trail={
                  <>
                    <GoGrabber
                      aria-hidden
                      className="size-4 text-line-strong opacity-0 group-hover/drag:opacity-100 cursor-grab"
                    />
                    {isActive ? (
                      <Tag tone="gold">
                        <span className="size-1.5 rounded-pill bg-[#111]" />
                        Active
                      </Tag>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void changeActiveAccount(account.id, account.type);
                        }}
                      >
                        Use
                      </Button>
                    )}
                  </>
                }
              />
            </li>
          );
        })}
      </ul>
      {/* Pinned: the app is where balances live, so it never scrolls away. */}
      <section className="sticky bottom-0 mt-auto -mx-5 bg-surface px-5 pt-5 pb-5 shadow-[0_-12px_12px_-4px_var(--color-surface)]">
        <p className="m-0 mb-2.5 text-center text-[11.5px] font-medium text-muted">
          Balances, transactions and history live in the Zillions app.
        </p>
        <a
          href={ZILLIONS_APP_URL}
          target="_blank"
          rel="noreferrer"
          className={buttonClass({ variant: "appOutline", block: true })}
        >
          Open Zillions
          <GoLinkExternal className="size-3.5" />
        </a>
      </section>
    </>
  );
};
