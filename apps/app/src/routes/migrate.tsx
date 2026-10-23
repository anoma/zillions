import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";
import { PageLoader } from "../components/PageLoader";
import { FormError, SubmitProgress } from "../components/TransferForm";
import { TransferSuccess } from "../components/TransferSuccess";
import { ActionButton } from "../components/ui/ActionButton";
import { ZecValue } from "../components/ZecValue";
import { useFreshAddress } from "../hooks/useAddresses";
import { useGetBalance } from "../hooks/useGetBalance";
import { migrationQuery, useMigration } from "../hooks/useMigration";
import { planProblem, useSend, useSendPlan } from "../hooks/useSend";
import { useWallet } from "../hooks/useWallet";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import {
  clockAt,
  fromNow,
  MIGRATION_ENABLED,
  MIGRATION_MINIMUM,
  zatoshiToZec,
} from "../lib/utils";
import {
  type Step,
  sendAt,
  stepName,
  transfersDone,
} from "../lib/wallet/migration";
import type { Note } from "../lib/wallet/types";
import type { Wallet } from "../lib/wallet/wallet";

export const Route = createFileRoute("/migrate")({
  beforeLoad: () => {
    if (!MIGRATION_ENABLED) throw redirect({ to: "/" });
  },
  component: MigrateRoute,
});

type Mode = "private" | "immediate";
type Screen = "choose" | "how" | "network" | "review";

const ZIP_318 = "https://zips.z.cash/zip-0318";
const NYM_VPN = "https://nym.com/blog/nymvpn-free-for-zcash-ironwood";

/**
 * Moves Orchard funds to Ironwood following ZIP 318 (product.md 2.9).
 * Immediately sends every Orchard note to one of our own addresses, which
 * NU6.3 delivers into Ironwood. With privacy saves a plan, and the user sends
 * each of its steps when it's due ([MigrationSteps]).
 */
function MigrateRoute() {
  const balance = useGetBalance();
  const status = useMigration();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("private");
  const [step, setStep] = useState<Screen>("choose");
  const [validationMessage, setValidationMessage] = useState("");
  const self = useFreshAddress() ?? "";
  const planned = useSendPlan(
    {
      from: "orchard",
      to: mode === "immediate" && step === "review" ? self : "",
      amount: 0n,
    },
    true,
  );
  const send = useSend();
  const wallet = useWallet();
  const plan = useQuery(
    queryOptions({
      queryKey: [
        "migrationPlan",
        wallet.id,
        balance.data?.orchardBalance.toString(),
      ],
      queryFn: () => wallet.planMigration(),
      enabled: mode === "private" && step === "review",
      // Each run draws a new order and timing: keep the one on screen.
      staleTime: Infinity,
    }),
  );

  if (send.data) {
    return <TransferSuccess tx={{ ...send.data, status: "Pending" }} />;
  }
  if (balance.isPending || status.isPending) return <PageLoader />;
  if (status.data) return <MigrationSteps status={status.data} />;
  const orchard = balance.data?.orchardBalance ?? 0n;

  const steps: Screen[] =
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
          Orchard to the new Ironwood pool. They stay safe in Orchard until
          then.{" "}
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
          <Point title="You send each step">
            Zillions doesn't send them for you. When a step is due, come back
            and send it; the Keychain asks you to approve each one.
          </Point>
          <Point title="Late is fine, early isn't">
            The wallet shows when each step is due. Sending later is fine;
            sending earlier makes the transfers easier to link.
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
          turning on a trusted VPN such as{" "}
          <a
            href={NYM_VPN}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            NymVPN
          </a>{" "}
          (free for the Ironwood migration) before you start.
        </p>
        <Note>You can continue without one; the choice is yours.</Note>
        <Primary onClick={next}>Continue</Primary>
      </Page>
    );
  }

  if (mode === "private") {
    const p = plan.data;
    const fees =
      p &&
      BigInt(
        p.transfers.length * p.transferFee +
          p.preparations.length * p.preparationFee,
      );
    const last = p?.transfers.at(-1)?.height;
    return (
      <Page title="Confirm transfer plan" onBack={back}>
        {!p ? (
          plan.error ? (
            <div className="text-red-500">{plan.error.message}</div>
          ) : (
            <Waiting />
          )
        ) : p.transfers.length === 0 ? (
          <p>
            Too little to migrate with privacy: after fees, less than{" "}
            <ZecValue zat={MIGRATION_MINIMUM} /> would be left to move. Migrate
            immediately instead.
          </p>
        ) : (
          <>
            <p>
              Your balance moves as {p.transfers.length}{" "}
              {p.transfers.length === 1 ? "transfer" : "transfers"} over{" "}
              {fromNow(p.tip, last!)}. Their order and timing are random, for
              privacy. Starting saves this plan; you then send each step
              yourself when it's due.
            </p>
            <div className="mt-8 rounded-2xl border border-line divide-y divide-line text-sm">
              {p.preparations.map((height, i) => (
                <Row
                  key={`p${i}`}
                  label={
                    p.preparations.length > 1
                      ? `Prepare the amounts ${i + 1}`
                      : "Prepare the amounts"
                  }
                >
                  {stepTime(p.tip, height)}
                </Row>
              ))}
              {p.transfers.map(({ value, height }, i) => (
                <Row
                  key={`t${i}`}
                  label={`Transfer ${i + 1} · ${zatoshiLabel(value)}`}
                >
                  {stepTime(p.tip, height)}
                </Row>
              ))}
              <Row label="Fees">
                <ZecValue zat={fees!} />
              </Row>
              <Row label="Stays in Orchard">
                <ZecValue zat={BigInt(p.left)} />
              </Row>
            </div>
          </>
        )}
        <Primary
          disabled={!p?.transfers.length}
          onClick={() => {
            wallet.startMigration(p!);
            void queryClient.invalidateQueries(migrationQuery(wallet));
          }}
        >
          Start migration
        </Primary>
      </Page>
    );
  }

  const amount = planned.maxAmount.data;
  const fee = planned.plan.data?.fee;
  const error = send.error?.message ?? planProblem(planned);
  const confirm = () => {
    setValidationMessage(amount ? "" : "Wait for the amount and fee to load.");
    if (!amount) return;
    send.mutate({
      from: "orchard",
      to: self,
      amount,
      toSelf: true,
      shown: {
        tx_type: "Migrated",
        value: amount,
        from: { pool: "orchard" },
        to: { pool: "ironwood" },
      },
    });
  };

  return (
    <Page title="Review transfer" onBack={back}>
      <p>
        Your full Orchard balance will move to Ironwood in a single transfer.
        Once sent, it can't be cancelled.
      </p>
      <div className="mt-8 rounded-2xl border border-line divide-y divide-line text-sm">
        <Row label="Amount">
          {amount !== undefined ? <ZecValue zat={amount} /> : <Waiting />}
        </Row>
        <Row label="Fee">
          {fee !== undefined ? <ZecValue zat={BigInt(fee)} /> : <Waiting />}
        </Row>
      </div>
      {(error || validationMessage) && (
        <FormError>{error || validationMessage}</FormError>
      )}
      <Primary onClick={confirm} disabled={send.isPending}>
        {send.isPending ? "Sending..." : "Confirm"}
      </Primary>
      {send.isPending && <SubmitProgress stages={send.stages} />}
    </Page>
  );
}

type Status = NonNullable<ReturnType<Wallet["migration"]>>;

/** The notes a transfer may spend: the ones made for it. */
const notesFor =
  (step: Extract<Step, { kind: "transfer" }>, fee: number) => (n: Note) =>
    n.pool === "orchard" && n.value === step.value + fee;

/**
 * A migration in progress: every step with its state, and the next one to
 * send. A step can go once its notes can anchor at a ZIP 318 bucket
 * boundary; before it's due, only by choice.
 */
function MigrationSteps({ status }: { status: Status }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const self = useFreshAddress();
  const send = useSend();
  const { migration: m, next, pending, tip = m.tip } = status;
  const step =
    next.kind === "preparation" || next.kind === "transfer" ? next : undefined;
  const refresh = () => queryClient.invalidateQueries(migrationQuery(wallet));

  // Whether the step can be sent now: its notes anchor at a bucket boundary.
  const ready = useQuery(
    queryOptions({
      queryKey: ["migrationStep", wallet.id, step, tip, self, m.transferFee],
      queryFn: async () => {
        if (step!.kind === "preparation") {
          return wallet
            .planPreparation(step!.parts)
            .then(() => true)
            .catch((e: Error) => {
              if (e.message.startsWith("not ready")) return false;
              throw e;
            });
        }
        const plan = await wallet.planSend(
          { from: "orchard", to: self!, amount: BigInt(step!.value) },
          notesFor(step!, m.transferFee),
        );
        return plan.bucket !== undefined;
      },
      enabled: Boolean(step && (step.kind === "preparation" || self)),
      retry: false,
    }),
  );
  const problem = (send.error ?? ready.error)?.message;

  const sendStep = async () => {
    if (!step) return;
    const sent =
      step.kind === "preparation"
        ? await send.mutateAsync({
            from: "orchard",
            to: "",
            amount: 0n,
            preparation: step.parts,
            shown: {
              tx_type: "Prepared",
              value: BigInt(
                step.parts.reduce((sum, p) => sum + p + m.transferFee, 0),
              ),
              from: { pool: "orchard" },
              to: { pool: "orchard" },
            },
          })
        : await send.mutateAsync({
            from: "orchard",
            to: self!,
            amount: BigInt(step.value),
            toSelf: true,
            keep: notesFor(step, m.transferFee),
            shown: {
              tx_type: "Migrated",
              value: BigInt(step.value),
              from: { pool: "orchard" },
              to: { pool: "ironwood" },
            },
          });
    wallet.migrationStepSent(step.kind, step.index, sent.txid);
    await refresh();
  };
  const stop = async () => {
    if (
      next.kind !== "done" &&
      !confirm(
        "Stop the migration? Steps not sent yet are dropped; their funds stay in Orchard.",
      )
    ) {
      return;
    }
    wallet.stopMigration();
    await refresh();
  };

  const state = (txid: string | undefined, at: number, isNext: boolean) =>
    txid
      ? pending.has(txid)
        ? "Being mined"
        : "Done"
      : isNext
        ? tip + 1 >= sendAt(step!)
          ? "Ready to send"
          : `Send at ~${clockAt(tip, sendAt(step!))}`
        : step?.kind === "transfer" && at <= step.height
          ? "Not needed"
          : stepTime(tip, at);
  const done = transfersDone(m, pending);
  const due = step && tip + 1 >= step.height;
  const name = step ? stepName(step) : "";
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  // The block to come back for the next step.
  const comeBack = step ? Math.max(sendAt(step), tip + 1) : tip + 1;
  const soon = fromNow(tip, comeBack);

  if (send.data) {
    return (
      <TransferSuccess tx={{ ...send.data, status: "Pending" }}>
        <Primary onClick={() => send.reset()}>Back to migration</Primary>
      </TransferSuccess>
    );
  }
  return (
    <Page title="Moving to Ironwood">
      <p>
        Transfer {done} of {m.transfers.length} complete.
      </p>
      {next.kind === "mining" && (
        <NextCard title="Your last step is being mined">
          Usually a few minutes. Then the next step's time shows here.
        </NextCard>
      )}
      {next.kind === "replan" && (
        <NextCard
          title="This plan can't continue"
          action={<Primary onClick={stop}>Plan again</Primary>}
        >
          The Orchard funds it needs were spent or changed outside it.
        </NextCard>
      )}
      {next.kind === "done" && (
        <NextCard
          title="Migration complete"
          action={<Primary onClick={stop}>Finish</Primary>}
        >
          Less than <ZecValue zat={MIGRATION_MINIMUM} /> stays in Orchard.
        </NextCard>
      )}
      {step &&
        (ready.isPending ? (
          <NextCard title={<Waiting />} />
        ) : ready.data && due ? (
          <NextCard
            title={`${Name} is ready`}
            action={
              <Primary onClick={sendStep} disabled={send.isPending}>
                {send.isPending ? "Sending..." : `Send ${name}`}
              </Primary>
            }
          >
            Send it now, or any time later.
          </NextCard>
        ) : (
          <NextCard
            title={`Come back around ${clockAt(tip, comeBack)}`}
            action={
              ready.data && (
                <button
                  type="button"
                  onClick={sendStep}
                  disabled={send.isPending}
                  className="mt-3 self-start text-xs underline cursor-pointer"
                >
                  {send.isPending
                    ? "Sending..."
                    : "Send now anyway (easier to link)"}
                </button>
              )
            }
          >
            {`To send ${name}${soon === "now" ? "" : `, in ${soon}`}. `}
            Later is fine; Zillions won't send it for you.
          </NextCard>
        ))}
      {problem && <FormError>{problem}</FormError>}
      {send.isPending && <SubmitProgress stages={send.stages} />}
      <div className="mt-8 rounded-2xl border border-line divide-y divide-line text-sm">
        {m.preparations.map((p, i) => (
          <Row
            key={`p${i}`}
            label={
              m.preparations.length > 1
                ? `Prepare the amounts ${i + 1}`
                : "Prepare the amounts"
            }
          >
            {state(
              p.txid,
              p.height,
              step?.kind === "preparation" && step.index === i,
            )}
          </Row>
        ))}
        {m.transfers.map((t, i) => (
          <Row
            key={`t${i}`}
            label={`Transfer ${i + 1} · ${zatoshiLabel(t.value)}`}
          >
            {state(
              t.txid,
              t.height,
              step?.kind === "transfer" && step.index === i,
            )}
          </Row>
        ))}
      </div>
      {next.kind !== "done" && (
        <button
          type="button"
          onClick={stop}
          className="mt-8 self-center text-xs text-neutral-600 underline cursor-pointer"
        >
          Stop migration
        </button>
      )}
    </Page>
  );
}

const zatoshiLabel = (zat: number) => `${zatoshiToZec(BigInt(zat))} ZEC`;

/** When a step is planned, as both the review and the steps list show it. */
const stepTime = (tip: number, height: number) =>
  tip + 1 >= height ? "Now" : `~${clockAt(tip, height)}`;

function Waiting() {
  return <SpinnerIcon className="size-3" />;
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
    <div className="p-10 max-sm:px-6">
      <div className="max-w-135 mx-auto flex flex-col">
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
        selected ? "border-black" : "border-line",
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

/** What the user does next: a headline, one line, and its action. */
function NextCard({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label="Next step"
      className="isolate mt-6 p-5 flex flex-col rounded-2xl border border-line bg-card"
    >
      <div className="text-lg font-semibold">{title}</div>
      {children && <div className="mt-1 text-neutral-600">{children}</div>}
      {action}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="mt-8 text-xs text-neutral-600">{children}</div>;
}

function Primary({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <ActionButton
      size="lg"
      className="mt-6 w-full"
      backgroundColor="black"
      textColor="white"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </ActionButton>
  );
}
