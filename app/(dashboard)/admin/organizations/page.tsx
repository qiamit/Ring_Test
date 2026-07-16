import { listOrganizations } from "@/lib/firebase/organization";

import { OrganizationBrowser } from "./organization-browser";

export default async function AdminOrganizationsPage() {
  const organizations = await listOrganizations();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Organizations</h1>
      <OrganizationBrowser
        organizations={organizations.map((org) => ({
          id: org.id,
          name: org.name,
          contact_name: org.contact_name,
          owner_email: org.owner_email,
          status: org.status,
          created_at: org.created_at,
          ai_enabled: org.ai_enabled,
        }))}
      />
    </div>
  );
}
