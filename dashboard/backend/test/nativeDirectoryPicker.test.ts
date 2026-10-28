import { describe, expect, it, vi } from "vitest";
import { selectNativeDirectory } from "../src/services/nativeDirectoryPicker.js";

describe("native directory picker", () => {
  it("opens the macOS folder chooser and returns its POSIX path", async () => {
    const run = vi.fn(async () => ({ stdout: "/Users/me/project\n" }));
    await expect(selectNativeDirectory("darwin", run)).resolves.toBe("/Users/me/project");
    expect(run).toHaveBeenCalledWith("osascript", expect.arrayContaining(["-e"]));
  });

  it("opens the Windows folder chooser and returns the selected path", async () => {
    const run = vi.fn(async () => ({ stdout: "C:\\work\\project\r\n" }));
    await expect(selectNativeDirectory("win32", run)).resolves.toBe("C:\\work\\project");
    expect(run).toHaveBeenCalledWith("powershell.exe", expect.arrayContaining(["-Command"]));
  });

  it("uses the in-app browser fallback on unsupported desktop platforms", async () => {
    const run = vi.fn();
    await expect(selectNativeDirectory("linux", run)).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
});
