import { twMerge } from "tailwind-merge";
import { LinkIcon } from "../../icons/LinkIcon";
import { utf8Length } from "../../lib/memo";
import { DESCRIPTION_BYTES, descriptionProblem } from "../../lib/paymentLink";
import { inputClassName } from "../ui/utils";

/** What replaces the address when sending as a payment link: the notice and the description. */
export function PaymentLinkFields({
  description,
  onChange,
}: {
  description: string;
  onChange: (description: string) => void;
}) {
  const problem = descriptionProblem(description);
  return (
    <>
      <div
        role="note"
        className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gold/25 motion-safe:animate-fade-in"
      >
        <span className="shrink-0 grid place-items-center size-8 rounded-md bg-gold motion-safe:animate-pop-in">
          <LinkIcon className="size-4" />
        </span>
        <p className="text-xs font-medium">
          You'll get a link to share instead of entering an address. Anyone who
          has the link can claim the money, so share it privately.
        </p>
      </div>
      <div className="motion-safe:animate-fade-in">
        <label
          htmlFor="send-description"
          className="block mb-2 text-xs font-medium"
        >
          Description <span className="text-gray-600">(optional)</span>
        </label>
        <input
          id="send-description"
          name="description"
          type="text"
          autoComplete="off"
          placeholder="What it's for"
          aria-invalid={Boolean(problem)}
          aria-describedby="send-description-hint"
          className={twMerge(
            inputClassName,
            "h-11",
            problem &&
              "border-red-700 hover:border-red-700 focus:border-red-700",
          )}
          value={description}
          onChange={(e) => onChange(e.target.value)}
        />
        <div
          id="send-description-hint"
          className={twMerge(
            "mt-2 flex justify-between gap-2 text-xs text-gray-600",
            problem && "text-red-700",
          )}
        >
          <span>{problem ?? "Whoever claims the link sees this"}</span>
          <span className="tabular-nums">
            {utf8Length(description)}/{DESCRIPTION_BYTES}
          </span>
        </div>
      </div>
    </>
  );
}
