import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export type AppPath = "/" | "/data-explorer" | "/templates" | "/security" | "/profile" | "/login";

export function getCurrentPath(): AppPath {
  const path = window.location.pathname;

  if (path === "/types") {
    window.history.replaceState(null, "", "/templates");
    return "/templates";
  }

  if (path === "/data-explorer" || path === "/templates" || path === "/security" || path === "/profile" || path === "/login") {
    return path;
  }

  return "/";
}

interface SpaLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  ariaLabel?: string;
  children: ReactNode;
  onNavigate?: () => void;
  to: AppPath;
}

export const SpaLink = forwardRef<HTMLAnchorElement, SpaLinkProps>(function SpaLink(
  { ariaLabel, children, className, onClick, onNavigate, to, ...props },
  ref
) {
  function navigate(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();

    if (window.location.pathname !== to) {
      window.history.pushState(null, "", to);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }

    onNavigate?.();
  }

  return (
    <a
      {...props}
      aria-label={ariaLabel}
      className={className}
      href={to}
      ref={ref}
      onClick={navigate}
    >
      {children}
    </a>
  );
});
