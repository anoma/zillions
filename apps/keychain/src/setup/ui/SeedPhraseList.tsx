/**
 * Seed-phrase grid (display or editable). Setup-local UI.
 *
 * Editable mode (with `onChange`) is used by import; display mode (no handlers)
 * is used when showing a freshly generated phrase.
 */
import { ContentMasker, Input } from "@zillions/components";
import clsx from "clsx";
import type { ClipboardEvent } from "react";

type Props = {
  words: string[];
  columns?: number;
  sensitive?: boolean;
  invalidWordIndex?: number;
  onChange?: (index: number, value: string) => void;
  onPaste?: (index: number, e: ClipboardEvent<HTMLInputElement>) => void;
};

const ListItem = ({
  idx,
  word,
  invalidWordIndex,
  onChange,
  onPaste,
}: {
  idx: number;
  word: string;
  invalidWordIndex?: number;
  onChange?: (index: number, value: string) => void;
  onPaste?: (index: number, e: ClipboardEvent<HTMLInputElement>) => void;
}): JSX.Element => {
  const hasError = idx === invalidWordIndex;
  return (
    <li
      className={clsx(
        "relative border border-neutral-500 rounded-sm text-neutral-500 text-sm font-light",
        "px-1 py-3 h-12"
      )}
    >
      {onChange ?
        <span
          className={clsx(
            "flex items-center absolute left-0 top-0 w-full h-full",
            "[&_input]:bg-transparent [&_input]:border-0",
            "[&_input]:pt-4 [&_input]:pb-3 [&_input]:pl-7"
          )}
        >
          <i className="absolute left-2 not-italic pointer-events-none">
            {idx + 1}
          </i>
          <Input
            label=""
            className="-mt-2 ml-1"
            variant={hasError ? "Text" : "PasswordOnBlur"}
            hideIcon
            onChange={(e) => onChange(idx, e.target.value)}
            onPaste={(e) => onPaste?.(idx, e)}
            value={word}
            error={hasError}
          />
        </span>
        : <span className="absolute font-light left-2.5 top-[1em] select-none">
          <i className="not-italic">{idx + 1} </i>
          <span className="text-black font-bold ml-1">{word}</span>
        </span>
      }
    </li>
  );
};

export const SeedPhraseList = ({
  words,
  columns = 3,
  sensitive = true,
  invalidWordIndex,
  onChange,
  onPaste,
}: Props): JSX.Element => {
  const list = (
    <ol
      className="grid gap-x-1.5 gap-y-2 w-full min-h-54"
      data-testid="setup-seed-phrase-list"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {words.map((word, idx) => (
        <ListItem
          key={`seed-word-${idx}`}
          idx={idx}
          word={word}
          invalidWordIndex={invalidWordIndex}
          onChange={onChange}
          onPaste={onPaste}
        />
      ))}
    </ol>
  );

  return sensitive ? <ContentMasker>{list}</ContentMasker> : list;
};
