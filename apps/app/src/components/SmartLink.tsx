import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

const isExternalUrl = (url: string): boolean =>
  url.startsWith("http") || url.startsWith("mailto");

export function SmartLink({
  href,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  const isExternal = isExternalUrl(href);

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props} />
    );
  }

  return <Link to={href} {...props} />;
}
