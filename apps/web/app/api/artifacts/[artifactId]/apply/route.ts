import { applyArtifact } from "@aieos/server";
import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;

  try {
    const artifact = applyArtifact(artifactId);

    if (!artifact) {
      return NextResponse.json({ error: "artifact not found" }, { status: 404 });
    }

    return NextResponse.json(artifact);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
