import type { AnchorHTMLAttributes, ReactNode } from "react";
import { navigate } from "../lib/store";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  children: ReactNode;
};

/** Hash-router link */
export function Link({ to, children, ...rest }: Props) {
  return (
    <a
      href={`#${to}`}
      onClick={(e) => {
        if (rest.onClick) rest.onClick(e);
        if (!e.defaultPrevented && (rest.target === undefined || rest.target === "_self")) {
          // default anchor behaviour updates the hash — keep it
        }
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function NavItem(props: Props) {
  return <Link {...props} />;
}

export function GoButton({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <button className={className} onClick={() => navigate(to)}>
      {children}
    </button>
  );
}
