import { APP_OWNER_EMAIL } from "@/lib/firebase/config";

export function isAppOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === APP_OWNER_EMAIL;
}
