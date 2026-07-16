import { NextResponse } from "next/server";

import { callVisionProvider } from "@/lib/ai/providers";
import type { AiRingGuidance } from "@/lib/ai/ring-schema";
import { getSessionUser } from "@/lib/firebase/auth-server";
import { getAiConfig, isAiConfigReady } from "@/lib/firebase/ai-config";
import { isAiAnalysisEnabledForUser } from "@/lib/firebase/organization";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BASE64_CHARS = 6_000_000; // ~4.5MB binary

type AnalyzeBody = {
  imageBase64?: string;
  mimeType?: string;
  sourceWidth?: number;
  sourceHeight?: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false as const, error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("Not authenticated.", 401);

    const enabled = await isAiAnalysisEnabledForUser(user.uid, user.email);
    if (!enabled) return jsonError("AI Analysis is not enabled for your organization.", 403);

    const ready = await isAiConfigReady();
    if (!ready) {
      return jsonError("AI model is not configured. Ask Super Admin to set provider and API key.", 503);
    }

    const body = (await request.json()) as AnalyzeBody;
    const mimeType = (body.mimeType ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return jsonError("Unsupported image type.", 400);
    }

    let base64 = (body.imageBase64 ?? "").trim();
    if (base64.startsWith("data:")) {
      const comma = base64.indexOf(",");
      base64 = comma >= 0 ? base64.slice(comma + 1) : base64;
    }
    if (!base64 || base64.length < 32) return jsonError("Image payload missing.", 400);
    if (base64.length > MAX_BASE64_CHARS) {
      return jsonError("Image too large for AI analysis. Try a smaller photo.", 413);
    }

    const cfg = await getAiConfig();
    if (!cfg) return jsonError("AI model is not configured.", 503);

    const guidance: AiRingGuidance = await callVisionProvider(cfg, { base64, mimeType });

    return NextResponse.json(
      {
        ok: true as const,
        guidance,
        meta: {
          provider: cfg.provider,
          model_id: cfg.model_id,
          sourceWidth: body.sourceWidth ?? null,
          sourceHeight: body.sourceHeight ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "AI provider timed out. Try again."
          : err.message
        : "AI analysis failed.";
    // Do not leak stack / secrets
    const safe =
      /api[_-]?key|bearer|sk-/i.test(message)
        ? "AI analysis failed. Check model settings."
        : message.slice(0, 280);
    return jsonError(safe, 502);
  }
}
