import { FieldValue, type Query } from "firebase-admin/firestore";

import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { APP_OWNER_EMAIL } from "@/lib/firebase/config";
import { isAppOwnerEmail } from "@/lib/firebase/permissions";
import type { OrganizationStatus, TenantRecord } from "@/lib/firebase/types";

const db = () => getAdminDb();

async function getSuperAdminOwnerIds(): Promise<Set<string>> {
  try {
    const user = await getAdminAuth().getUserByEmail(APP_OWNER_EMAIL);
    return new Set([user.uid]);
  } catch {
    return new Set();
  }
}

function isFirmOrganization(org: TenantRecord, superAdminOwnerIds: Set<string>): boolean {
  if (superAdminOwnerIds.has(org.owner_user_id)) return false;
  if (isAppOwnerEmail(org.owner_email)) return false;
  return true;
}

/** Removes legacy workspace tenants created for the Super Admin before SaaS approval. */
export async function cleanupSuperAdminOrganizations(ownerUserId: string): Promise<void> {
  const dbRef = db();
  const snap = await dbRef
    .collection("tenants")
    .where("owner_user_id", "==", ownerUserId)
    .get();

  for (const doc of snap.docs) {
    const tenantId = doc.id;
    await doc.ref.delete();
    await dbRef.collection("tenant_memberships").doc(`${tenantId}_${ownerUserId}`).delete();
  }

  if (!snap.empty) {
    await dbRef.collection("settings").doc(ownerUserId).set(
      { tenant_id: null, updated_at: new Date().toISOString() },
      { merge: true },
    );
  }
}

function mapTenantDoc(id: string, data: FirebaseFirestore.DocumentData): TenantRecord {
  return {
    id,
    slug: data.slug as string,
    name: data.name as string,
    owner_user_id: data.owner_user_id as string,
    owner_email: (data.owner_email as string | null) ?? null,
    contact_name: (data.contact_name as string | null) ?? null,
    status: (data.status as OrganizationStatus) ?? "approved",
    created_at: data.created_at as string,
    approved_at: (data.approved_at as string | null) ?? null,
    approved_by: (data.approved_by as string | null) ?? null,
    rejected_at: (data.rejected_at as string | null) ?? null,
    rejected_reason: (data.rejected_reason as string | null) ?? null,
  };
}

export async function getOrganizationForOwner(userId: string): Promise<TenantRecord | null> {
  const snap = await db()
    .collection("tenants")
    .where("owner_user_id", "==", userId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return mapTenantDoc(doc.id, doc.data());
}

export async function registerPendingOrganization(input: {
  uid: string;
  email: string | null;
  firmName: string;
  contactName: string;
}): Promise<TenantRecord> {
  const dbRef = db();
  const existing = await getOrganizationForOwner(input.uid);
  if (existing) return existing;

  const slug = `org-${input.uid.slice(0, 8)}`;
  const tenantRef = dbRef.collection("tenants").doc();
  const tenantId = tenantRef.id;
  const now = new Date().toISOString();
  const row: Omit<TenantRecord, "id"> = {
    slug,
    name: input.firmName.trim(),
    owner_user_id: input.uid,
    owner_email: input.email?.trim().toLowerCase() ?? null,
    contact_name: input.contactName.trim(),
    status: "pending",
    created_at: now,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_reason: null,
  };
  await tenantRef.set(row);
  await dbRef.collection("tenant_memberships").doc(`${tenantId}_${input.uid}`).set({
    tenant_id: tenantId,
    user_id: input.uid,
    role: "owner",
    created_at: now,
  });

  await dbRef
    .collection("user_profiles")
    .doc(input.uid)
    .set(
      {
        user_id: input.uid,
        email: input.email,
        full_name: input.contactName.trim(),
        created_at: FieldValue.serverTimestamp(),
        updated_at: now,
      },
      { merge: true },
    );

  return { id: tenantId, ...row };
}

export async function bootstrapSuperAdminProfile(input: {
  uid: string;
  email: string | null;
  displayName?: string | null;
}): Promise<void> {
  await cleanupSuperAdminOrganizations(input.uid);

  const now = new Date().toISOString();
  await db()
    .collection("user_profiles")
    .doc(input.uid)
    .set(
      {
        user_id: input.uid,
        email: input.email,
        full_name: input.displayName ?? "",
        created_at: FieldValue.serverTimestamp(),
        updated_at: now,
      },
      { merge: true },
    );
}

async function ensureApprovedOrgSettings(userId: string, tenantId: string): Promise<void> {
  const settingsRef = db().collection("settings").doc(userId);
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    await settingsRef.set({
      user_id: userId,
      tenant_id: tenantId,
      mm_per_px_override: null,
      angular_correction_deg: 0,
      units: "mm",
      date_format: "yyyy-mm-dd",
      time_format: "24h",
      inner_color: "#fde047",
      outer_color: "#f472b6",
      diam_color: "#fb923c",
      thick_color: "#4ade80",
      inner_width: 2,
      outer_width: 2,
      diam_width: 2,
      thick_width: 2,
      thickness_outer_gap_px: 2,
      thickness_inner_gap_px: 2,
      company_logo_path: null,
      company_name: null,
      company_address: null,
      company_gst: null,
      company_email: null,
      company_contact_name: null,
      company_contact_phone: null,
      updated_at: new Date().toISOString(),
    });
  } else if (!settingsSnap.data()?.tenant_id) {
    await settingsRef.update({ tenant_id: tenantId });
  }
}

export type SessionAccessResult =
  | { ok: true; isSuperAdmin: true }
  | { ok: true; isSuperAdmin: false; organization: TenantRecord }
  | {
      ok: false;
      code:
        | "pending_approval"
        | "organization_on_hold"
        | "organization_rejected"
        | "registration_required";
    };

export async function resolveSessionAccess(input: {
  uid: string;
  email: string | null;
  displayName?: string | null;
  firmName?: string;
  contactName?: string;
}): Promise<SessionAccessResult> {
  if (isAppOwnerEmail(input.email)) {
    await bootstrapSuperAdminProfile(input);
    return { ok: true, isSuperAdmin: true };
  }

  let org = await getOrganizationForOwner(input.uid);

  if (!org) {
    const firmName = input.firmName?.trim();
    const contactName = input.contactName?.trim() || input.displayName?.trim();
    if (!firmName || !contactName) {
      return { ok: false, code: "registration_required" };
    }
    org = await registerPendingOrganization({
      uid: input.uid,
      email: input.email,
      firmName,
      contactName,
    });
    return { ok: false, code: "pending_approval" };
  }

  if (org.status === "pending") {
    return { ok: false, code: "pending_approval" };
  }

  if (org.status === "hold") {
    return { ok: false, code: "organization_on_hold" };
  }

  if (org.status === "rejected") {
    return { ok: false, code: "organization_rejected" };
  }

  await db()
    .collection("user_profiles")
    .doc(input.uid)
    .set(
      {
        user_id: input.uid,
        email: input.email,
        full_name: input.displayName ?? org.contact_name ?? "",
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );

  await ensureApprovedOrgSettings(input.uid, org.id);
  return { ok: true, isSuperAdmin: false, organization: org };
}

export async function listOrganizations(opts?: {
  status?: OrganizationStatus;
}): Promise<TenantRecord[]> {
  let query: Query = db().collection("tenants");
  if (opts?.status) {
    query = query.where("status", "==", opts.status);
  }
  const [snap, superAdminOwnerIds] = await Promise.all([
    query.limit(500).get(),
    getSuperAdminOwnerIds(),
  ]);
  return snap.docs
    .map((d) => mapTenantDoc(d.id, d.data()))
    .filter((org) => isFirmOrganization(org, superAdminOwnerIds))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function approveOrganization(
  tenantId: string,
  adminUid: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db().collection("tenants").doc(tenantId).update({
    status: "approved",
    approved_at: now,
    approved_by: adminUid,
    rejected_at: null,
    rejected_reason: null,
  });
  const doc = await db().collection("tenants").doc(tenantId).get();
  if (doc.exists) {
    const ownerId = doc.data()?.owner_user_id as string;
    if (ownerId) await ensureApprovedOrgSettings(ownerId, tenantId);
  }
}

export async function rejectOrganization(
  tenantId: string,
  _adminUid: string,
  reason?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db().collection("tenants").doc(tenantId).update({
    status: "rejected",
    rejected_at: now,
    approved_at: null,
    approved_by: null,
    rejected_reason: reason?.trim() || null,
  });
}

export async function holdOrganization(tenantId: string): Promise<void> {
  await db().collection("tenants").doc(tenantId).update({
    status: "hold",
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_reason: null,
  });
}

export async function deleteOrganization(tenantId: string): Promise<void> {
  const dbRef = db();
  const tenantRef = dbRef.collection("tenants").doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) return;

  const ownerId = tenantSnap.data()?.owner_user_id as string | undefined;

  const memberships = await dbRef
    .collection("tenant_memberships")
    .where("tenant_id", "==", tenantId)
    .get();
  for (const doc of memberships.docs) {
    await doc.ref.delete();
  }

  const tests = await dbRef.collection("tests").where("tenant_id", "==", tenantId).limit(500).get();
  for (const doc of tests.docs) {
    await doc.ref.delete();
  }

  const calibrations = await dbRef
    .collection("calibrations")
    .where("tenant_id", "==", tenantId)
    .limit(500)
    .get();
  for (const doc of calibrations.docs) {
    await doc.ref.delete();
  }

  await tenantRef.delete();

  if (ownerId) {
    const settingsRef = dbRef.collection("settings").doc(ownerId);
    const settingsSnap = await settingsRef.get();
    if (settingsSnap.exists && settingsSnap.data()?.tenant_id === tenantId) {
      await settingsRef.update({
        tenant_id: null,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function getAdminDashboardStats(): Promise<{
  pending: number;
  approved: number;
  hold: number;
  rejected: number;
  totalOrganizations: number;
  totalTests: number;
}> {
  const [tenantsSnap, testsSnap, superAdminOwnerIds] = await Promise.all([
    db().collection("tenants").limit(1000).get(),
    db().collection("tests").limit(5000).get(),
    getSuperAdminOwnerIds(),
  ]);

  let pending = 0;
  let approved = 0;
  let hold = 0;
  let rejected = 0;
  let totalOrganizations = 0;
  for (const doc of tenantsSnap.docs) {
    const org = mapTenantDoc(doc.id, doc.data());
    if (!isFirmOrganization(org, superAdminOwnerIds)) continue;

    totalOrganizations++;
    if (org.status === "pending") pending++;
    else if (org.status === "hold") hold++;
    else if (org.status === "rejected") rejected++;
    else approved++;
  }

  return {
    pending,
    approved,
    hold,
    rejected,
    totalOrganizations,
    totalTests: testsSnap.size,
  };
}

export function isOrganizationApproved(org: TenantRecord | null): boolean {
  return org?.status === "approved";
}
