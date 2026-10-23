import { LinkIcon } from "../../icons/LinkIcon";

/** What replaces the address when sending as a payment link. */
export function PaymentLinkFields() {
  return (
    <div
      role="note"
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gold/25 motion-safe:animate-fade-in"
    >
      <span className="shrink-0 grid place-items-center size-8 rounded-lg bg-gold text-on-gold motion-safe:animate-pop-in">
        <LinkIcon className="size-4" />
      </span>
      <p className="text-xs font-medium">
        You'll get a link to share instead of entering an address. Anyone who
        has the link can claim the money, so share it privately.
      </p>
    </div>
  );
}
