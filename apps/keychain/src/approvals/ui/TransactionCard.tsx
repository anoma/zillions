/**
 * One row of a transaction summary (icon + title + content).
 */
import clsx from "clsx";
import { ReactNode } from "react";

import { Heading } from "@zillions/components";

type TransactionCardProps = {
  title: ReactNode;
  content: ReactNode;
  icon: ReactNode;
};

export const TransactionCard = ({
  title,
  content,
  icon,
}: TransactionCardProps) => {
  return (
    <article
      className={clsx(
        "grid grid-cols-[max-content_auto] items-center gap-3",
        "px-4 py-3 border border-neutral-500 rounded-md"
      )}
    >
      <i className="text-2xl text-neutral-500">{icon}</i>
      <div className="leading-[1.2]">
        <Heading level="h2" className="text-base text-black">
          {title}
        </Heading>
        <p className="text-sm text-neutral-400 font-medium">{content}</p>
      </div>
    </article>
  );
};
