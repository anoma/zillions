import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { AppLoader } from "../components/AppLoader";
import { FinalStatePage } from "../components/FinalStatePage";
import { KeychainWall } from "../components/KeychainWall";
import { SubmitBlock } from "../components/TransferForm";
import { ActionButton } from "../components/ui/ActionButton";
import { useClaimLink, useLinkStatus } from "../hooks/usePaymentLink";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { CLAIM_FEE, parseLink, type ClaimLink } from "../lib/paymentLink";
import { zatoshiToZec } from "../lib/utils";
import { NETWORK } from "../lib/wallet/config";

export const Route = createFileRoute("/claim")({
  component: ClaimRoute,
});

const STORED = "zillions:claim";

/**
 * The link from the address bar, kept in this tab's `sessionStorage` through
 * onboarding and stripped from the URL and history: the claimer may have no
 * other copy, but nothing else should keep one.
 */
function readLink() {
  if (window.location.hash) {
    sessionStorage.setItem(STORED, window.location.hash);
    history.replaceState(null, "", window.location.pathname);
  }
  return parseLink(sessionStorage.getItem(STORED) ?? "");
}

function ClaimRoute() {
  const [link] = useState(readLink);

  if (!link) {
    return (
      <FinalStatePage title="Not a payment link">
        <p className="text-gray-600">
          This link is incomplete or damaged. Ask whoever sent it for a new
          copy.
        </p>
      </FinalStatePage>
    );
  }
  if (link.network !== NETWORK) {
    return (
      <FinalStatePage title="Wrong network">
        <p className="text-gray-600">
          This link is for {link.network === "test" ? "testnet" : "mainnet"};
          this wallet is on {NETWORK === "test" ? "testnet" : "mainnet"}.
        </p>
      </FinalStatePage>
    );
  }
  return <Claim link={link} />;
}

function Claim({ link }: { link: ClaimLink }) {
  const status = useLinkStatus(link);
  const note =
    status.data?.state === "claimable" ? status.data.note : undefined;
  // The chain's note has the last word on what the link holds.
  const amount = note ? BigInt(note.value) - CLAIM_FEE : link.amount;
  const description = note?.memo ?? link.description;

  return (
    <div className="p-8 pt-10 max-sm:px-6">
      <div className="isolate mx-auto max-w-120 flex flex-col gap-8">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-sm text-gray-600">Someone sent you</h1>
          <p className="text-4xl font-semibold tracking-tight">
            {zatoshiToZec(amount)} ZEC
          </p>
          {description && (
            <p className="max-w-80 text-sm text-neutral-700 break-words">
              “{description}”
            </p>
          )}
        </header>

        {status.isPending ? (
          <Notice icon={<SpinnerIcon className="size-4 text-gold" />}>
            Checking the link…
          </Notice>
        ) : status.isError ? (
          <Notice title="Couldn't check the link">
            {status.error.message}
          </Notice>
        ) : status.data.state === "funding" ? (
          <Notice
            icon={<SpinnerIcon className="size-4 text-gold" />}
            title="On its way"
          >
            The sender's payment isn't confirmed yet. This page checks again on
            its own.
          </Notice>
        ) : status.data.state === "claimed" ? (
          <Notice title="Already claimed">
            This link has been claimed or cancelled; nothing is left in it.
          </Notice>
        ) : (
          <div className="relative min-h-96">
            <AppLoader>
              <KeychainWall claiming>
                <ClaimForm link={link} amount={amount} />
              </KeychainWall>
            </AppLoader>
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimForm({ link, amount }: { link: ClaimLink; amount: bigint }) {
  const claim = useClaimLink(link);

  if (claim.data) {
    sessionStorage.removeItem(STORED);
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <Notice title="Claimed">
          {zatoshiToZec(amount)} ZEC is on its way to your wallet. It shows in
          your balance once the network confirms it.
        </Notice>
        <ActionButton href="/" size="sm" outlineColor="black">
          Go to your wallet
        </ActionButton>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        claim.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <SubmitBlock
        label={`Claim ${zatoshiToZec(amount)} ZEC`}
        pending={claim.isPending}
        pendingLabel="Claiming..."
        stages={claim.stages}
        error={claim.error?.message}
      />
      <p className="px-2 text-center text-xs text-neutral-500">
        The money goes to a new address of your connected wallet. Nobody, the
        sender included, can see where it went.
      </p>
    </form>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 py-6 text-center"
    >
      {icon}
      {title && <p className="text-sm font-semibold">{title}</p>}
      <p className="text-sm text-gray-600 max-w-80">{children}</p>
    </div>
  );
}
