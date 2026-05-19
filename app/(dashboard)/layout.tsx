import { redirect } from "next/navigation";

import { MobileSidebar, Sidebar } from "@/components/nav/Sidebar";
import { Topbar } from "@/components/nav/Topbar";
import { getSessionUser, isAppOwner } from "@/lib/firebase/auth-server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getOrganizationForOwner } from "@/lib/firebase/organization";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const superAdmin = await isAppOwner(user);
  if (!superAdmin) {
    const org = await getOrganizationForOwner(user.uid);
    if (!org || org.status !== "approved") {
      const err = org?.status === "rejected" ? "rejected" : "pending";
      redirect(`/login?error=${err}`);
    }
  }

  const profileSnap = await getAdminDb().collection("user_profiles").doc(user.uid).get();
  const profile = profileSnap.data();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        email={user.email}
        fullName={(profile?.full_name as string | undefined) ?? null}
        isSuperAdmin={superAdmin}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <MobileSidebar isSuperAdmin={superAdmin} />
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
