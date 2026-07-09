import type { ComponentProps } from "react";

export function SpinnerIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" {...props}>
      <path d="M24.4853 7.51469C19.799 2.8284 12.201 2.8284 7.51472 7.51469L4.68629 4.68627C10.9347 -1.56212 21.0653 -1.56212 27.3137 4.68627L24.4853 7.51469Z" />
      <animateTransform
        attributeName="transform"
        dur="1s"
        repeatCount="indefinite"
        type="rotate"
        values="0 0 0;360 0 0"
        calcMode="spline"
        keyTimes="0; 1"
        keySplines="0.25 0.1 0.25 1"
      />
    </svg>
  );
}
