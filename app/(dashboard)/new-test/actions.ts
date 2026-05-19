"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser } from "@/lib/firebase/auth-server";
import { insertTest } from "@/lib/firebase/data";
import { formatStorageError, uploadRingImage } from "@/lib/firebase/storage";
import type { AnalysisResults } from "@/lib/firebase/types";

export interface SaveTestPayload {
  sample_description: string;
  sample_diameter_mm: number;
  batch_number: string;
  mfg_date: string;
  tester_name: string;
  test_date: string;
  test_time: string;
  observations: string;
  results: AnalysisResults;
  imageDataUrl: string;
}

export async function saveTest(payload: SaveTestPayload) {
  const user = await requireSessionUser();

  const m = /^data:(image\/[^;]+);base64,(.*)$/.exec(payload.imageDataUrl);
  if (!m) {
    return { ok: false, error: "Invalid image data." } as const;
  }
  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");

  let filename: string;
  try {
    filename = await uploadRingImage(user.uid, buffer, contentType);
  } catch (err) {
    return {
      ok: false,
      error: `Image upload failed: ${formatStorageError(err)}`,
    } as const;
  }

  try {
    const inserted = await insertTest({
      user_id: user.uid,
      sample_description: payload.sample_description,
      sample_diameter_mm: payload.sample_diameter_mm,
      batch_number: payload.batch_number,
      mfg_date: payload.mfg_date,
      tester_name: payload.tester_name,
      test_date: payload.test_date,
      test_time: payload.test_time,
      image_path: filename,
      tenant_id: null,
      results: payload.results,
      observations: payload.observations,
    });
    revalidatePath("/reports");
    return { ok: true, id: inserted.id } as const;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" } as const;
  }
}
