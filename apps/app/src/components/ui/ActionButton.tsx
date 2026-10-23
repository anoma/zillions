import { createLink } from "@tanstack/react-router";
import { createElement, type CSSProperties } from "react";
import { twMerge } from "tailwind-merge";
import { tv, type VariantProps } from "tailwind-variants";
import type { Color } from "./types";
import { getDefaultColorString } from "./utils";

const actionButtonShape = tv({
  base: twMerge(
    `group relative inline-flex items-center cursor-pointer min-h-[2em]`,
    `overflow-hidden justify-center text-center font-medium relative`,
    `text-[var(--text-color)] hover:text-[var(--text-hover-color)]`,
    `before:border before:border-transparent`,
    `border-none outline-0 active:top-px`,
    `transition-[--color,--text-color] duration-500 ease-out`,
    `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black`,
  ),
  variants: {
    size: {
      xs: "px-4 py-1.5 text-sm leading-none",
      sm: "px-6 py-2.5 text-sm",
      md: "px-8 py-3 text-base",
      lg: "px-8 py-[0.825em] text-lg",
      xl: "px-10 py-5 text-xl",
    },
    borderRadius: {
      sm: "rounded-sm before:rounded-sm",
      md: "rounded-md before:rounded-md",
      lg: "rounded-lg before:rounded-lg",
      full: "rounded-full before:rounded-full",
    },
    disabled: {
      true: "pointer-events-none cursor-auto opacity-25 active:top-0 text-white before:!border-neutral-500",
    },
    outlined: {
      true: twMerge(
        "before:transition-colors before:border before:border-[var(--outline)] before:absolute",
        "before:left-0 before:top-0 before:w-full before:h-full",
      ),
    },
  },
  defaultVariants: {
    size: "md",
    borderRadius: "full",
  },
});

const actionButtonBackground = tv({
  base: twMerge(
    "absolute left-0 top-0 w-full h-full -z-1 overflow-hidden",
    "grid grid-rows-[100%_100%] group-hover:grid-rows-[0%_100%]",
    "before:bg-[var(--color)] after:bg-[var(--hover)]",
    "transition-all duration-[0.500s] ease-[var(--ease-out-circ)]",
  ),
  variants: {
    disabled: {
      true: "before:bg-neutral-500",
    },
    noHover: {
      true: "group-hover:grid-rows-[100%_100%]",
    },
  },
});

const actionButtonText = tv({
  base: twMerge(
    "relative transition-colors duration-100",
    "text-center w-full",
  ),
});

const actionButtonIcon = tv({
  base: "flex items-center justify-center absolute top-1/2 -translate-y-1/2 w-6",
  variants: {
    position: {
      left: "left-3",
      right: "right-3",
    },
  },
});

type ButtonTailwindVariantsProps = VariantProps<typeof actionButtonShape> &
  VariantProps<typeof actionButtonBackground>;

export type ActionButtonProps<HtmlTag extends keyof HTMLElementTagNameMap> = {
  as?: HtmlTag;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  backgroundColor?: Color;
  backgroundHoverColor?: Color;
  outlineColor?: Color;
  textColor?: Color;
  textHoverColor?: Color;
} & React.ComponentPropsWithoutRef<HtmlTag> &
  Omit<ButtonTailwindVariantsProps, "noHover" | "outlined">;

const Button = <HtmlTag extends keyof HTMLElementTagNameMap = "button">({
  icon,
  iconPosition = "left",
  children,
  className,
  size,
  borderRadius,
  disabled,
  outlineColor,
  textColor: textColorProp,
  backgroundColor: backgroundColorProp,
  backgroundHoverColor: backgroundHoverColorProp,
  textHoverColor: textHoverColorProp,
  as,
  ...domProps
}: ActionButtonProps<HtmlTag>) => {
  const outlined = !!outlineColor;

  const textColor = textColorProp || outlineColor || "on-gold";
  const backgroundColor =
    backgroundColorProp || (outlineColor ? "transparent" : "gold");
  // Default hover for solid (non-outlined) buttons inverts to a black
  // background with primary (gold) text; outlined buttons keep filling with
  // their outline color. Explicit props always win.
  // A black button would barely change on the usual near-black hover.
  const backgroundHoverColor =
    backgroundHoverColorProp ||
    (outlined
      ? outlineColor
      : backgroundColor === "black"
        ? "neutral-700"
        : "neutral-800");
  const textHoverColor = textHoverColorProp || (outlined ? "white" : "white");

  // Resolve each CSS-var string with one getDefaultColorString call.
  const colorString = getDefaultColorString(backgroundColor);
  const hoverString = getDefaultColorString(backgroundHoverColor);
  const textColorString = getDefaultColorString(textColor);
  const textHoverColorString = getDefaultColorString(textHoverColor);
  const outlineColorString = outlined
    ? getDefaultColorString(outlineColor)
    : undefined;

  return createElement(
    as ?? "button",
    {
      className: twMerge(
        actionButtonShape({
          size,
          disabled,
          borderRadius,
          outlined,
        }),
        className,
      ),
      style: {
        "--color": colorString,
        "--hover": hoverString,
        "--text-color": textColorString,
        "--text-hover-color": textHoverColorString,
        "--outline": outlineColorString,
      } as CSSProperties,
      disabled,
      ...domProps,
    },
    <>
      {icon && (
        <i className={actionButtonIcon({ position: iconPosition })}>{icon}</i>
      )}
      <span className={actionButtonText()}>{children}</span>
      <span
        className={actionButtonBackground({
          disabled,
          noHover: hoverString === colorString,
        })}
      />
    </>,
  );
};

const LinkButton = createLink((props: ActionButtonProps<"a">) => (
  <Button as="a" {...props} />
));

export const ActionButton = <HtmlTag extends keyof HTMLElementTagNameMap>(
  props: ActionButtonProps<HtmlTag>,
) => {
  if ("href" in props) {
    const { href, ...otherProps } = props;
    if (href) {
      if (href.startsWith("http") || href.startsWith("blob:")) {
        return <Button as="a" {...(props as ActionButtonProps<"a">)} />;
      }
      return (
        <LinkButton to={href} {...(otherProps as ActionButtonProps<"a">)} />
      );
    }
  }

  return <Button {...props} />;
};
