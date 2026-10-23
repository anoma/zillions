import { useGetBalance } from "../hooks/useGetBalance";
import { useMigration } from "../hooks/useMigration";
import { DatabaseArrowIcon } from "../icons/DatabaseArrowIcon";
import {
  clockAt,
  fromNow,
  MIGRATION_ENABLED,
  MIGRATION_MINIMUM,
} from "../lib/utils";
import { isDue, stepName, transfersDone } from "../lib/wallet/migration";
import { ActionButton } from "./ui/ActionButton";
import { ZecValue } from "./ZecValue";

/**
 * Home's prompt to move Orchard funds to Ironwood while there are any worth
 * moving, and a migration's progress while one runs.
 */
export function MigrationSection() {
  const balance = useGetBalance();
  const status = useMigration().data;
  const orchard = balance.data?.orchardBalance ?? 0n;
  if (!MIGRATION_ENABLED || (!status && orchard < MIGRATION_MINIMUM)) {
    return null;
  }

  let detail = (
    <>
      Your <ZecValue zat={orchard} /> in Orchard needs to move to Ironwood, the
      new shielded pool.
    </>
  );
  let action = "Migrate";
  if (status) {
    const { migration: m, next, pending, tip = m.tip } = status;
    const step =
      next.kind === "preparation" || next.kind === "transfer" ? next : null;
    const progress = `Transfer ${transfersDone(m, pending)} of ${m.transfers.length} complete.`;
    const name = step ? stepName(step) : "";
    const Name = name.charAt(0).toUpperCase() + name.slice(1);
    const at = (height: number) =>
      `${clockAt(tip, height)} (${fromNow(tip, height)})`;
    const due = step && isDue(step, tip);
    detail = (
      <>
        {progress}{" "}
        {step
          ? due
            ? `It's time to send ${name}.`
            : `${Name} is due about ${at(Math.max(step.readyAt, step.height))}.`
          : next.kind === "mining"
            ? "Waiting for the last step to be mined."
            : next.kind === "done"
              ? "Every transfer is done."
              : "The plan needs updating."}
      </>
    );
    action = due ? "Continue" : "View";
  }

  return (
    <div className="px-10 pt-4 pb-10 max-sm:px-6">
      <section
        aria-label="Move to Ironwood"
        className="p-5 flex max-sm:flex-col sm:items-center gap-4 rounded-3xl bg-neutral-800 text-white dark:bg-card dark:text-black dark:border dark:border-line-strong"
      >
        <DatabaseArrowIcon aria-hidden="true" className="size-6 shrink-0" />
        <div className="flex-1">
          <div className="font-medium">
            {status ? "Moving to Ironwood" : "Move to Ironwood"}
          </div>
          <div className="text-sm text-neutral-300 dark:text-neutral-600">
            {detail}
          </div>
        </div>
        <ActionButton href="/migrate" size="sm" className="w-40 isolate">
          {action}
        </ActionButton>
      </section>
    </div>
  );
}
