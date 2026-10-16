import { twMerge } from "tailwind-merge";
import { MEMO_BYTES, memoProblem, utf8Length } from "../../lib/memo";
import { inputClassName, textButtonClassName } from "../ui/utils";

/**
 * "Add a message" and, once opened, the memo box. The box stays while it holds
 * text even for a transparent recipient, so a message is never dropped
 * silently; empty, it disappears for one.
 */
export function MemoField({
  open,
  onOpenChange,
  memo,
  onChange,
  toTransparent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memo: string;
  onChange: (memo: string) => void;
  toTransparent: boolean;
}) {
  if (!open) {
    return (
      !toTransparent && (
        <button
          type="button"
          className={twMerge(
            "self-start py-1 text-sm font-medium",
            textButtonClassName,
          )}
          onClick={() => onOpenChange(true)}
        >
          + Add a message
        </button>
      )
    );
  }
  if (toTransparent && !memo) return null;

  const problem = memoProblem(memo, toTransparent);
  const bytes = utf8Length(memo);
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs font-medium">
        <label htmlFor="send-memo">Message</label>
        <button
          type="button"
          aria-label="Remove message"
          className={twMerge(textButtonClassName, "underline-offset-2")}
          onClick={() => {
            onOpenChange(false);
            onChange("");
          }}
        >
          Remove
        </button>
      </div>
      <textarea
        id="send-memo"
        name="memo"
        rows={3}
        autoFocus
        placeholder="Only the recipient can read this"
        aria-invalid={Boolean(problem)}
        aria-describedby="send-memo-hint"
        className={twMerge(
          inputClassName,
          "py-3 resize-none",
          problem && "border-red-700 hover:border-red-700 focus:border-red-700",
        )}
        value={memo}
        onChange={(e) => onChange(e.target.value)}
      />
      <div
        id="send-memo-hint"
        className="mt-2 flex justify-between gap-2 text-xs text-gray-600"
      >
        <span className="text-red-700">{problem}</span>
        <span
          className={twMerge(
            "tabular-nums",
            bytes > MEMO_BYTES && "text-red-700",
          )}
        >
          {bytes}/{MEMO_BYTES}
        </span>
      </div>
    </div>
  );
}
