"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser } from "@/lib/firebase/auth-server";
import { deleteCalibrationById, insertCalibration, upsertSettings } from "@/lib/firebase/data";

export interface CalibrationInput {
  kind: "linear" | "angular";
  operator: string;
  reference_value: number;
  measured_value: number;
  result_value: number;
  notes?: string;
  apply_mm_per_px?: boolean;
  apply_angular_correction?: boolean;
}

export async function saveCalibration(input: CalibrationInput) {
  const user = await requireSessionUser();
  try {
    await insertCalibration({
      user_id: user.uid,
      kind: input.kind,
      operator: input.operator,
      reference_value: input.reference_value,
      measured_value: input.measured_value,
      result_value: input.result_value,
      notes: input.notes ?? null,
    });

    if (input.apply_mm_per_px && input.kind === "linear") {
      await upsertSettings(user.uid, { mm_per_px_override: input.result_value });
    }
    if (input.apply_angular_correction && input.kind === "angular") {
      await upsertSettings(user.uid, { angular_correction_deg: input.result_value });
    }
    revalidatePath("/calibration");
    return { ok: true } as const;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" } as const;
  }
}

export async function deleteCalibration(id: string) {
  const user = await requireSessionUser();
  const ok = await deleteCalibrationById(id, user.uid);
  if (!ok) return { ok: false, error: "Not found" } as const;
  revalidatePath("/calibration");
  return { ok: true } as const;
}
