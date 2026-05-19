import { cn } from "@/lib/utils";

const SUPPORT_PHONE = "9041063388";
const SUPPORT_EMAIL = "amitrajput183@gmail.com";

export function AuthSupportContact({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mt-5 border-t border-[--color-border] pt-4 text-center text-sm text-[--color-muted]",
        className,
      )}
    >
      <p className="font-semibold text-slate-200">Contact for Support</p>
      <p className="mt-2">
        Mob:{" "}
        <a href={`tel:+91${SUPPORT_PHONE}`} className="font-medium text-[--color-accent] hover:underline">
          {SUPPORT_PHONE}
        </a>
      </p>
      <p className="mt-1">
        Email:{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-medium text-[--color-accent] hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
}
