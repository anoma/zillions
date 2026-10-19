import { type ReactNode, useId } from "react";

/**
 * A form page: a centered column under a title. With `onSubmit`
 * the column is the `<form>`; its sections stack inside, spaced apart.
 */
export function FormPage({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit?: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const Card = onSubmit ? "form" : "section";

  return (
    <div className="p-10 pt-14 max-sm:px-6">
      <Card
        aria-labelledby={titleId}
        // Isolated so ActionButton's fill, painted at z-index -1, stays above the card.
        className="isolate mx-auto max-w-150 flex flex-col gap-8"
        onSubmit={
          onSubmit &&
          ((e) => {
            e.preventDefault();
            onSubmit();
          })
        }
      >
        <h1
          id={titleId}
          className="text-center text-lg font-semibold tracking-tight"
        >
          {title}
        </h1>
        {children}
      </Card>
    </div>
  );
}
