export interface SidebarItem { to: string; label: string; shortcut: string; icon: "workspaces" | "schedule" | "weekly" | "skills" | "playbook" | "harness" | "settings" }
export interface SidebarGroup { label: string; title: string; items: readonly SidebarItem[] }

export const SIDEBAR_GROUPS = [
  {
    label: "업무",
    title: "업무 공간",
    items: [
      { to: "/sessions", label: "Workspaces", shortcut: "1", icon: "workspaces" },
      { to: "/schedule", label: "Schedule", shortcut: "2", icon: "schedule" },
      { to: "/weekly", label: "Weekly", shortcut: "3", icon: "weekly" },
    ],
  },
  {
    label: "둘러보기",
    title: "Sugo 둘러보기",
    items: [
      { to: "/skills", label: "Skills", shortcut: "4", icon: "skills" },
      { to: "/playbook", label: "Playbook", shortcut: "5", icon: "playbook" },
    ],
  },
  {
    label: "환경",
    title: "동작 설정",
    items: [
      { to: "/harness", label: "Harness", shortcut: "6", icon: "harness" },
      { to: "/settings", label: "Settings", shortcut: "7", icon: "settings" },
    ],
  },
] as const satisfies readonly SidebarGroup[];

export const SIDEBAR_DESTINATIONS: readonly SidebarItem[] = SIDEBAR_GROUPS.flatMap((group) => [...group.items]);

export function sidebarShortcutPath(key: string): string | null {
  return SIDEBAR_DESTINATIONS.find((item) => item.shortcut === key)?.to ?? null;
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
