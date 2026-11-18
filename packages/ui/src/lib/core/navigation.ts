export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Only the exact path is current (the start page); otherwise its sub-paths count too. */
  exact?: boolean;
};

const trimSlash = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/** Whether `href` is the page shown at `currentPath` (a trailing slash doesn't matter). */
export function isCurrent(item: Pick<NavItem, 'href' | 'exact'>, currentPath: string): boolean {
  const href = trimSlash(item.href);
  const path = trimSlash(currentPath);
  return item.exact ? path === href : path === href || path.startsWith(`${href}/`);
}
