import { getArtifact } from "@aieos/server";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;
  const artifact = getArtifact(artifactId);

  if (!artifact) {
    return NextResponse.json({ error: "artifact not found" }, { status: 404 });
  }

  return NextResponse.json(artifact);
}
