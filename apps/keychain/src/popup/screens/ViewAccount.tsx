/**
 * Account detail: its addresses (a fresh shielded one each visit) to copy,
 * its keys behind their own screens, and edit / delete.
 */
import { useEffect, useState } from "react";
import { GoPencil } from "react-icons/go";
import { useNavigate, useParams } from "react-router-dom";

import { shortenAddress } from "@zillions/utils";

import { freshAddress, ufvkPools } from "../../background/crypto/zillions";
import { useAccounts } from "../context/AccountContext";
import routes from "../routes";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { CopyButton } from "../ui/CopyButton";
import { Row, Section } from "../ui/Row";
import { IconButton, ScreenHeader } from "../ui/ScreenHeader";
import { Tag } from "../ui/Tag";

const AddressRow = ({
  label,
  address,
  tag,
}: {
  label: string;
  address?: string;
  tag?: React.ReactNode;
}) => (
  <Row
    title={
      <span className="inline-flex items-center gap-1.5">
        {label}
        {tag}
      </span>
    }
    subtitle={
      <span className="font-mono text-[11px]">
        {address ? shortenAddress(address, 18, 8, "…") : "Generating…"}
      </span>
    }
    trail={
      address && (
        <CopyButton
          value={address}
          label={`Copy ${label.toLowerCase()} address`}
        />
      )
    }
  />
);

export const ViewAccount = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, accounts, activeAccountId, changeActiveAccount, status } =
    useAccounts();

  const parent = getById(accountId);
  const shieldedChild = accounts.find(
    (a) => a.parentId === parent?.id && a.type === "shielded-keys",
  );
  // A spending-key import IS the shielded account; otherwise the shielded
  // receiver lives on the child account derived under this parent.
  const isShieldedParent = parent?.type === "shielded-keys";
  // A shielded account's owner is its viewing key.
  const ufvk = isShieldedParent ? parent.owner : shieldedChild?.owner;

  const [fresh, setFresh] = useState<{ ufvk: string; address: string }>();
  // Whether the key has a shielded part at all: a transparent-only key's
  // (a Trezor's) has no shielded address to show.
  const [shielded, setShielded] = useState(false);
  useEffect(() => {
    if (!ufvk) return;
    let live = true;
    setShielded(false);
    // A failed lookup leaves the row away like an empty one: nothing to
    // show for it.
    void ufvkPools(ufvk)
      .then((pools) => {
        if (!live || pools.length === 0) return;
        setShielded(true);
        return freshAddress(ufvk).then((address) => {
          if (live) setFresh({ ufvk, address });
        });
      })
      .catch(() => {
        if (live) setShielded(false);
      });
    return () => {
      live = false;
    };
  }, [ufvk]);
  // Never another account's address while this one's is made.
  const shieldedAddress =
    ufvk && fresh?.ufvk === ufvk ? fresh.address : undefined;

  useEffect(() => {
    // Account not found (e.g. deep link after deletion) — return to the list.
    if (status !== "pending" && !parent)
      navigate(routes.accountList(), { replace: true });
  }, [parent, status]);
  if (!parent) return null;

  const transparentAddress = isShieldedParent ? undefined : parent.address;

  // The spending key belongs to the shielded account: the parent itself for a
  // spending-key import, otherwise its derived shielded child. A hardware
  // wallet's never leaves the device.
  const shieldedAccountId =
    parent.device !== undefined
      ? undefined
      : isShieldedParent
        ? parent.id
        : shieldedChild?.id;

  const isActive = parent.id === activeAccountId;

  return (
    <>
      <ScreenHeader
        back
        title={parent.alias}
        right={
          <IconButton
            label="Edit account"
            onClick={() => navigate(routes.renameAccount(parent.id))}
          >
            <GoPencil />
          </IconButton>
        }
      />
      <section className="flex flex-col items-center gap-1.5 pt-2.5 pb-0.5 text-center">
        <Avatar accountId={parent.id} alias={parent.alias} size="lg" />
        <p className="m-0 text-base font-semibold tracking-[-0.01em]">
          {parent.alias}
        </p>
        {isActive ? (
          <Tag tone="soft">Active account</Tag>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void changeActiveAccount(parent.id, parent.type)}
          >
            Use this account
          </Button>
        )}
      </section>

      <Section title="Addresses" className="mt-1">
        {shielded && (
          <AddressRow
            label="Shielded"
            address={shieldedAddress}
            tag={<Tag tone="soft">new each time</Tag>}
          />
        )}
        {transparentAddress && (
          <AddressRow label="Transparent" address={transparentAddress} />
        )}
      </Section>

      <Section title="Keys" className="mt-5">
        <Row
          title="Viewing key"
          onClick={() => navigate(routes.viewingKey(parent.id))}
        />
        {parent.type === "mnemonic" && (
          <Row
            title="Seed phrase"
            subtitle="Password required"
            onClick={() => navigate(routes.viewMnemonic(parent.id))}
          />
        )}
        {shieldedAccountId && (
          <Row
            title="Spending key"
            subtitle="Password required"
            onClick={() => navigate(routes.viewSpendingKey(shieldedAccountId))}
          />
        )}
        {parent.type === "ledger" && (
          <p className="m-0 mt-2 text-[11.5px] text-muted">
            The seed phrase and spending keys stay on your Ledger.
          </p>
        )}
      </Section>

      <Section title="Actions" className="mt-5">
        <Row
          title="Edit account"
          onClick={() => navigate(routes.renameAccount(parent.id))}
        />
        <Row
          title={<span className="text-danger">Remove account</span>}
          onClick={() => navigate(routes.deleteAccount(parent.id))}
        />
      </Section>

      <div className="shrink-0 h-10" />
    </>
  );
};
