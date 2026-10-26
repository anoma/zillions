import { Badge } from "@zillions/components";
import clsx from "clsx";
import { useState } from "react";
import { GoCheckCircleFill, GoXCircleFill } from "react-icons/go";

type Props = {
  children: React.ReactNode;
  successMessage: string;
  errorMessage: string;
  "data-testid"?: string;
  onAction: () => void;
} & React.ComponentPropsWithoutRef<"button">;

export const FeedbackButton = ({
  children,
  successMessage,
  errorMessage,
  onAction,
  "data-testid": dataTestid,
  ...props
}: Props) => {
  const [displaySuccess, setDisplaySuccess] = useState(false);
  const [displayError, setDisplayError] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState("");

  const reset = (): void => {
    setDisplaySuccess(false);
    setDisplayError(false);
  };

  const onPerformClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    reset();

    try {
      onAction();
      setDisplaySuccess(true);
    } catch {
      setDisplayError(true);
    }

    setFeedbackKey(`feedback-${new Date().getTime()}`);
  };

  let icon = null;
  if (displaySuccess) icon = <GoCheckCircleFill />;
  if (displayError) icon = <GoXCircleFill />;

  return (
    <div className="relative">
      <button
        data-testid={dataTestid}
        onClick={onPerformClick}
        className={clsx(
          "text-black font-medium underline text-xs hover:text-neutral-hover",
          props.className
        )}
      >
        {children}
      </button>
      {(displaySuccess || displayError) && (
        <div
          key={feedbackKey}
          onAnimationEnd={reset}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 animate-feedback"
        >
          <Badge
            icon={icon}
            className={clsx({
              "bg-success": displaySuccess,
              "bg-fail": displayError,
            })}
          >
            {displaySuccess && successMessage}
            {displayError && errorMessage}
          </Badge>
        </div>
      )}
    </div>
  );
};
