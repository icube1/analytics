"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import {
  openExternalUrl,
  shouldOpenExternally,
} from "@/lib/mobile/native-bridge";

type SafeExternalLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: string;
  children: ReactNode;
};

export function SafeExternalLink({
  href,
  children,
  onClick,
  target,
  rel,
  ...rest
}: SafeExternalLinkProps) {
  const external = shouldOpenExternally(href);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (external) {
      event.preventDefault();
      void openExternalUrl(href);
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      target={external ? undefined : target}
      rel={external ? "noopener noreferrer" : rel}
      {...rest}
    >
      {children}
    </a>
  );
}
