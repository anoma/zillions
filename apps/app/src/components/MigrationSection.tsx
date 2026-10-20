import { useGetBalance } from "../hooks/useGetBalance";
import { DatabaseArrowIcon } from "../icons/DatabaseArrowIcon";
import { MIGRATION_ENABLED, MIGRATION_MINIMUM } from "../lib/utils";
import { ActionButton } from "./ui/ActionButton";
import { ZecValue } from "./ZecValue";

/** Home's prompt to move Orchard funds to Ironwood, while there are any worth moving. */
export function MigrationSection() {
  const balance = useGetBalance();
  const orchard = balance.data?.orchardBalance ?? 0n;
  if (!MIGRATION_ENABLED || orchard < MIGRATION_MINIMUM) return null;

  return (
    <div className="px-10 pt-4 max-sm:px-6">
      <section
        aria-label="Move to Ironwood"
        className="p-5 flex max-sm:flex-col sm:items-center gap-4 rounded-3xl bg-neutral-800 text-white"
      >
        <DatabaseArrowIcon aria-hidden="true" className="size-6 shrink-0" />
        <div className="flex-1">
          <div className="font-medium">Move to Ironwood</div>
          <div className="text-sm text-neutral-300">
            Your <ZecValue zat={orchard} /> in Orchard needs to move to
            Ironwood, the new shielded pool.
          </div>
        </div>
        <ActionButton href="/migrate" size="sm" className="w-40 isolate">
          Migrate
        </ActionButton>
      </section>
    </div>
  );
}
