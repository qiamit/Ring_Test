"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser, isAppOwner } from "@/lib/firebase/auth-server";
import {
  approveOrganization,
  deleteOrganization,
  holdOrganization,
  rejectOrganization,
} from "@/lib/firebase/organization";

export type OrganizationAction = "approved" | "hold" | "rejected" | "delete";

async function requireSuperAdmin() {
  const user = await requireSessionUser();
  if (!(await isAppOwner(user))) {
    return { ok: false as const, error: "Unauthorized", user: null };
  }
  return { ok: true as const, user };
}

function revalidateAdmin() {
  revalidatePath("/admin/organizations");
  revalidatePath("/admin/dashboard");
}

export async function approveOrganizationAction(tenantId: string) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  try {
    await approveOrganization(tenantId, auth.user.uid);
    revalidateAdmin();
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Approve failed",
    };
  }
}

export async function holdOrganizationAction(tenantId: string) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  try {
    await holdOrganization(tenantId);
    revalidateAdmin();
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Hold failed",
    };
  }
}

export async function rejectOrganizationAction(tenantId: string, reason?: string) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  try {
    await rejectOrganization(tenantId, auth.user.uid, reason);
    revalidateAdmin();
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Reject failed",
    };
  }
}

export async function deleteOrganizationAction(tenantId: string) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  try {
    await deleteOrganization(tenantId);
    revalidateAdmin();
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Delete failed",
    };
  }
}

export async function setOrganizationAction(
  tenantId: string,
  action: OrganizationAction,
  reason?: string,
) {
  switch (action) {
    case "approved":
      return approveOrganizationAction(tenantId);
    case "hold":
      return holdOrganizationAction(tenantId);
    case "rejected":
      return rejectOrganizationAction(tenantId, reason);
    case "delete":
      return deleteOrganizationAction(tenantId);
    default:
      return { ok: false as const, error: "Unknown action" };
  }
}
