import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { GoAlert } from "react-icons/go";
import { AccountHeader } from "../components/AppHeader";
import { AppLoader } from "../components/AppLoader";
import { FinalStatePage } from "../components/FinalStatePage";
import { KeychainWall } from "../components/KeychainWall";
import { EnableNav } from "../components/MainNav";
import { SubmitBlock } from "../components/TransferForm";
import { ActionButton } from "../components/ui/ActionButton";
import { WalletProvider } from "../components/WalletProvider";
import { useNow } from "../hooks/useNow";
import { useClaimLink, useLinkStatus } from "../hooks/usePaymentLink";
import { LinkIcon } from "../icons/LinkIcon";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import {
  CLAIM_FEE,
  FUNDING_GRACE_MS,
  parseLink,
  type ClaimLink,
} from "../lib/paymentLink";
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
    // Centred in the viewport, clear of the header and, on small screens, the bottom nav.
    <div className="min-h-[calc(100svh-4rem)] max-lg:min-h-[calc(100svh-8rem)] flex flex-col justify-center px-8 py-12 max-sm:px-6">
      <div className="isolate mx-auto w-full max-w-120 flex flex-col">
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="size-12 grid place-items-center rounded-full bg-gold/15 text-gold">
            <LinkIcon className="size-5" />
          </span>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-sm text-gray-600">Someone sent you</h1>
            <p className="text-5xl font-semibold tracking-tight">
              {zatoshiToZec(amount)}
              <span className="ml-2 text-2xl font-medium text-gray-600">
                ZEC
              </span>
            </p>
          </div>
          {description && (
            <p className="max-w-80 text-base text-neutral-700 break-words">
              “{description}”
            </p>
          )}
        </header>

        <div className="mt-10 pt-8 border-t border-line">
          {status.isPending ? (
            <Notice icon={<SpinnerIcon className="size-5 text-gold" />}>
              Checking the link…
            </Notice>
          ) : status.isError ? (
            <Notice title="Couldn't check the link">
              {status.error.message}
            </Notice>
          ) : status.data.state === "funding" ? (
            <Funding createdAt={link.createdAt} />
          ) : status.data.state === "claimed" ? (
            <Notice title="Already claimed">
              This link has been claimed or cancelled; nothing is left in it.
            </Notice>
          ) : (
            <div className="relative min-h-40">
              <AppLoader>
                <KeychainWall claiming>
                  <WalletProvider>
                    <AccountHeader />
                    <EnableNav />
                    <ClaimForm link={link} amount={amount} />
                  </WalletProvider>
                </KeychainWall>
              </AppLoader>
            </div>
          )}
        </div>

        <ul className="mt-12 pt-8 border-t border-line grid grid-cols-3 gap-4 text-center max-sm:grid-cols-1 max-sm:gap-4">
          <Fact title="Private">Hidden from the sender</Fact>
          <Fact title="No fee">The sender paid it</Fact>
          <Fact title="One claim">The first to claim gets it</Fact>
        </ul>
      </div>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold">{title}</span>
      <span className="text-xs text-neutral-500">{children}</span>
    </li>
  );
}

/**
 * No note yet. Within `FUNDING_GRACE_MS` of the link's making the sender's
 * payment may still be proving or mining; past it, it most likely failed.
 * Either way the status keeps polling, so a late note still turns claimable.
 */
function Funding({ createdAt }: { createdAt?: number }) {
  const now = useNow(1000);
  const late =
    createdAt !== undefined && now - createdAt * 1000 >= FUNDING_GRACE_MS;

  if (late) {
    return (
      <Notice
        icon={<GoAlert aria-hidden="true" className="size-5 text-red-700" />}
        title="Payment not found"
      >
        The sender's payment hasn't reached the network, so this link holds
        nothing yet. Ask the sender to check it in their wallet.
      </Notice>
    );
  }
  return (
    <Notice
      icon={<SpinnerIcon className="size-5 text-gold" />}
      title="Being processed"
    >
      The sender's payment is being processed. This page checks again on its
      own.
    </Notice>
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
    <div role="status" className="flex flex-col items-center gap-2 text-center">
      {icon}
      {title && <p className="text-sm font-semibold">{title}</p>}
      <p className="text-sm text-gray-600 max-w-80">{children}</p>
    </div>
  );
}
