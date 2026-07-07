/**
 * Default-account approval screen: the connected dapp asked to make `address`
 * the active/default account. Approve → submit (background sets the active
 * account) + close; Reject → fail the dapp promise + close.
 */
import clsx from "clsx";
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ActionButton,
  Alert,
  Checkbox,
  GapPatterns,
  Stack,
} from "@zillions/components";
import { shortenAddress } from "@zillions/utils";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";

export const ApproveUpdateDefaultAccount = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const address = params.get("address") ?? "";
  const alias = params.get("alias") ?? "";

  const handleResponse = async (approved: boolean): Promise<void> => {
    if (approved && address) {
      await client?.submitUpdateDefaultAccount(address);
    }
    await closeCurrentTab();
  };

  return (
    <Stack full gap={GapPatterns.TitleContent} className="pt-4 pb-8">
      <PageHeader title="Approve Request" />
      <Stack full className="justify-between" gap={12}>
        <div>
          <Alert type="warning">Approve update default account?</Alert>
          <div
            className={clsx(
              "flex items-center gap-3 mt-4",
              "px-4 py-3 border border-neutral-500 rounded-md"
            )}
          >
            <Checkbox checked readOnly />
            <div className="leading-[1.2]">
              <div className="text-base text-black">{alias}</div>
              <p className="text-sm text-neutral-400 font-medium">
                {address && shortenAddress(address)}
              </p>
            </div>
          </div>
        </div>
        <Stack gap={2}>
          <ActionButton onClick={() => void handleResponse(true)}>
            Approve
          </ActionButton>
          <ActionButton
            outlineColor="black"
            onClick={() => void handleResponse(false)}
          >
            Reject
          </ActionButton>
        </Stack>
      </Stack>
    </Stack>
  );
};
