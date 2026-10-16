import { twMerge } from "tailwind-merge";
import { LinkIcon } from "../../icons/LinkIcon";
import { Toggle } from "../Toggle";

/** The "Payment link" switch in the To card's heading row. */
export function PaymentLinkToggle({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <div className="group/link -my-1 flex items-center gap-2 py-1 pl-3 pr-1 rounded-full transition-colors duration-300 hover:bg-gold/15">
      <label
        htmlFor="send-payment-link"
        className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none"
      >
        <LinkIcon className="size-3.5 transition-transform duration-300 group-hover/link:-rotate-12" />
        Payment link
      </label>
      <Toggle
        id="send-payment-link"
        active={active}
        className={twMerge(
          "transition-colors duration-300",
          active
            ? "bg-gold border-gold"
            : "group-hover/link:border-line-strong",
        )}
        toggleClassname={twMerge(
          "duration-300",
          active
            ? "bg-black"
            : "bg-neutral-400 group-hover/link:bg-neutral-600",
        )}
        onChange={onChange}
      />
    </div>
  );
}
