import { readFileSync } from "node:fs";

const entries = Object.fromEntries(
  readFileSync(new URL("./ports.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")),
);

const number = (key) => {
  const value = Number(entries[key]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`Invalid ${key} in ports.env`);
  return value;
};

export const PORTS = Object.freeze({
  mysql: number("SUGO_MYSQL_PORT"),
  localApi: number("SUGO_LOCAL_API_PORT"),
  localUi: number("SUGO_LOCAL_UI_PORT"),
  e2eApi: number("SUGO_E2E_API_PORT"),
  e2eUi: number("SUGO_E2E_UI_PORT"),
  e2eOidc: number("SUGO_E2E_OIDC_PORT"),
  e2eBitbucket: number("SUGO_E2E_BITBUCKET_PORT"),
});

if (new Set(Object.values(PORTS)).size !== Object.values(PORTS).length) {
  throw new Error("Duplicate ports in ports.env");
}

export const LOCAL_API_URL = `http://localhost:${PORTS.localApi}`;
export const LOCAL_UI_URL = `http://localhost:${PORTS.localUi}`;
export const E2E_API_URL = `http://localhost:${PORTS.e2eApi}`;
export const E2E_UI_URL = `http://localhost:${PORTS.e2eUi}`;
export const E2E_OIDC_URL = `http://localhost:${PORTS.e2eOidc}`;
export const E2E_BITBUCKET_URL = `http://localhost:${PORTS.e2eBitbucket}`;
