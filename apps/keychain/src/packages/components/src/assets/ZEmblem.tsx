/**
 * Gold Z emblem that turns on its vertical axis to face the pointer, with a
 * light sheen sweeping across the metal as it turns. Plain CSS transforms
 * driven by a small requestAnimationFrame loop; no animation library.
 */
import { useEffect, useRef } from "react";
import { twMerge } from "tailwind-merge";

const SRC = "/assets/images/z-emblem.webp";
const MAX_ANGLE_DEG = 30;
// Time constant of the exponential easing toward the pointer, in seconds.
const SMOOTHING_S = 0.12;

type ZEmblemProps = { className?: string };

export const ZEmblem = ({ className }: ZEmblemProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const sheen = sheenRef.current;
    if (!card || !sheen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Pointer position across the window, -1 (left edge) to 1 (right edge).
    let target = 0;
    let current = 0;
    let frame = 0;
    let lastTime = 0;

    const paint = (): void => {
      card.style.transform = `rotateY(${(current * MAX_ANGLE_DEG).toFixed(2)}deg)`;
      sheen.style.backgroundPositionX = `${50 - current * 25}%`;
    };

    const tick = (now: number): void => {
      // Clamp dt so a throttled background tab doesn't snap on resume.
      const dt = Math.min(now - lastTime, 64) / 1000;
      lastTime = now;
      current += (target - current) * (1 - Math.exp(-dt / SMOOTHING_S));
      if (Math.abs(target - current) < 0.001) {
        current = target;
        frame = 0;
      } else {
        frame = requestAnimationFrame(tick);
      }
      paint();
    };

    const wake = (): void => {
      if (frame) return;
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent): void => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      target = Math.max(-1, Math.min(1, x));
      wake();
    };
    const onLeave = (): void => {
      target = 0;
      wake();
    };

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={twMerge("perspective-[700px]", className)}>
      <div ref={cardRef} className="relative will-change-transform">
        <img
          src={SRC}
          alt="Zillions"
          draggable={false}
          className="block w-full"
        />
        <div
          ref={sheenRef}
          aria-hidden
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            WebkitMaskImage: `url(${SRC})`,
            maskImage: `url(${SRC})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            backgroundImage:
              "linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.75) 50%, transparent 60%)",
            backgroundSize: "300% 100%",
            backgroundPositionX: "50%",
          }}
        />
      </div>
    </div>
  );
};
