import clsx from "clsx";
import React, { createElement, useState } from "react";
import { tv } from "tailwind-variants";

import { ContentMasker, CopyToClipboardControl } from "@zillions/components";
import { matchMapFn } from "@zillions/utils";
import { CgSpinner } from "react-icons/cg";
import { GoEye, GoEyeClosed } from "react-icons/go";

import { secretInputProps } from "./secretInput";

const inputClassList = tv({
  slots: {
    field: clsx(
      "border border-transparent rounded-textField bg-black/[0.05] text-black text-[15px] font-medium leading-[1.25]",
      "py-3.5 px-4 w-full outline-0 transition-[background-color,border-color] duration-150 ease-out",
      "hover:bg-black/[0.07] focus:bg-transparent focus:border-black",
      "placeholder:text-muted placeholder:font-normal",
    ),
    label: "text-black text-[13px] font-medium [&_p]:pb-1",
    labelText: "pl-1.5",
    error: "text-danger hidden text-xs font-medium pl-1.5 pt-1",
    inputWrapper: "flex relative",
    icon: clsx(
      "flex items-center cursor-pointer h-full absolute right-4 top-0 text-lg",
      "text-muted transition-colors hover:text-black"
    ),
    hint: "text-muted hidden text-xs font-medium pl-1.5 pt-1",
  },
  variants: {
    hasError: {
      true: {
        field: "!border-danger",
        inputWrapper: "mb-1",
        error: "block",
      },
    },
    hasLabel: {
      true: {
        inputWrapper: "mt-2",
      },
    },
    hasIcon: {
      true: {
        field: "pr-12",
      },
    },
    hasHint: {
      true: {
        hint: "block",
      },
    },
    isSensitive: {
      true: {},
    },
    theme: {
      primary: { field: "border-black" },
      secondary: { field: "border-cyan" },
      neutral: {},
    },
  },
  compoundVariants: [],
  defaultVariants: {
    theme: "neutral",
  },
});

type InputVariants =
  | "Password"
  | "PasswordOnBlur"
  | "Text"
  | "Textarea"
  | "ReadOnlyCopy"
  | "ReadOnlyCopyText";

export type InputProps = {
  label?: string | React.ReactNode;
  error?: string | React.ReactNode;
  sensitive?: boolean;
  loading?: boolean;
  hint?: string | React.ReactNode;
  theme?: "primary" | "secondary" | "neutral";
  hideIcon?: boolean;
  children?: React.ReactNode;
  variant?: InputVariants;
  rows?: number;
  "data-testid"?: string;
  valueToDisplay?: string;
} & React.ComponentPropsWithoutRef<"input">;

export const Input = ({
  variant = "Text",
  label,
  error,
  hint,
  theme,
  hideIcon = false,
  sensitive = false,
  loading = false,
  children,
  rows = 3,
  className,
  valueToDisplay,
  "data-testid": dataTestId,
  ...props
}: InputProps) => {
  const [passwordShown, setPasswordShown] = useState(false);
  let icon: React.ReactNode | null = null;
  const inputElement: InputProps = { type: "text", ...props };
  const secret = (shown: boolean): InputProps => {
    const { style, ...rest } = secretInputProps(!shown);
    return { ...rest, style: { ...props.style, ...style } };
  };

  const iconMap: Partial<Record<InputVariants, () => void>> = {
    Password: () => {
      icon = (
        <span
          role="button"
          className={classes.icon()}
          aria-labelledby={passwordShown ? "Hide password" : "Display password"}
          onClick={() => setPasswordShown(!passwordShown)}
        >
          {passwordShown ?
            <GoEye />
            : <GoEyeClosed />}
        </span>
      );
    },
    ReadOnlyCopy: () => {
      icon = (
        <CopyToClipboardControl
          className={classes.icon()}
          value={props.value?.toString() || ""}
        />
      );
    },
    ReadOnlyCopyText: () => {
      icon = (
        <CopyToClipboardControl
          className={classes.icon()}
          value={props.value?.toString() || ""}
        />
      );
    },
  };

  const inputElementMap: Partial<Record<InputVariants, () => void>> = {
    Password: () => {
      Object.assign(inputElement, secret(passwordShown));
    },
    ReadOnlyCopy: () => {
      inputElement["readOnly"] = true;
    },
    ReadOnlyCopyText: () => {
      inputElement["readOnly"] = true;
      inputElement["rows"] = rows;
    },
    PasswordOnBlur: () => {
      Object.assign(inputElement, secret(passwordShown));
      inputElement["onBlur"] = () => setPasswordShown(false);
      inputElement["onFocus"] = () => setPasswordShown(true);
    },
    Textarea: () => {
      inputElement["rows"] = rows;
    },
  };

  const classes = inputClassList({
    hasError: !!error,
    hasHint: !!hint,
    hasLabel: !!label,
    hasIcon: iconMap.hasOwnProperty(variant),
    isSensitive: sensitive,
    theme: theme || "neutral",
  });

  matchMapFn(variant.toString(), iconMap);
  matchMapFn(variant.toString(), inputElementMap);
  inputElement["className"] = classes.field();

  if (inputElement.hasOwnProperty("readOnly")) {
    inputElement["value"] = valueToDisplay || props.value || "";
  }

  const htmlTag =
    variant === "Textarea" || variant === "ReadOnlyCopyText" ?
      "textarea"
      : "input";
  const elementChildren =
    variant === "Textarea" || variant === "ReadOnlyCopyText" ?
      props.value
      : null;

  const element = createElement(htmlTag, { ...inputElement }, elementChildren);

  return (
    <label
      data-testid={dataTestId}
      className={classes.label({
        class: clsx(className, {
          "has-error": !!error,
        }),
      })}
    >
      {label && <span className={classes.labelText()}>{label}</span>}
      <div className={classes.inputWrapper()}>
        <>
          {loading && <LoadingSpinner />}
          {sensitive ?
            <ContentMasker hideIcon={loading} color={theme}>
              {element}
            </ContentMasker>
            : element}
        </>
        {!hideIcon && icon}
        {children}
      </div>
      {<span className={clsx(classes.error())}>{error}</span>}
      {<div className={classes.hint()}>{hint}</div>}
    </label>
  );
};

const LoadingSpinner = () => (
  <div className="flex absolute z-10 justify-center items-center w-full h-full">
    <i className=" animate-spin text-primary text-sm w-auto h-full">
      <CgSpinner className="w-auto h-full p-4" />
    </i>
  </div>
);
