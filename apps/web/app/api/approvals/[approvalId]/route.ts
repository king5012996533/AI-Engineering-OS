import { decideApproval } from "@aieos/server";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const body = (await request.json().catch(() => null)) as {
    decision?: "approved" | "rejected" | "changes_requested";
    feedback?: string;
  } | null;

  if (!body?.decision) {
    return NextResponse.json({ error: "decision is required" }, { status: 400 });
  }

  const approval = decideApproval(approvalId, body.decision, body.feedback);

  if (!approval) {
    return NextResponse.json({ error: "approval not found" }, { status: 404 });
  }

  return NextResponse.json(approval);
}
