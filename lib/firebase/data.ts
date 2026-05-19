import { getAdminDb } from "@/lib/firebase/admin";
import { getOrganizationForOwner } from "@/lib/firebase/organization";
import type {
  CalibrationRecord,
  SettingsRecord,
  TestRecord,
  UserProfileRecord,
} from "@/lib/firebase/types";

const db = () => getAdminDb();

export async function getUserTenantId(userId: string): Promise<string | null> {
  const org = await getOrganizationForOwner(userId);
  if (!org || org.status !== "approved") return null;
  return org.id;
}

export async function getSettings(userId: string): Promise<SettingsRecord | null> {
  const doc = await db().collection("settings").doc(userId).get();
  if (!doc.exists) return null;
  return { user_id: doc.id, ...doc.data() } as SettingsRecord;
}

export async function upsertSettings(
  userId: string,
  data: Partial<SettingsRecord>,
): Promise<void> {
  const tenantId = data.tenant_id ?? (await getUserTenantId(userId));
  await db()
    .collection("settings")
    .doc(userId)
    .set(
      {
        ...data,
        user_id: userId,
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
}

export async function listTestsForUser(
  userId: string,
  opts: { q?: string; page?: number; pageSize?: number },
): Promise<{ rows: TestRecord[]; total: number; error?: string }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 20;
  const tenantId = await getUserTenantId(userId);

  // Filter by tenant in Firestore; sort in memory to avoid requiring a composite index before deploy.
  let snap;
  if (tenantId) {
    snap = await db().collection("tests").where("tenant_id", "==", tenantId).limit(500).get();
  } else {
    snap = await db().collection("tests").where("user_id", "==", userId).limit(500).get();
  }

  let rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as TestRecord)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const q = (opts.q ?? "").trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        (r.sample_description ?? "").toLowerCase().includes(q) ||
        (r.batch_number ?? "").toLowerCase().includes(q) ||
        (r.tester_name ?? "").toLowerCase().includes(q),
    );
  }

  const total = rows.length;
  const from = (page - 1) * pageSize;
  rows = rows.slice(from, from + pageSize);
  return { rows, total };
}

export async function getTestById(id: string): Promise<TestRecord | null> {
  const doc = await db().collection("tests").doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as TestRecord;
}

export async function insertTest(
  data: Omit<TestRecord, "id" | "created_at">,
): Promise<TestRecord> {
  const tenantId = data.tenant_id ?? (await getUserTenantId(data.user_id));
  const ref = db().collection("tests").doc();
  const row: TestRecord = {
    ...data,
    id: ref.id,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  };
  await ref.set(row);
  return row;
}

export async function deleteTestById(id: string, userId: string): Promise<TestRecord | null> {
  const row = await getTestById(id);
  if (!row || row.user_id !== userId) return null;
  await db().collection("tests").doc(id).delete();
  return row;
}

export async function listCalibrations(userId: string): Promise<CalibrationRecord[]> {
  const tenantId = await getUserTenantId(userId);
  if (!tenantId) return [];
  const snap = await db()
    .collection("calibrations")
    .where("tenant_id", "==", tenantId)
    .limit(100)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as CalibrationRecord)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function insertCalibration(
  data: Omit<CalibrationRecord, "id" | "created_at" | "tenant_id">,
): Promise<void> {
  const tenantId = await getUserTenantId(data.user_id);
  await db()
    .collection("calibrations")
    .add({
      ...data,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
    });
}

export async function deleteCalibrationById(id: string, userId: string): Promise<boolean> {
  const doc = await db().collection("calibrations").doc(id).get();
  if (!doc.exists) return false;
  const row = doc.data() as CalibrationRecord;
  if (row.user_id !== userId) return false;
  await doc.ref.delete();
  return true;
}

export async function upsertUserProfile(
  userId: string,
  data: Partial<UserProfileRecord>,
): Promise<void> {
  await db()
    .collection("user_profiles")
    .doc(userId)
    .set(
      {
        ...data,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
}

