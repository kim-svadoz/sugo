import { describe, expect, it } from "vitest";
import { syncMarketplaceJson, syncPackageLockJson, syncPluginJson } from "../syncVersion.mjs";

describe("syncVersion — 4파일 하드 규칙 순수 함수", () => {
  describe("syncPluginJson", () => {
    it("버전이 다르면 갱신하고 changed:true를 돌려준다", () => {
      const { text, changed } = syncPluginJson(JSON.stringify({ name: "sugo", version: "0.1.0" }), "0.2.0");
      expect(changed).toBe(true);
      expect(JSON.parse(text).version).toBe("0.2.0");
    });

    it("이미 같은 버전이면 changed:false", () => {
      const { changed } = syncPluginJson(JSON.stringify({ name: "sugo", version: "0.2.0" }), "0.2.0");
      expect(changed).toBe(false);
    });

    it("다른 필드는 그대로 보존한다", () => {
      const input = { name: "sugo", version: "0.1.0", mcpServers: { sugo: { command: "node" } } };
      const { text } = syncPluginJson(JSON.stringify(input), "0.3.0");
      expect(JSON.parse(text)).toEqual({ ...input, version: "0.3.0" });
    });
  });

  describe("syncPackageLockJson", () => {
    const lockFixture = {
      name: "sugo",
      version: "0.1.0",
      lockfileVersion: 3,
      packages: { "": { name: "sugo", version: "0.1.0", dependencies: {} } },
    };

    it("루트 version과 packages[''].version을 둘 다 갱신한다", () => {
      const { text, changed } = syncPackageLockJson(JSON.stringify(lockFixture), "0.2.0");
      const data = JSON.parse(text);
      expect(changed).toBe(true);
      expect(data.version).toBe("0.2.0");
      expect(data.packages[""].version).toBe("0.2.0");
    });

    it("두 곳 다 이미 같은 버전이면 changed:false", () => {
      const { changed } = syncPackageLockJson(JSON.stringify(lockFixture), "0.1.0");
      expect(changed).toBe(false);
    });

    it("한 곳만 어긋나도 changed:true (드리프트 감지)", () => {
      const drifted = { ...lockFixture, version: "0.1.0", packages: { "": { ...lockFixture.packages[""], version: "0.9.9" } } };
      const { changed, text } = syncPackageLockJson(JSON.stringify(drifted), "0.1.0");
      expect(changed).toBe(true);
      expect(JSON.parse(text).packages[""].version).toBe("0.1.0");
    });
  });

  describe("syncMarketplaceJson", () => {
    const marketplaceFixture = {
      name: "sugo-marketplace",
      owner: { name: "김성현" },
      plugins: [{ name: "sugo", source: "./sugo", version: "0.1.0" }],
    };

    it("이름이 일치하는 plugin 항목의 version만 갱신한다", () => {
      const { text, changed } = syncMarketplaceJson(JSON.stringify(marketplaceFixture), "0.2.0", "sugo");
      expect(changed).toBe(true);
      expect(JSON.parse(text).plugins[0].version).toBe("0.2.0");
    });

    it("이름이 다른 plugin은 건드리지 않는다", () => {
      const multi = { ...marketplaceFixture, plugins: [...marketplaceFixture.plugins, { name: "other", version: "9.9.9" }] };
      const { text } = syncMarketplaceJson(JSON.stringify(multi), "0.2.0", "sugo");
      const data = JSON.parse(text);
      expect(data.plugins[0].version).toBe("0.2.0");
      expect(data.plugins[1].version).toBe("9.9.9");
    });

    it("이미 같은 버전이면 changed:false", () => {
      const { changed } = syncMarketplaceJson(JSON.stringify(marketplaceFixture), "0.1.0", "sugo");
      expect(changed).toBe(false);
    });
  });
});
