import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";
import { PageLoader } from "../components/PageLoader";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useGetBalance } from "../hooks/useGetBalance";
import { MIGRATION_MINIMUM } from "../lib/utils";

export const Route = createFileRoute("/migrate")({
  component: MigrateRoute,
});

type Mode = "private" | "immediate";
type Step = "choose" | "how" | "network" | "review";

const ZIP_318 = "https://zips.z.cash/zip-0318";
const TOR_BROWSER = "https://www.torproject.org/download/";
const NYM_VPN = "https://nym.com/blog/nymvpn-free-for-zcash-ironwood";

/**
 * Moves Orchard funds to Ironwood following ZIP 318 (product.md 2.9). The
 * steps are in place; starting the migration isn't built yet.
 */
function MigrateRoute() {
  const balance = useGetBalance();
  const [mode, setMode] = useState<Mode>("private");
  const [step, setStep] = useState<Step>("choose");
  const [started, setStarted] = useState(false);

  if (balance.isPending) return <PageLoader />;
  const orchard = balance.data?.orchardBalance ?? 0n;

  const steps: Step[] =
    mode === "private"
      ? ["choose", "how", "network", "review"]
      : ["choose", "network", "review"];
  const index = steps.indexOf(step);
  const next = () => setStep(steps[index + 1]);
  const back = index > 0 ? () => setStep(steps[index - 1]) : undefined;

  if (orchard < MIGRATION_MINIMUM) {
    return (
      <Page title="Move to Ironwood">
        <p>
          Nothing to move: there is less than{" "}
          <ZecValue zat={MIGRATION_MINIMUM} /> in Orchard.
        </p>
        <Link to="/" className="mt-6 underline">
          Back to the wallet
        </Link>
      </Page>
    );
  }

  if (step === "choose") {
    return (
      <Page title="Move to Ironwood">
        <p>
          The latest Zcash network upgrade closed the Orchard pool to new funds.
          Move your <ZecValue zat={orchard} className="font-medium" /> from
          Orchard to the new Ironwood pool. Your funds are safe meanwhile.{" "}
          <a
            href={ZIP_318}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Find out more
          </a>
        </p>
        <div className="mt-8 space-y-3">
          <Option
            selected={mode === "private"}
            onSelect={() => setMode("private")}
            title="Migrate with privacy (recommended)"
            detail="Split into standard amounts · Spread over hours · Most private"
          />
          <Option
            selected={mode === "immediate"}
            onSelect={() => setMode("immediate")}
            title="Migrate immediately"
            detail="One transfer · Sent now · Less private"
          />
        </div>
        <Note>
          The amount of each transfer between pools is public on the blockchain.
        </Note>
        <Primary onClick={next}>Next</Primary>
      </Page>
    );
  }

  if (step === "how") {
    return (
      <Page title="How this works" onBack={back}>
        <p>
          Moving funds between Zcash pools reveals the amount of each transfer.
          This is how the migration keeps them private.
        </p>
        <dl className="mt-8 space-y-5">
          <Point title="Split and spread out">
            Your balance is split into standard amounts that many other wallets
            move too, sent hours apart, so they're hard to link together.
          </Point>
          <Point title="Approve once">
            The Keychain signs the whole plan in one approval. Larger balances
            may take a few batches.
          </Point>
          <Point title="Keep Zillions open">
            Transfers are sent while the wallet is open. One that comes due
            while it's closed is sent when you next open it.
          </Point>
        </dl>
        <Note>
          Less than <ZecValue zat={MIGRATION_MINIMUM} /> may stay in Orchard:
          moving such a small, unusual amount would make it stand out.
        </Note>
        <Primary onClick={next}>Continue</Primary>
      </Page>
    );
  }

  if (step === "network") {
    return (
      <Page title="Protect your IP address" onBack={back}>
        <p>
          The network can link each transfer to the IP address it comes from,
          and through it the transfers to each other. We strongly recommend
          opening Zillions in{" "}
          <a
            href={TOR_BROWSER}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Tor Browser
          </a>
          , or using a trusted VPN such as{" "}
          <a
            href={NYM_VPN}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            NymVPN
          </a>{" "}
          (free for the Ironwood migration), before you start.
        </p>
        <Note>You can continue without either; the choice is yours.</Note>
        <Primary onClick={next}>Continue</Primary>
      </Page>
    );
  }

  return (
    <Page
      title={mode === "private" ? "Confirm transfer plan" : "Review transfer"}
      onBack={back}
    >
      <p>
        {mode === "private"
          ? "Your Orchard balance will move to Ironwood as several transfers spread over hours. Approve once; the wallet sends each transfer while it's open."
          : "Your full Orchard balance will move to Ironwood in a single transfer. Once sent, it can't be cancelled."}
      </p>
      <div className="mt-8 rounded-2xl border border-gray-300 divide-y divide-gray-300 text-sm">
        <Row label="In Orchard">
          <ZecValue zat={orchard} />
        </Row>
        <Row label={mode === "private" ? "Transfers" : "Transfer"}>
          {mode === "private" ? "Planned when you start" : "1"}
        </Row>
      </div>
      {started && (
        <Note>
          Migration is a work in progress and can't start yet. Nothing was sent.
        </Note>
      )}
      <Primary onClick={() => setStarted(true)}>
        {mode === "private" ? "Start migration" : "Confirm"}
      </Primary>
    </Page>
  );
}

function Page({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="p-10">
      <div className="max-w-125 mx-auto flex flex-col">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start mb-6 text-sm cursor-pointer hover:underline"
          >
            ← Back
          </button>
        )}
        <h1 className="text-lg font-bold">{title}</h1>
        <div className="mt-3 flex flex-col text-sm">{children}</div>
      </div>
    </div>
  );
}

function Option({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={twMerge(
        "flex gap-3 p-4 rounded-2xl border cursor-pointer",
        selected ? "border-black" : "border-gray-300",
      )}
    >
      <input
        type="radio"
        name="mode"
        checked={selected}
        onChange={onSelect}
        className="mt-1 accent-black"
      />
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-neutral-600">{detail}</div>
      </div>
    </label>
  );
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium">{title}</dt>
      <dd className="text-neutral-600">{children}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between p-4">
      <div>{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="mt-8 text-xs text-neutral-600">{children}</div>;
}

function Primary({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <ActionButton
      size="lg"
      className="mt-6 w-full"
      backgroundColor="black"
      textColor="white"
      onClick={onClick}
    >
      {children}
    </ActionButton>
  );
}
