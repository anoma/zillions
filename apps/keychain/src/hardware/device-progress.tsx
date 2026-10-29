/**
 * What a device session has done and what the device waits on now, with a
 * way out. Steps the device skips (already unlocked, app already open) show
 * as done once a later one is reached. Device-agnostic: the caller supplies
 * the steps and their copy.
 */
import { ActionButton, Alert, Stack } from "@zillions/components";
import clsx from "clsx";
import { CgSpinner } from "react-icons/cg";
import { GoCheckCircleFill } from "react-icons/go";

import type { DeviceProgressStep } from "./types";

type Props = {
  steps: DeviceProgressStep[];
  /** The step the device waits on; undefined before the first report. */
  current?: string;
  error?: string;
  onCancel: () => void;
  onRetry: () => void;
};

export const DeviceProgress = ({
  steps,
  current,
  error,
  onCancel,
  onRetry,
}: Props) => {
  const at = steps.findIndex((step) => step.key === current);

  return (
    <Stack gap={4} data-testid="device-progress">
      <ol className="flex flex-col gap-3 border border-black rounded-lg p-5">
        {steps.map((step, i) => {
          const done = i < at;
          const active = i === at;
          return (
            <li
              key={step.key}
              aria-current={active ? "step" : undefined}
              className={clsx(
                "grid grid-cols-[24px_1fr] gap-3 items-start transition-opacity",
                !done && !active && "opacity-40"
              )}
            >
              <span className="flex h-6 items-center justify-center text-xl">
                {done ?
                  <GoCheckCircleFill />
                : active && !error ?
                  <CgSpinner className="animate-spin" />
                : <span className="block w-4 h-4 rounded-full border-2 border-current" />
                }
              </span>
              <span>
                <span className={clsx("block", active && "font-semibold")}>
                  {step.title}
                </span>
                {active && step.hint && (
                  <span className="block text-sm text-neutral-600">
                    {step.hint}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {error && (
        <Alert title="Error" type="error">
          {error}
        </Alert>
      )}
      <Stack direction="horizontal" gap={2}>
        {error && (
          <ActionButton
            size="lg"
            backgroundHoverColor="black"
            textHoverColor="primary"
            onClick={onRetry}
          >
            Try again
          </ActionButton>
        )}
        <ActionButton
          size="lg"
          outlineColor="black"
          backgroundHoverColor="black"
          textHoverColor="primary"
          onClick={onCancel}
        >
          Cancel
        </ActionButton>
      </Stack>
    </Stack>
  );
};
