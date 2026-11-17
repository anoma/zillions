/**
 * Enables an approval window's decision buttons only once the window has been
 * focused, visible, full-size, on screen, still and left alone for
 * `READY_DELAY_MS`. Any website can summon this window, and it takes focus
 * where the site can predict, so without the delay a click or keystroke the
 * user aimed at the site lands on a decision instead. Clicks count as well as
 * keys: a site can keep the user clicking through the delay, and the button
 * doesn't see clicks while it's disabled.
 */
import { useEffect, useRef, useState } from "react";

import { windowFits } from "../windowSize";

export const READY_DELAY_MS = 1_000;
const TICK_MS = 100;

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable) ||
  (target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "submit", "reset"].includes(target.type));

/** `availLeft`/`availTop` are missing from TypeScript's DOM types. */
const available = () => {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    availLeft: s.availLeft ?? 0,
    availTop: s.availTop ?? 0,
    availWidth: s.availWidth,
    availHeight: s.availHeight,
  };
};

/**
 * `ready` for rendering; `readyRef` for event handlers that must read it now.
 * While `held` (the decision can't be taken yet) the delay doesn't start, so
 * what enables it stays on screen a full delay before it can be clicked.
 */
export const useClickGuard = (held = false) => {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const heldRef = useRef(held);
  heldRef.current = held;

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
    const onPointerDown = () => {
      if (!readyRef.current) restart();
    };

    const tick = () => {
      const now = `${window.screenX},${window.screenY}`;
      if (
        heldRef.current ||
        !document.hasFocus() ||
        document.visibilityState !== "visible" ||
        !windowFits(window, available()) ||
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
    window.addEventListener("pointerdown", onPointerDown, true);
    const interval = setInterval(tick, TICK_MS);
    tick();

    return () => {
      events.forEach((type) => window.removeEventListener(type, restart));
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      clearInterval(interval);
    };
  }, []);

  return { ready, readyRef };
};
