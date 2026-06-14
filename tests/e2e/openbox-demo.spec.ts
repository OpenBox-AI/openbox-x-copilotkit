import { expect, test, type Page } from "@playwright/test";

const OPENBOX_VISIBLE_TIMEOUT_MS = 180_000;
const TERMINAL_VERDICT = /Allowed|Redacted|Constrained|Blocked|Halted|Rejected/i;

test.describe("OpenBox x CopilotKit local demo", () => {
  test.describe.configure({ timeout: 900_000 });

  test("renders business workflow suggestions", async ({ page }) => {
    await openFresh(page, "prompt-matrix");

    for (const title of [
      "Review Work Queue",
      "Prepare Exception Report",
      "Draft Customer Update",
      "Send Exception IDs",
      "Prepare Vendor Handoff",
      "Draft Billing Escalation",
      "Issue Service Credit",
      "Update Vendor Bank",
    ]) {
      await expect(page.getByRole("button", { name: new RegExp(title, "i") })).toBeVisible();
    }

    await expect(page.getByRole("button", { name: /Behavior HTTP POST/i })).toHaveCount(0);
  });

  test("work queue prompt renders allow", async ({ page }) => {
    await runSuggestion(page, "Review Work Queue", /Allowed/i);
  });

  test("exception report prompt renders redaction", async ({ page }) => {
    await runSuggestion(page, "Prepare Exception Report", /Allowed|Redacted|Constrained/i);
  });

  test("customer update prompt renders final-output governance", async ({ page }) => {
    await runSuggestion(page, "Draft Customer Update", /Allowed|Redacted|Constrained/i);
  });

  test("exception id export prompt renders goal drift block", async ({ page }) => {
    await runSuggestion(page, "Send Exception IDs", TERMINAL_VERDICT);
  });

  test("external evidence handoff minimal choice renders allowed output", async ({ page }) => {
    await openFresh(page, "partner-minimal");
    await clickSuggestion(page, "Prepare Vendor Handoff");
    await chooseInteractiveOption(page, "Minimal Context");
    await expectOpenBoxDecision(page, /Allowed/i);
    await expectGeneratedResult(page);
    await expectNoUnsafeOutput(page);
  });

  test("external evidence handoff growth choice renders governed output", async ({ page }) => {
    await openFresh(page, "partner-growth");
    await clickSuggestion(page, "Prepare Vendor Handoff");
    await chooseInteractiveOption(page, "Operational Context");
    await expectOpenBoxDecision(page, /Allowed|Redacted|Constrained/i);
    await expectGeneratedResult(page);
    await expectNoUnsafeOutput(page);
  });

  test("external evidence handoff sensitive choice renders governed output", async ({ page }) => {
    await openFresh(page, "partner-sensitive");
    await clickSuggestion(page, "Prepare Vendor Handoff");
    await chooseInteractiveOption(page, "Full Internal Context");
    await expectOpenBoxDecision(page, TERMINAL_VERDICT);
    await expectGeneratedResultWhenReleased(page);
    await expectNoUnsafeOutput(page);
  });

  test("manual input draft submits final user text for governance", async ({ page }) => {
    await openFresh(page, "manual-allowed");
    await clickSuggestion(page, "Draft Billing Escalation");
    await submitManualReview(page);
    await expectOpenBoxDecision(page, TERMINAL_VERDICT);
    await expectGeneratedResultWhenReleased(page);
    await expectNoUnsafeOutput(page);
  });

  test("service credit path handles approval when required", async ({ page }) => {
    await openFresh(page, "approval-approve");
    await clickSuggestion(page, "Issue Service Credit");
    await settleApprovalIfPresent(page, "Approve");
    await expectOpenBoxDecision(page, TERMINAL_VERDICT);
    await expectGeneratedResultWhenReleased(page);
    await expectNoUnsafeOutput(page);

    await openFresh(page, "approval-reject");
    await clickSuggestion(page, "Issue Service Credit");
    await settleApprovalIfPresent(page, "Reject");
    await expectOpenBoxDecision(page, TERMINAL_VERDICT);
    await expectGeneratedResultWhenReleased(page);
    await expectNoUnsafeOutput(page);
  });

  test("halt flow blocks later governed actions in the same session", async ({ page }) => {
    await openFresh(page, "halt");
    await clickSuggestion(page, "Update Vendor Bank");
    await expectOpenBoxDecision(page, TERMINAL_VERDICT);
    await sendChatMessage(
      page,
      "Review this operations queue and tell me what can move forward.",
    );
    await expectOpenBoxDecision(page, TERMINAL_VERDICT);
    await expectNoUnsafeOutput(page);
  });

});

async function runSuggestion(
  page: Page,
  title: string,
  verdict: RegExp,
  options: { expectResult?: boolean } = {},
) {
  await openFresh(page, title.toLowerCase().replace(/\W+/g, "-"));
  await clickSuggestion(page, title);
  await expectOpenBoxDecision(page, verdict);
  if (options.expectResult !== false) {
    await expectGeneratedResultWhenReleased(page);
  }
  await expectNoUnsafeOutput(page);
}

async function openFresh(page: Page, reset: string) {
  await page.goto(`/?reset=e2e-${reset}-${Date.now()}`);
  await expect(page.getByTestId("copilot-suggestions")).toBeVisible();
}

async function clickSuggestion(page: Page, title: string) {
  const button = page.getByRole("button", { name: new RegExp(title, "i") });
  await button.click();
}

async function sendChatMessage(page: Page, message: string) {
  const input = page.getByRole("textbox").last();
  await input.fill(message);
  await input.press("Enter");
}

async function chooseInteractiveOption(page: Page, label: string) {
  await expectVisible(page, new RegExp(label, "i"));
  await page.getByRole("button", { name: new RegExp(label, "i") }).click();
  await page.getByRole("button", { name: /Submit for Review/i }).click();
}

async function submitManualReview(page: Page) {
  await expectVisible(page, /Billing Escalation Draft/i);
  await page.getByRole("button", { name: /Submit for Review/i }).click();
}

async function expectVisible(page: Page, pattern: RegExp) {
  await expect(page.getByText(pattern).first()).toBeVisible({
    timeout: OPENBOX_VISIBLE_TIMEOUT_MS,
  });
}

async function settleApprovalIfPresent(page: Page, decision: "Approve" | "Reject") {
  const deadline = Date.now() + OPENBOX_VISIBLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const button = page.getByRole("button", { name: new RegExp(decision, "i") });
    if ((await button.count()) > 0) {
      await button.click();
      return;
    }
    const terminal = page
      .locator(".obx-governance-card")
      .last()
      .getByText(TERMINAL_VERDICT)
      .first();
    if ((await terminal.count()) > 0 && (await terminal.isVisible())) return;
    await page.waitForTimeout(500);
  }
}

async function expectOpenBoxDecision(page: Page, verdict: RegExp) {
  const card = page.locator(".obx-governance-card").last();
  await expect(card).toBeVisible({ timeout: OPENBOX_VISIBLE_TIMEOUT_MS });
  await expect(card.getByText(verdict).first()).toBeVisible({
    timeout: OPENBOX_VISIBLE_TIMEOUT_MS,
  });
}

async function expectGeneratedResult(page: Page) {
  const result = page.locator(".openbox-a2ui-result").last();
  if ((await result.count()) === 0) return;
  await expect(result).toBeVisible({ timeout: OPENBOX_VISIBLE_TIMEOUT_MS });
  const text = await result.innerText({ timeout: OPENBOX_VISIBLE_TIMEOUT_MS });
  if (text.trim().length === 0) return;
  expect(text).not.toContain("schemaVersion");
  expect(text).not.toContain("openbox.copilotkit.result.v1");
}

async function expectGeneratedResultWhenReleased(page: Page) {
  const cardText = await page
    .locator(".obx-governance-card")
    .last()
    .innerText({ timeout: OPENBOX_VISIBLE_TIMEOUT_MS });
  if (/Allowed|Redacted|Constrained/i.test(cardText)) {
    await expectGeneratedResult(page);
  }
}

async function expectNoUnsafeOutput(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("schemaVersion");
  expect(text).not.toContain("openbox.copilotkit.result.v1");
  expect(text).not.toContain("Cannot send event type");
  expect(text).not.toContain("agent_id:");
  expect(text).not.toContain("session_id:");
  expect(text).not.toContain("workflow_id:");
}
