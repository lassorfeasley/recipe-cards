/**
 * Admin allowlist: comma-separated emails in ADMIN_EMAILS.
 * When unset, admin stays open (local-dev convenience).
 */
export function adminEmailsConfigured(): boolean {
  return !!process.env.ADMIN_EMAILS?.trim();
}

export function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!adminEmailsConfigured()) return true;
  if (!email) return false;
  return parseAdminEmails().includes(email.trim().toLowerCase());
}
