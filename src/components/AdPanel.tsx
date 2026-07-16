import type { JobAdHit } from "../types";
import { getPrimaryContact } from "../lib/applicationMethod";
import { useI18n } from "../lib/i18n";

interface Props {
  ad: JobAdHit | Record<string, unknown>;
}

function get(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function workplaceLocation(a: Record<string, unknown>): string | undefined {
  const w = a.workplace_address as Record<string, unknown> | undefined;
  if (!w) return undefined;
  return (w.city ?? w.municipality ?? w.region) as string | undefined;
}

export function AdPanel({ ad }: Props) {
  const { t } = useI18n();
  const a = ad as Record<string, unknown>;
  const headline = (a.headline as string) ?? "";
  const employer = get(a, "employer.name") as string | undefined;
  const locationStr = workplaceLocation(a);
  const description =
    (get(a, "description.text") as string) ??
    (get(a, "description.text_formatted") as string) ??
    "";
  const appEmail = get(a, "application_details.email") as string | undefined;
  const appUrl = get(a, "application_details.url") as string | undefined;
  const primaryContact = getPrimaryContact(a);
  const contact = primaryContact?.name;
  const contactEmail = primaryContact?.email;
  const contactPhone = primaryContact?.telephone;
  const deadline = a.application_deadline as string | undefined;
  const occupation = get(a, "occupation.label") as string | undefined;
  const employment = get(a, "employment_type.label") as string | undefined;

  return (
    <div className="ad-panel">
      <h2>{headline}</h2>
      {employer && <p className="ad-meta"><strong>{t("ad.employer")}:</strong> {employer}</p>}
      {locationStr && <p className="ad-meta"><strong>{t("ad.location")}:</strong> {locationStr}</p>}
      {occupation && <p className="ad-meta"><strong>{t("ad.occupation")}:</strong> {occupation}</p>}
      {employment && <p className="ad-meta"><strong>{t("ad.employment")}:</strong> {employment}</p>}
      {deadline && (
        <p className="ad-meta">
          <strong>{t("ad.deadline")}:</strong> {new Date(deadline).toLocaleDateString()}
        </p>
      )}
      {contact && <p className="ad-meta"><strong>{t("ad.contact")}:</strong> {contact}</p>}
      {contactEmail && <p className="ad-meta"><strong>{t("ad.contactEmail")}:</strong> {contactEmail}</p>}
      {contactPhone && <p className="ad-meta"><strong>{t("ad.contactPhone")}:</strong> {contactPhone}</p>}
      {appEmail && <p className="ad-meta"><strong>{t("ad.applyEmail")}:</strong> {appEmail}</p>}
      {appUrl && (
        <p className="ad-meta">
          <strong>{t("ad.applyUrl")}:</strong>{" "}
          <a href={appUrl} target="_blank" rel="noreferrer">{appUrl}</a>
        </p>
      )}
      <div className="ad-description">
        <h3>{t("ad.description")}</h3>
        <pre className="ad-description-text">{description}</pre>
      </div>
    </div>
  );
}
