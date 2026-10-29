/**
 * GSAP-driven step transition: when `stepKey` changes, the outgoing content
 * fades/slides out and the incoming content fades/slides in.
 */
import gsap from "gsap";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  /** Changes whenever the rendered step changes; drives the transition. */
  stepKey: string;
  children: ReactNode;
};

export const StepTransition = ({ stepKey, children }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Hold the currently-displayed content so we can animate the swap.
  const [displayed, setDisplayed] = useState<{ key: string; node: ReactNode }>({
    key: stepKey,
    node: children,
  });

  // Animate in on first mount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { autoAlpha: 0 },
      { autoAlpha: 1, y: 0, duration: 0.15, ease: "power3.out" }
    );
    // first-mount only
  }, []);

  // On step change: fade out current, swap content, fade in.
  useEffect(() => {
    if (stepKey === displayed.key) {
      // Same step, just refresh the node (e.g. props changed).
      setDisplayed({ key: stepKey, node: children });
      return;
    }
    const el = containerRef.current;
    if (!el) {
      setDisplayed({ key: stepKey, node: children });
      return;
    }
    const tl = gsap.timeline();
    tl.to(el, {
      autoAlpha: 0,
      duration: 0.18,
      ease: "power3.out",
      onComplete: () => setDisplayed({ key: stepKey, node: children }),
    }).fromTo(
      el,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.15, ease: "power3.out" }
    );
    return () => {
      tl.kill();
    };
  }, [stepKey, children]);

  return (
    <div ref={containerRef} className="flex flex-col flex-1 h-full">
      {displayed.node}
    </div>
  );
};
