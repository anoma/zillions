/**
 * Account detail: the parent's transparent address, public key, and a fresh
 * shielded address each visit, plus actions to view the viewing key / seed
 * phrase / spending key and to rename or delete the account.
 */
import {
  ActionButton,
  GapPatterns,
  Stack,
  ViewKeys,
} from "@zillions/components";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { freshAddress } from "../../background/crypto/zillions";
import { useAccounts } from "../context/AccountContext";
import routes from "../routes";
import { BackButton } from "../ui/BackButton";
import { PageHeader } from "../ui/PageHeader";

export const ViewAccount = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, accounts } = useAccounts();

  const parent = getById(accountId);
  const shieldedChild = accounts.find(
    (a) => a.parentId === parent?.id && a.type === "shielded-keys"
  );
  // A spending-key import IS the shielded account; otherwise the shielded
  // receiver lives on the child account derived under this parent.
  const isShieldedParent = parent?.type === "shielded-keys";
  // A shielded account's owner is its viewing key.
  const ufvk = isShieldedParent ? parent.owner : shieldedChild?.owner;

  const [fresh, setFresh] = useState<{ ufvk: string; address: string }>();
  useEffect(() => {
    if (!ufvk) return;
    let live = true;
    void freshAddress(ufvk).then(
      (address) => live && setFresh({ ufvk, address })
    );
    return () => {
      live = false;
    };
  }, [ufvk]);
  // Never another account's address while this one's is made.
  const shieldedAddress = ufvk && fresh?.ufvk === ufvk ? fresh.address : undefined;

  if (!parent) {
    // Account not found (e.g. deep link after deletion) — return to the list.
    navigate(routes.accountList());
    return <></>;
  }

  const transparentAddress = isShieldedParent ? undefined : parent.address;

  // The spending key belongs to the shielded account: the parent itself for a
  // spending-key import, otherwise its derived shielded child.
  const shieldedAccountId = isShieldedParent ? parent.id : shieldedChild?.id;

  const isMnemonic = parent.type === "mnemonic" && !parent.external;

  return (
    <Stack gap={GapPatterns.TitleContent} full>
      <PageHeader title={parent.alias} />
      <Stack gap={2} full>
        <ViewKeys
          transparentAccountAddress={transparentAddress}
          shieldedAccountAddress={shieldedAddress}
        />
        <Stack gap={2} full className="mt-5">
          <ActionButton
            outlineColor="black"
            size="sm"
            onClick={() => navigate(routes.viewingKey(parent.id))}
          >
            View Viewing Key
          </ActionButton>
          {isMnemonic && (
            <ActionButton
              outlineColor="black"
              size="sm"
              onClick={() => navigate(routes.viewMnemonic(parent.id))}
            >
              View Seed Phrase
            </ActionButton>
          )}
          {shieldedAccountId && (
            <ActionButton
              outlineColor="black"
              size="sm"
              onClick={() =>
                navigate(routes.viewSpendingKey(shieldedAccountId))
              }
            >
              View Spending Key
            </ActionButton>
          )}
          <ActionButton
            backgroundColor="neutral-400"
            size="sm"
            onClick={() => navigate(routes.renameAccount(parent.id))}
          >
            Rename
          </ActionButton>
          <ActionButton
            backgroundColor="neutral-400"
            size="sm"
            onClick={() => navigate(routes.deleteAccount(parent.id))}
          >
            Delete
          </ActionButton>
        </Stack>
      </Stack>
      <BackButton onClick={() => navigate(routes.accountList())} />
    </Stack>
  );
};
