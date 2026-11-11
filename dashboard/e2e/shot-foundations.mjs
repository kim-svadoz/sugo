import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { E2E_UI_URL } from "../port-contract.mjs";

const output = process.env.SUGO_VISUAL_OUTPUT || join(tmpdir(), "sugo-foundations");
await mkdir(output, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
await page.goto(`${E2E_UI_URL}/foundations.html`, { waitUntil: "networkidle" });
await page.emulateMedia({ reducedMotion: "reduce" });

await page.screenshot({ path: join(output, "foundations-components.png"), fullPage: true });
await page.getByRole("button", { name: "드롭다운" }).click();
await page.screenshot({ path: join(output, "foundations-dropdown.png"), fullPage: true });
await page.getByRole("button", { name: "드롭다운" }).click();
await page.getByRole("button", { name: "모달 열기" }).click();
await page.getByText("검토 요청", { exact: true }).waitFor();
await page.screenshot({ path: join(output, "foundations-modal.png"), fullPage: true });

console.log(output);
await browser.close();
