"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser } from "@/lib/firebase/auth-server";
import { upsertSettings } from "@/lib/firebase/data";
import { uploadCompanyLogo } from "@/lib/firebase/storage";
import type { SettingsRecord } from "@/lib/firebase/types";

export type SettingsInput = Partial<SettingsRecord>;

export async function saveSettings(input: SettingsInput) {
  const user = await requireSessionUser();
  try {
    await upsertSettings(user.uid, input);
    revalidatePath("/settings");
    revalidatePath("/new-test");
    return { ok: true } as const;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" } as const;
  }
}

export async function uploadLogo(formData: FormData) {
  const user = await requireSessionUser();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected" } as const;
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const objectPath = await uploadCompanyLogo(user.uid, buffer, file.type || "image/png", ext);
    await upsertSettings(user.uid, { company_logo_path: objectPath });
    revalidatePath("/settings");
    return { ok: true, path: objectPath } as const;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" } as const;
  }
}
