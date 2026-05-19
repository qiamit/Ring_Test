import { notFound, redirect } from "next/navigation";

import { getSessionUser, isAppOwner } from "@/lib/firebase/auth-server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (!(await isAppOwner(user))) {
    notFound();
  }
  return children;
}
