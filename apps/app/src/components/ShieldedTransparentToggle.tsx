import { twMerge } from "tailwind-merge";
import { Toggle } from "../components/Toggle";

export function ShieldedTransparentToggle({
  isTransparent,
  setIsTransparent,
}: {
  isTransparent: boolean;
  setIsTransparent: (value: boolean) => void;
}) {
  return (
    <Toggle
      active={isTransparent}
      onChange={(v) => setIsTransparent(v)}
      className="h-11 w-full border border-gray-300"
      toggleClassname={twMerge("w-1/2", isTransparent && "bg-black")}
    >
      <div className="h-full grid grid-cols-2 items-center font-medium">
        <div>Shielded</div>
        <div className={twMerge(isTransparent && "text-white transition-all")}>
          Transparent
        </div>
      </div>
    </Toggle>
  );
}
