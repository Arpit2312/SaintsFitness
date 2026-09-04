/**
 * Determines whether a sidebar nav item's href should be highlighted as
 * active for the current pathname.
 *
 * Matching is done on path-segment boundaries (not raw string prefix) so
 * that routes sharing a string prefix don't falsely match each other -
 * e.g. "/students-archive" must NOT match the "/students" nav item.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  const base = href.split("/").slice(0, 2).join("/");
  return pathname === base || pathname.startsWith(base + "/");
}
