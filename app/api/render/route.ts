import { NextRequest, NextResponse } from "next/server";
import { render } from "@/lib/renderer/render";

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const wallFile = formData.get("wallImage") as File | null;
  const paintingFile = formData.get("paintingImage") as File | null;
  const quadJson = formData.get("quad") as string | null;
  const shadowJson = formData.get("shadow") as string | null;

  if (!wallFile || !paintingFile || !quadJson) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let quad: unknown;
  let shadow: unknown;
  try {
    quad = JSON.parse(quadJson);
    shadow = shadowJson ? JSON.parse(shadowJson) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON in quad or shadow" }, { status: 400 });
  }

  try {
    const wallBytes = Buffer.from(await wallFile.arrayBuffer());
    const paintingBytes = Buffer.from(await paintingFile.arrayBuffer());

    const pngBuffer = await render(wallBytes, paintingBytes, {
      quad: quad as import("@/lib/types").Quad,
      shadow: shadow as import("@/lib/renderer/shadow").ShadowConfig | undefined,
    });

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="pendura-render.png"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
