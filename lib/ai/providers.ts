import type { AiConfigRecord, AiProviderId } from "@/lib/firebase/types";

import {
  AI_RING_ANALYSIS_PROMPT,
  AI_RING_GEMINI_SCHEMA,
  AI_RING_JSON_SCHEMA,
  parseAiRingGuidanceFromText,
  type AiRingGuidance,
} from "./ring-schema";

export type ProviderImageInput = {
  /** Raw base64 without data-URL prefix. */
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

const PROVIDER_TIMEOUT_MS = 55_000;

function withTimeout(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      if (typeof j.error === "string") return j.error;
      if (j.error && typeof j.error === "object" && j.error.message) return j.error.message;
      if (j.message) return j.message;
    } catch {
      /* ignore */
    }
    return text.slice(0, 240);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

function safeProviderError(provider: string, detail: string): Error {
  // Never echo API keys; keep message short for UI.
  const cleaned = detail.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 200);
  return new Error(`${provider} analysis failed: ${cleaned}`);
}

async function callOpenAI(
  cfg: AiConfigRecord,
  image: ProviderImageInput,
): Promise<AiRingGuidance> {
  const dataUrl = `data:${image.mimeType};base64,${image.base64}`;
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      "Content-Type": "application/json",
    },
    signal: withTimeout(PROVIDER_TIMEOUT_MS),
    body: JSON.stringify({
      model: cfg.model_id,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: AI_RING_ANALYSIS_PROMPT },
            { type: "input_image", image_url: dataUrl, detail: "high" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ring_analysis",
          strict: true,
          schema: AI_RING_JSON_SCHEMA,
        },
      },
    }),
  });
  if (!res.ok) throw safeProviderError("OpenAI", await readErrorBody(res));
  const data = (await res.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  let text = data.output_text ?? "";
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type !== "message" || !item.content) continue;
      for (const part of item.content) {
        if (part.type === "output_text" && part.text) {
          text = part.text;
          break;
        }
        if (part.text) text = part.text;
      }
      if (text) break;
    }
  }
  if (!text) throw safeProviderError("OpenAI", "Empty model response");
  return parseAiRingGuidanceFromText(text);
}

async function callGemini(
  cfg: AiConfigRecord,
  image: ProviderImageInput,
): Promise<AiRingGuidance> {
  const model = encodeURIComponent(cfg.model_id);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cfg.api_key,
    },
    signal: withTimeout(PROVIDER_TIMEOUT_MS),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: AI_RING_ANALYSIS_PROMPT },
            {
              inline_data: {
                mime_type: image.mimeType,
                data: image.base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: AI_RING_GEMINI_SCHEMA,
      },
    }),
  });
  if (!res.ok) throw safeProviderError("Google Gemini", await readErrorBody(res));
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw safeProviderError("Google Gemini", "Empty model response");
  return parseAiRingGuidanceFromText(text);
}

async function callAnthropic(
  cfg: AiConfigRecord,
  image: ProviderImageInput,
): Promise<AiRingGuidance> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.api_key,
      "anthropic-version": "2023-06-01",
    },
    signal: withTimeout(PROVIDER_TIMEOUT_MS),
    body: JSON.stringify({
      model: cfg.model_id,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: image.base64,
              },
            },
            { type: "text", text: AI_RING_ANALYSIS_PROMPT },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: AI_RING_JSON_SCHEMA,
        },
      },
    }),
  });
  if (!res.ok) throw safeProviderError("Anthropic", await readErrorBody(res));
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text =
    data.content?.filter((c) => c.type === "text" && c.text).map((c) => c.text!).join("\n") ?? "";
  if (!text) throw safeProviderError("Anthropic", "Empty model response");
  return parseAiRingGuidanceFromText(text);
}

/**
 * Custom provider: OpenAI-compatible Responses or Chat Completions style is not assumed.
 * Treat as OpenAI Responses when model looks like OpenAI; otherwise Gemini-compatible endpoint
 * is not known — require openai-compatible Responses at a custom base is out of scope.
 * For "custom", attempt OpenAI Responses API with the stored key (user may use a gateway).
 */
async function callCustom(
  cfg: AiConfigRecord,
  image: ProviderImageInput,
): Promise<AiRingGuidance> {
  return callOpenAI(cfg, image);
}

export async function callVisionProvider(
  cfg: AiConfigRecord,
  image: ProviderImageInput,
): Promise<AiRingGuidance> {
  if (!cfg.api_key?.trim()) throw new Error("AI API key is not configured.");
  if (!cfg.model_id?.trim()) throw new Error("AI model ID is not configured.");

  const provider: AiProviderId = cfg.provider;
  switch (provider) {
    case "openai":
      return callOpenAI(cfg, image);
    case "google":
      return callGemini(cfg, image);
    case "anthropic":
      return callAnthropic(cfg, image);
    case "custom":
      return callCustom(cfg, image);
    default:
      throw new Error("Unsupported AI provider.");
  }
}
