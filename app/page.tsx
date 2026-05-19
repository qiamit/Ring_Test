import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/firebase/auth-server";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/new-test");
  redirect("/login");
}
