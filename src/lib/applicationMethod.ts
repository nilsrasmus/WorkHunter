export type ApplicationMethod = "email" | "external_url" | "via_af" | "unknown";

export interface ApplicationContact {
  name?: string;
  email?: string;
  telephone?: string;
  description?: string;
}

function getApplicationDetails(ad: Record<string, unknown>) {
  return ad.application_details as
    | { email?: string; url?: string; via_af?: boolean }
    | undefined;
}

export function getApplicationContacts(ad: Record<string, unknown>): ApplicationContact[] {
  const raw = ad.application_contacts;
  if (Array.isArray(raw)) {
    return raw as ApplicationContact[];
  }
  if (raw && typeof raw === "object") {
    return [raw as ApplicationContact];
  }
  return [];
}

export function getPrimaryContact(ad: Record<string, unknown>): ApplicationContact | null {
  return getApplicationContacts(ad)[0] ?? null;
}

export function detectApplicationMethod(ad: Record<string, unknown>): ApplicationMethod {
  const details = getApplicationDetails(ad);
  const email = details?.email?.trim();
  if (email) return "email";

  if (details?.via_af) return "via_af";

  const url = details?.url?.trim();
  if (url) return "external_url";

  return "unknown";
}

export function isEmailApplication(ad: Record<string, unknown>): boolean {
  return detectApplicationMethod(ad) === "email";
}

export function getApplicationUrl(ad: Record<string, unknown>): string | null {
  const url = getApplicationDetails(ad)?.url?.trim();
  return url || null;
}

export function applicationMethodLabelKey(method: ApplicationMethod): string {
  switch (method) {
    case "email":
      return "apply.method.email";
    case "external_url":
      return "apply.method.external";
    case "via_af":
      return "apply.method.viaAf";
    default:
      return "apply.method.unknown";
  }
}

export function applicationMethodBadgeClass(method: ApplicationMethod): string {
  switch (method) {
    case "email":
      return "badge-email";
    case "external_url":
      return "badge-web";
    default:
      return "";
  }
}
