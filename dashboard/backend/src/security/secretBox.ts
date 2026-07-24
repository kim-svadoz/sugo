import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ct: string;
  iv: string;
  tag: string;
}

// §8: "PAT 암호화: AES-256-GCM, 키 = SECRET_ENC_KEY(base64 32B)". ct/iv/tag
// stored separately (see user_bitbucket_tokens schema) - never plaintext.
export function encryptSecret(plaintext: string, keyBase64: string): EncryptedSecret {
  const key = decodeKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ct: ct.toString("base64"), iv: iv.toString("base64"), tag: tag.toString("base64") };
}

export function decryptSecret(enc: EncryptedSecret, keyBase64: string): string {
  const key = decodeKey(keyBase64);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(enc.ct, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

function decodeKey(keyBase64: string): Buffer {
  if (!keyBase64) {
    throw new Error("SECRET_ENC_KEY not configured");
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("SECRET_ENC_KEY must decode to exactly 32 bytes");
  }
  return key;
}
