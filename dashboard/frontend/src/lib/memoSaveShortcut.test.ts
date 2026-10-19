import { describe, expect, it } from "vitest";
import { isMemoSaveShortcut } from "./memoSaveShortcut.js";

describe("isMemoSaveShortcut", () => {
  it("accepts Command+S and Ctrl+S", () => {
    expect(isMemoSaveShortcut({ key: "s", metaKey: true, ctrlKey: false, altKey: false })).toBe(true);
    expect(isMemoSaveShortcut({ key: "S", metaKey: false, ctrlKey: true, altKey: false })).toBe(true);
  });

  it("does not claim plain S or Alt-modified shortcuts", () => {
    expect(isMemoSaveShortcut({ key: "s", metaKey: false, ctrlKey: false, altKey: false })).toBe(false);
    expect(isMemoSaveShortcut({ key: "s", metaKey: true, ctrlKey: false, altKey: true })).toBe(false);
  });
});
