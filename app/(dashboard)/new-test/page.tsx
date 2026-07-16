import { redirect } from "next/navigation";

import { NewTestClient } from "./client";
import { getSessionUser } from "@/lib/firebase/auth-server";
import { getSettings } from "@/lib/firebase/data";
import { isAiAnalysisEnabledForUser } from "@/lib/firebase/organization";
import type { SettingsRecord } from "@/lib/firebase/types";

function settingsToDefaults(
  settings: SettingsRecord | null,
  aiAnalysisEnabled: boolean,
) {
  return {
    mmPerPxOverride: settings?.mm_per_px_override ?? null,
    angularCorrectionDeg: settings?.angular_correction_deg ?? 0,
    thicknessOuterGapPx: settings?.thickness_outer_gap_px ?? 1,
    thicknessInnerGapPx: settings?.thickness_inner_gap_px ?? 1,
    units: settings?.units ?? "mm",
    aiAnalysisEnabled,
    style: settings
      ? {
          inner: { color: settings.inner_color, width: settings.inner_width },
          outer: { color: settings.outer_color, width: settings.outer_width },
          diam: { color: settings.diam_color, width: settings.diam_width },
          thick: { color: settings.thick_color, width: settings.thick_width },
        }
      : undefined,
  };
}

export default async function NewTestPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [settings, aiAnalysisEnabled] = await Promise.all([
    getSettings(user.uid),
    isAiAnalysisEnabledForUser(user.uid, user.email),
  ]);
  return <NewTestClient defaults={settingsToDefaults(settings, aiAnalysisEnabled)} />;
}
