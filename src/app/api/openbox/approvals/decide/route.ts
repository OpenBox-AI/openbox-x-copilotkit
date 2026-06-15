import { NextResponse } from "next/server";
import { createOpenBoxApprovalRoute } from "@openbox-ai/openbox-sdk/copilotkit";
import { z } from "zod";

export const runtime = "nodejs";

const DecisionSchema = z.object({
  governanceEventId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
});
const approvalRoute = createOpenBoxApprovalRoute({
  clientName: "openbox-copilotkit-demo",
  backendTimeoutMs: 180_000,
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  console.info("[openbox-demo] /api/openbox/approvals/decide started");
  const parsed = DecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    console.info(
      `[openbox-demo] /api/openbox/approvals/decide finished in ${Date.now() - startedAt}ms`,
    );
    return NextResponse.json(
      { ok: false, error: "Invalid OpenBox approval decision request." },
      { status: 400 },
    );
  }

  try {
    const resolved = await approvalRoute.decide(parsed.data);

    const result = NextResponse.json({
      ok: true,
      decision: parsed.data.decision,
      eventId: resolved.eventId,
    });
    console.info(
      `[openbox-demo] /api/openbox/approvals/decide finished in ${Date.now() - startedAt}ms`,
    );
    return result;
  } catch (error) {
    console.error("OpenBox approval decision failed", error);
    console.info(
      `[openbox-demo] /api/openbox/approvals/decide failed in ${Date.now() - startedAt}ms`,
    );
    return NextResponse.json(
      {
        ok: false,
        error: "Something went wrong. Try again later.",
      },
      { status: 502 },
    );
  }
}
