import type { ReactNode } from 'react';

interface ShellProps {
  nav: ReactNode;
  children: ReactNode;
}

/**
 * The frame every module screen renders inside. The design system shared by
 * all modules grows from here (PRD 5.4).
 */
export function Shell({ nav, children }: ShellProps) {
  return (
    <div>
      <nav aria-label="Modules">{nav}</nav>
      <main>{children}</main>
    </div>
  );
}
