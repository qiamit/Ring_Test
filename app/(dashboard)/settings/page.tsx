import { redirect } from "next/navigation";

import { SettingsForm } from "./form";
import { getAiConfigPublic } from "@/lib/firebase/ai-config";
import { getSessionUser, isAppOwner } from "@/lib/firebase/auth-server";
import { getSettings } from "@/lib/firebase/data";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const settings = await getSettings(user.uid);
  const superAdmin = await isAppOwner(user);
  const aiConfig = superAdmin ? await getAiConfigPublic() : null;
  return (
    <SettingsForm initial={settings} isSuperAdmin={superAdmin} aiConfig={aiConfig} />
  );
}
