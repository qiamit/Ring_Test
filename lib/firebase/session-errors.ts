export type SessionErrorCode =
  | "pending_approval"
  | "organization_on_hold"
  | "organization_rejected"
  | "registration_required";

export class SessionAccessError extends Error {
  code: SessionErrorCode;

  constructor(code: SessionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SessionAccessError";
  }
}

export function sessionErrorMessage(code: SessionErrorCode): string {
  switch (code) {
    case "pending_approval":
      return "Your organization is awaiting Super Admin approval. You can sign in after approval.";
    case "organization_on_hold":
      return "Your organization account is on hold. Please contact support.";
    case "organization_rejected":
      return "Your organization registration was not approved. Please contact support.";
    case "registration_required":
      return "Complete firm registration with organization name and contact details.";
    default:
      return "Sign in failed.";
  }
}
