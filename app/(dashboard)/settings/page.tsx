import { redirect } from "next/navigation";

import { SettingsForm } from "./form";
import { getSessionUser } from "@/lib/firebase/auth-server";
import { getSettings } from "@/lib/firebase/data";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const settings = await getSettings(user.uid);
  return <SettingsForm initial={settings} />;
}
