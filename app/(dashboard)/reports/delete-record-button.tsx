"use client";

import { useState, useTransition } from "react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

import { deleteTest } from "./actions";

export function DeleteRecordButton({
  id,
  testDate,
  sampleDescription,
}: {
  id: string;
  testDate?: string;
  sampleDescription?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const summary =
    [testDate, sampleDescription?.trim() || null].filter(Boolean).join(" — ") || "this report";

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="text-red-300 hover:text-red-200 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => setOpen(true)}
      >
        {pending ? "Deleting..." : "Delete"}
      </button>

      <ConfirmDeleteDialog
        open={open}
        title="Delete report?"
        titleId="delete-report-title"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            await deleteTest(id);
            setOpen(false);
          });
        }}
        description={
          <>
            This will permanently delete the report for{" "}
            <span className="font-medium text-slate-200">{summary}</span>. This action cannot be
            undone.
          </>
        }
      />
    </>
  );
}
