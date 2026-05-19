"use client";

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  pending,
  onCancel,
  onConfirm,
  titleId = "confirm-delete-title",
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  titleId?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-[--color-border] bg-slate-950 p-5 shadow-2xl"
      >
        <h3 id={titleId} className="text-base font-semibold text-white">
          {title}
        </h3>
        <p className="mt-2 text-sm text-[--color-muted]">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
