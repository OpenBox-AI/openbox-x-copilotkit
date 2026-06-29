// Headless-Chrome smoke e2e for the OpenBox x CopilotKit demo.
// Discovers a workflow suggestion chip at runtime (chip names are dynamic),
// triggers it, and asserts a governance card renders a terminal verdict — i.e.
// the full UI -> agent -> SDK -> Core pipeline works with the rebuilt SDK.
// Usage: node scripts/e2e-smoke.mjs   (APP_URL defaults to http://localhost:3001)
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL || "http://localhost:3001";
const VISIBLE_TIMEOUT = 180_000;
const VERDICT = /Allowed|Redacted|Constrained|Blocked|Halted|Rejected/i;
const ART = "artifacts";

const log = (...a) => console.log("[e2e]", ...a);

async function main() {
  const browser = await chromium.launch({
    // Use Playwright's bundled chromium (no system Chrome / sudo needed). Set
    // PLAYWRIGHT_CHANNEL=chrome to opt back into system Chrome.
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.on("console", (m) => {
    const t = m.text();
    if (/error|unavailable|cannot send/i.test(t)) log("page-console:", t);
  });
  let ok = false;
  try {
    log(`goto ${APP_URL}`);
    await page.goto(`${APP_URL}/?reset=e2e-smoke-${process.env.RUN_ID || "1"}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    log("wait for copilot-suggestions");
    await page.getByTestId("copilot-suggestions").waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });

    // Discover the workflow chips actually rendered (names are dynamic).
    const chips = await page
      .getByTestId("copilot-suggestions")
      .getByRole("button")
      .allInnerTexts();
    const names = chips.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
    log("discovered chips:", JSON.stringify(names));
    if (!names.length) throw new Error("no suggestion chips discovered");

    // Prefer an explicit CHIP override, else a read-only/allow-shaped chip, else first.
    const want = process.env.CHIP;
    const preferred =
      (want && names.find((n) => new RegExp(escapeRe(want), "i").test(n))) ||
      names.find((n) => /review|queue|read|status|prepare/i.test(n)) ||
      names[0];
    log("clicking chip:", preferred);
    const btn = page.getByRole("button", { name: new RegExp(escapeRe(preferred), "i") }).first();
    await btn.scrollIntoViewIfNeeded();
    // Chips are disabled until the CopilotKit runtime connects; wait for enabled.
    await btn.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
    const deadline = Date.now() + VISIBLE_TIMEOUT;
    while (Date.now() < deadline) {
      const disabled = await btn.isDisabled().catch(() => true);
      const busy = (await btn.getAttribute("aria-busy").catch(() => null)) === "true";
      if (!disabled && !busy) break;
      await page.waitForTimeout(500);
    }
    await btn.click({ timeout: VISIBLE_TIMEOUT });

    log("wait for a governance card");
    const card = page.locator(".obx-governance-card").last();
    await card.waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });

    log("wait for a terminal verdict on the card");
    await card.getByText(VERDICT).first().waitFor({ state: "visible", timeout: VISIBLE_TIMEOUT });
    const cardText = (await card.innerText()).replace(/\s+/g, " ").slice(0, 400);
    log("governance card text:", cardText);

    // Negative checks: no raw governance leakage / no governance-unavailable.
    const body = await page.locator("body").innerText();
    for (const bad of ["Governance unavailable", "schemaVersion", "openbox.copilotkit.result.v1", "Cannot send event type"]) {
      if (body.includes(bad)) throw new Error(`unexpected UI text present: ${bad}`);
    }

    await page.screenshot({ path: `${ART}/e2e-smoke.png`, fullPage: true });
    log(`screenshot -> ${ART}/e2e-smoke.png`);
    ok = true;
    log("PASS: governance card rendered a verdict for chip:", preferred);
  } catch (err) {
    log("FAIL:", err?.message || err);
    try {
      await page.screenshot({ path: `${ART}/e2e-smoke-fail.png`, fullPage: true });
      log(`failure screenshot -> ${ART}/e2e-smoke-fail.png`);
    } catch {}
  } finally {
    await browser.close();
  }
  process.exit(ok ? 0 : 1);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();
