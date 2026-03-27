import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

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
    shadow = shadowJson ? JSON.parse(shadowJson) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON in quad or shadow" }, { status: 400 });
  }

  // Write temp files
  const tempDir = await mkdtemp(join(tmpdir(), "pendura-"));
  const wallPath = join(tempDir, "wall.jpg");
  const paintingPath = join(tempDir, "painting.png");
  const outputPath = join(tempDir, "output.png");

  try {
    await writeFile(wallPath, Buffer.from(await wallFile.arrayBuffer()));
    await writeFile(paintingPath, Buffer.from(await paintingFile.arrayBuffer()));

    const payload = JSON.stringify({ quad, shadow });

    const pngBytes = await new Promise<Buffer>((resolve, reject) => {
      const py = spawn("python3", [
        join(process.cwd(), "renderer", "main.py"),
        wallPath,
        paintingPath,
        outputPath,
        payload,
      ]);

      const stderr: Buffer[] = [];
      py.stderr.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
        process.stdout.write("[renderer] " + chunk.toString());
      });

      py.on("close", async (code) => {
        if (code !== 0) {
          const errMsg = Buffer.concat(stderr).toString();
          reject(new Error(`Renderer exited with code ${code}: ${errMsg}`));
          return;
        }
        const { readFile } = await import("fs/promises");
        try {
          const data = await readFile(outputPath);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });

      py.on("error", reject);
    });

    return new NextResponse(pngBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="pendura-render.png"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await Promise.allSettled([
      unlink(wallPath).catch(() => {}),
      unlink(paintingPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
    const { rmdir } = await import("fs/promises");
    await rmdir(tempDir).catch(() => {});
  }
}
