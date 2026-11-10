/**
 * Enables an approval window's decision buttons only once the window has been
 * focused, visible and still for `READY_DELAY_MS`. Any website can summon this
 * window, and it takes focus where the site can predict, so without the delay
 * a click or keystroke the user aimed at the site lands on a decision instead.
 */
import { useEffect, useRef, useState } from "react";

export const READY_DELAY_MS = 1_000;
const TICK_MS = 100;

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable) ||
  (target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "submit", "reset"].includes(target.type));

/** `ready` for rendering; `readyRef` for event handlers that must read it now. */
export const useClickGuard = () => {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    let since: number | undefined;
    let position = `${window.screenX},${window.screenY}`;

    const set = (value: boolean) => {
      readyRef.current = value;
      setReady(value);
    };
    const restart = () => {
      since = undefined;
      set(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Keys outside a text field are typing meant for some other window.
      if (!isTextEntry(e.target)) restart();
    };

    const tick = () => {
      const now = `${window.screenX},${window.screenY}`;
      if (
        !document.hasFocus() ||
        document.visibilityState !== "visible" ||
        now !== position
      ) {
        position = now;
        restart();
        return;
      }
      since ??= Date.now();
      if (!readyRef.current && Date.now() - since >= READY_DELAY_MS) set(true);
    };

    const events = ["focus", "blur", "resize"] as const;
    events.forEach((type) => window.addEventListener(type, restart));
    document.addEventListener("visibilitychange", restart);
    window.addEventListener("keydown", onKeyDown, true);
    const interval = setInterval(tick, TICK_MS);
    tick();

    return () => {
      events.forEach((type) => window.removeEventListener(type, restart));
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("keydown", onKeyDown, true);
      clearInterval(interval);
    };
  }, []);

  return { ready, readyRef };
};
