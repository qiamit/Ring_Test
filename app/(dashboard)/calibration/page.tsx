import { redirect } from "next/navigation";

import { CalibrationClient } from "./client";
import { getSessionUser } from "@/lib/firebase/auth-server";
import { listCalibrations } from "@/lib/firebase/data";

export default async function CalibrationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const history = await listCalibrations(user.uid);
  return <CalibrationClient history={history} />;
}
