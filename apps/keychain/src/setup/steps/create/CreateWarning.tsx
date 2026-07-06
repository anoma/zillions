/**
 * Create > step 1: seed-phrase safety warning with a countdown gate.
 */
import {
  ActionButton,
  SeedPhraseInstructions,
  Stack,
} from "@zillions/components";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { GoAlertFill } from "react-icons/go";

import { useWizard } from "../../SetupContext";

const { NODE_ENV } = process.env;
const TIMEOUT = NODE_ENV === "development" ? 50 : 1000;

export const CreateWarning = (): JSX.Element => {
  const { dispatch } = useWizard();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), TIMEOUT);
    return () => clearTimeout(id);
  }, [countdown]);

  return (
    <>
      <Stack className="mb-8" gap={5}>
        <aside className="flex items-center border-t border-b border-neutral-500 justify-center py-10 w-full">
          <div className="flex justify-center mx-auto text-primary text-[125px] leading-[1]">
            <GoAlertFill />
          </div>
        </aside>
        <div className="text-sm">
          <SeedPhraseInstructions />
        </div>
      </Stack>
      <footer>
        <ActionButton
          data-testid={countdown === 0 ? "setup-show-phrase-button" : undefined}
          size="lg"
          backgroundHoverColor="black"
          textHoverColor="primary"
          className={clsx({ "pointer-events-none opacity-50": countdown > 0 })}
          onClick={() => dispatch({ type: "goToStep", step: "create.seed" })}
        >
          I understood, show my phrase {countdown > 0 && `[ ${countdown} ]`}
        </ActionButton>
      </footer>
    </>
  );
};
