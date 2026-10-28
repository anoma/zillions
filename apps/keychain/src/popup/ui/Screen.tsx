import clsx from "clsx";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Wraps the routed screen so each navigation slides in: forward from the
 * right, back from the left, replacements fade. Keyed by location, so React
 * mounts a fresh element and the animation replays. The first screen (key
 * "default") only fades: its "POP" is the page load, not a back step.
 */
export const Screen = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const type = location.key === "default" ? "REPLACE" : navigationType;
  return (
    <div
      key={location.key}
      className={clsx(
        "flex flex-col flex-1 min-h-0 overflow-y-auto px-5 [scrollbar-width:thin]",
        type === "PUSH" && "animate-screen-forward",
        type === "POP" && "animate-screen-back",
        type === "REPLACE" && "animate-screen-fade"
      )}
    >
      {children}
    </div>
  );
};
