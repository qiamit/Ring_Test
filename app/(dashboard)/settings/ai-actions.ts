"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser, isAppOwner } from "@/lib/firebase/auth-server";
import { getAiConfigPublic, upsertAiConfig } from "@/lib/firebase/ai-config";
import type { AiProviderId } from "@/lib/firebase/types";

export type AiConfigInput = {
  provider: AiProviderId;
  name: string;
  model_id: string;
  /** Leave blank to keep the existing key. */
  api_key: string;
};

async function requireSuperAdmin() {
  const user = await requireSessionUser();
  if (!(await isAppOwner(user))) {
    return { ok: false as const, error: "Only Super Admin can manage AI settings.", user: null };
  }
  return { ok: true as const, user };
}

export async function loadAiConfigAction() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { ok: false as const, error: auth.error, config: null };
  const config = await getAiConfigPublic();
  return { ok: true as const, config };
}

export async function saveAiConfigAction(input: AiConfigInput) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const provider = input.provider;
  const name = input.name?.trim() ?? "";
  const modelId = input.model_id?.trim() ?? "";
  if (!name) return { ok: false as const, error: "AI Name is required." };
  if (!modelId) return { ok: false as const, error: "Model ID is required." };
  if (!["openai", "google", "anthropic", "custom"].includes(provider)) {
    return { ok: false as const, error: "Invalid AI provider." };
  }

  try {
    const config = await upsertAiConfig({
      provider,
      name,
      model_id: modelId,
      api_key: input.api_key ?? "",
      updated_by: auth.user.uid,
    });
    revalidatePath("/settings");
    return { ok: true as const, config };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to save AI settings.",
    };
  }
}
