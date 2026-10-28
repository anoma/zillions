import clsx from "clsx";
import { useId, useState } from "react";
import { GoEye, GoEyeClosed } from "react-icons/go";

type FieldProps = {
  label?: string;
  error?: string;
  hint?: string;
} & Omit<React.ComponentPropsWithoutRef<"input">, "type">;

const inputClass = (error?: string): string =>
  clsx(
    "w-full h-11 rounded-[10px] border bg-black/[0.025] px-3 text-[13px] font-medium text-black",
    "placeholder:text-muted outline-none transition-[border-color,box-shadow,background-color] duration-150",
    "focus:border-gold focus:bg-transparent focus:shadow-[0_0_0_1px_var(--color-gold)]",
    "disabled:opacity-50",
    error ? "border-danger" : "border-line-strong"
  );

const FieldShell = ({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    {label && (
      <label htmlFor={id} className="block mb-1.5 text-[11.5px] font-semibold text-ink-2">
        {label}
      </label>
    )}
    {children}
    {(error || hint) && (
      <p className={clsx("m-0 mt-1.5 text-[11px]", error ? "text-danger" : "text-muted")}>
        {error || hint}
      </p>
    )}
  </div>
);

export const TextField = ({ label, error, hint, id, ...props }: FieldProps) => {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <FieldShell id={inputId} label={label} error={error} hint={hint}>
      <input id={inputId} type="text" className={inputClass(error)} {...props} />
    </FieldShell>
  );
};

export const PasswordField = ({ label, error, hint, id, ...props }: FieldProps) => {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [shown, setShown] = useState(false);
  return (
    <FieldShell id={inputId} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          id={inputId}
          type={shown ? "text" : "password"}
          autoComplete="current-password"
          className={clsx(inputClass(error), "pr-10")}
          {...props}
        />
        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown(!shown)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-md text-muted cursor-pointer hover:text-black [&_svg]:size-4"
        >
          {shown ? <GoEye /> : <GoEyeClosed />}
        </button>
      </div>
    </FieldShell>
  );
};
