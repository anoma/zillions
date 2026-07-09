import { SpinnerIcon } from "../icons/SpinnerIcon";

export function PageLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <SpinnerIcon className="size-8 text-gold" />
    </div>
  );
}
