"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/firebase/auth-server";
import { deleteTestById } from "@/lib/firebase/data";
import { deleteStorageObject } from "@/lib/firebase/storage";

export async function deleteTest(id: string) {
  const user = await requireSessionUser();
  const row = await deleteTestById(id, user.uid);
  if (!row) return { ok: false, error: "Test not found" } as const;

  if (row.image_path) {
    await deleteStorageObject(row.image_path);
  }
  revalidatePath("/reports");
  redirect("/reports");
}
