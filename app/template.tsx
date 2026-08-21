import type { ReactNode } from "react";

/**
 * Remounts on every navigation which triggers the page
 * transition animation. The header lives in layout so remains static.
 */
export default function Template({ children }: { children: ReactNode }) {
    return <div className="page-enter">{children}</div>;
}