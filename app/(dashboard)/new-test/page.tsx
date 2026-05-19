import { redirect } from "next/navigation";

import { NewTestClient } from "./client";
import { getSessionUser } from "@/lib/firebase/auth-server";
import { getSettings } from "@/lib/firebase/data";
import type { SettingsRecord } from "@/lib/firebase/types";

function settingsToDefaults(settings: SettingsRecord | null) {
  return {
    mmPerPxOverride: settings?.mm_per_px_override ?? null,
    angularCorrectionDeg: settings?.angular_correction_deg ?? 0,
    thicknessOuterGapPx: settings?.thickness_outer_gap_px ?? 2,
    thicknessInnerGapPx: settings?.thickness_inner_gap_px ?? 2,
    units: settings?.units ?? "mm",
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
  const settings = await getSettings(user.uid);
  return <NewTestClient defaults={settingsToDefaults(settings)} />;
}
