import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { getOpenAI } from "@/lib/openai";
import { consumeCredit } from "@/lib/access";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getProfile(req);
    if (!ctx) return NextResponse.json({ error: "Please log in to generate visuals." }, { status: 401 });

    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const mode = body.mode === "3d" ? "3d" : body.mode === "diagram" ? "diagram" : null;
    if (!mode) return NextResponse.json({ error: "Choose a supported visual mode." }, { status: 400 });
    if (prompt.length < 3 || prompt.length > 2000) return NextResponse.json({ error: "Enter a visual prompt between 3 and 2,000 characters." }, { status: 400 });

    const usage = await consumeCredit(ctx.user.id, "image_generation");
    const visualDirection = mode === "3d"
      ? "Create a polished 3D-rendered concept image. This is a still image, not an interactive 3D model."
      : "Create a clear, high-contrast diagram or visual explainer. Keep labels large and concise.";
    const result = await getOpenAI().images.generate({
      model: process.env.LEO_IMAGE_MODEL || "gpt-image-2",
      prompt: `${visualDirection}\n\n${prompt}`,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    });
    const image = result.data?.[0];
    if (!image?.url && !image?.b64_json) return NextResponse.json({ error: "No visual was returned." }, { status: 502 });
    return NextResponse.json({
      url: image.url || null,
      b64_json: image.b64_json || null,
      kind: "rendered_image",
      mode,
      credits_remaining: "remaining" in usage ? usage.remaining : usage.credits,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual generation unavailable.";
    const status = message.includes("credit") || message.includes("plan") ? 402 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}