export const SIDEBAR_DESTINATIONS = [
  { to: "/sessions", label: "Workspaces", shortcut: "1" },
  { to: "/schedule", label: "Schedule", shortcut: "2" },
  { to: "/skills", label: "Skills", shortcut: "3" },
  { to: "/harness", label: "Harness", shortcut: "4" },
  { to: "/playbook", label: "Playbook", shortcut: "5" },
  { to: "/settings", label: "Settings", shortcut: "6" },
] as const;

export function sidebarShortcutPath(key: string): string | null {
  return SIDEBAR_DESTINATIONS.find((item) => item.shortcut === key)?.to ?? null;
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
