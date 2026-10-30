/**
 * Create > step 3: verify the user wrote down their phrase by confirming two
 * random words.
 */
import { ActionButton, GapPatterns, Input, Stack } from "@zillions/components";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

import { useWizard } from "../../SetupContext";

const pickTwoIndices = (length: number): [number, number] => {
  const a = Math.floor(Math.random() * length);
  let b = Math.floor(Math.random() * length);
  while (b === a) b = Math.floor(Math.random() * length);
  return [Math.min(a, b), Math.max(a, b)];
};

export const CreateConfirm = () => {
  const { state, dispatch } = useWizard();
  const { mnemonic } = state;

  // If we somehow arrive without a phrase, return to the warning step.
  useEffect(() => {
    if (mnemonic.length === 0) {
      dispatch({ type: "goToStep", step: "create.warning" });
    }
  }, [mnemonic.length, dispatch]);

  const [idx1, idx2] = useMemo(
    () => (mnemonic.length ? pickTwoIndices(mnemonic.length) : [0, 0]),
    [mnemonic.length]
  );

  const [word1, setWord1] = useState("");
  const [word2, setWord2] = useState("");
  const [error1, setError1] = useState("");
  const [error2, setError2] = useState("");

  const verified =
    mnemonic.length > 0 &&
    word1 === mnemonic[idx1] &&
    word2 === mnemonic[idx2];

  // Inline validation: empty -> "Required field", mismatch -> "Word doesn't
  // match", match -> cleared.
  const verifyWord = (
    expected: string,
    input: string,
    setError: React.Dispatch<React.SetStateAction<string>>
  ): void => {
    if (input === "") {
      setError("Required field");
      return;
    }
    setError(input !== expected ? "Word doesn't match" : "");
  };

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!verified) return;
    dispatch({ type: "goToStep", step: "create.name" });
  };

  return (
    <>
      <p
        className={clsx(
          "text-ink-2 text-sm -mt-2 mb-6",
          "mx-auto max-w-[90%] text-center font-medium"
        )}
      >
        Fill out the words according to their numbers
      </p>
      <Stack
        className="flex-1 justify-between"
        gap={8}
        as="form"
        onSubmit={onSubmit}
      >
        <Stack
          gap={GapPatterns.FormFields}
          className="justify-center flex-1"
        >
          <Input
            label={`Word #${idx1 + 1}`}
            value={word1}
            error={error1}
            onChange={(e) => {
              const value = e.target.value.trim();
              setWord1(value);
              verifyWord(mnemonic[idx1], value, setError1);
            }}
          />
          <Input
            label={`Word #${idx2 + 1}`}
            value={word2}
            error={error2}
            onChange={(e) => {
              const value = e.target.value.trim();
              setWord2(value);
              verifyWord(mnemonic[idx2], value, setError2);
            }}
          />
        </Stack>
        <ActionButton
          size="lg"
          type="submit"
          disabled={!verified}
          backgroundHoverColor="black"
          textHoverColor="primary"
        >
          Next
        </ActionButton>
      </Stack>
    </>
  );
};
