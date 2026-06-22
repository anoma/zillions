import { twMerge } from "tailwind-merge";

export function PageLoader() {
  return (
    <i
      className={twMerge(
        "absolute w-8 h-8 top-0 left-0 right-0 bottom-0 m-auto border-4",
        "border-transparent border-t-gold rounded-[50%]",
        "animate-loading-spinner",
      )}
    />
  );
}
