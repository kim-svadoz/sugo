export interface MemoSaveKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
}

export function isMemoSaveShortcut(event: MemoSaveKey): boolean {
  return event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}
