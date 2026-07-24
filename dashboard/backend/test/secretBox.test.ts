import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/security/secretBox.js";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

describe("secretBox (AES-256-GCM)", () => {
  it("round-trips plaintext", () => {
    const enc = encryptSecret("my-bitbucket-pat-12345", KEY);
    expect(decryptSecret(enc, KEY)).toBe("my-bitbucket-pat-12345");
  });

  it("never stores the plaintext in ct/iv/tag", () => {
    const enc = encryptSecret("super-secret-token", KEY);
    expect(enc.ct).not.toContain("super-secret-token");
  });

  it("반드시 거부: 잘못된 키로 복호화하면 실패한다(탬퍼/키불일치 감지)", () => {
    const enc = encryptSecret("token", KEY);
    expect(() => decryptSecret(enc, OTHER_KEY)).toThrow();
  });

  it("반드시 거부: 변조된 ciphertext는 auth tag 검증에서 실패한다", () => {
    const enc = encryptSecret("token", KEY);
    const tampered = { ...enc, ct: Buffer.from("tampered-ciphertext").toString("base64") };
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it("키가 없으면 명확히 에러를 낸다(조용히 통과 금지)", () => {
    expect(() => encryptSecret("token", "")).toThrow(/SECRET_ENC_KEY/);
  });

  it("키 길이가 32바이트가 아니면 에러", () => {
    const shortKey = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("token", shortKey)).toThrow(/32 bytes/);
  });
});
