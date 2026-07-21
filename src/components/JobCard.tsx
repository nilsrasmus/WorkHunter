import { useEffect, useState, type CSSProperties } from "react";
import { IconExternalLink } from "@tabler/icons-react";
import { AdPanel } from "./AdPanel";
import { api } from "../lib/api";
import {
  applicationMethodBadgeClass,
  applicationMethodLabelKey,
  detectApplicationMethod,
} from "../lib/applicationMethod";
import { useI18n } from "../lib/i18n";
import type { JobAdHit } from "../types";

function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360;
  }
  return hash < 0 ? hash + 360 : hash;
}

interface Props {
  hit: JobAdHit;
  expanded: boolean;
  onToggle: () => void;
  onProceed: () => void;
  onReject: () => void;
  busy?: boolean;
}

export function JobCard({ hit, expanded, onToggle, onProceed, onReject, busy }: Props) {
  const { t } = useI18n();
  const [fullAd, setFullAd] = useState<JobAdHit | null>(null);
  const [loadingAd, setLoadingAd] = useState(false);

  const location =
    hit.workplace_address?.city ??
    hit.workplace_address?.municipality ??
    hit.workplace_address?.region ??
    "";
  const remote = hit.label?.includes("remote") || hit.label?.includes("distans");
  const applyMethod = detectApplicationMethod(hit as unknown as Record<string, unknown>);
  const employerName = hit.employer?.name ?? hit.headline;
  const avatarInitial = (employerName?.trim().charAt(0) || "?").toUpperCase();
  const avatarStyle = { "--avatar-hue": hashHue(employerName ?? "") } as CSSProperties;

  useEffect(() => {
    if (!expanded || fullAd) return;

    let cancelled = false;
    setLoadingAd(true);
    api.jobsearchGetAd(hit.id)
      .then((ad) => {
        if (!cancelled) setFullAd(ad as unknown as JobAdHit);
      })
      .catch(() => {
        if (!cancelled) setFullAd(hit);
      })
      .finally(() => {
        if (!cancelled) setLoadingAd(false);
      });

    return () => {
      cancelled = true;
      setLoadingAd(false);
    };
  }, [expanded, hit.id, fullAd, hit]);

  const displayAd = fullAd ?? hit;

  return (
    <div className={`job-card${expanded ? " job-card-expanded" : ""}`}>
      <div className="job-card-body">
        <div className="job-card-summary">
          <span className="job-card-avatar" style={avatarStyle} aria-hidden="true">
            {avatarInitial}
          </span>
          <div className="job-card-heading">
            <div className="job-card-title-row">
              <h3>{hit.headline}</h3>
              <span className={`badge ${applicationMethodBadgeClass(applyMethod)}`}>
                {t(applicationMethodLabelKey(applyMethod) as never)}
              </span>
            </div>
            <p className="job-card-meta">
              {hit.employer?.name && <span>{hit.employer.name}</span>}
              {location && <span> · {location}</span>}
              {hit.publication_date && (
                <span> · {new Date(hit.publication_date).toLocaleDateString()}</span>
              )}
              {remote && <span className="badge badge-remote">{t("job.remote")}</span>}
            </p>
          </div>
        </div>
        {!expanded && hit.description?.text && (
          <p className="job-card-snippet">
            {hit.description.text.slice(0, 200)}
            {hit.description.text.length > 200 ? "…" : ""}
          </p>
        )}
      </div>

      {expanded && (
        <div className="job-card-details">
          {loadingAd ? (
            <p className="hint">{t("job.loadingDetails")}</p>
          ) : (
            <AdPanel ad={displayAd} />
          )}
        </div>
      )}

      <div className="job-card-footer">
        <button type="button" className="job-card-expand-toggle" onClick={onToggle} aria-expanded={expanded}>
          <IconExternalLink size={14} />
          {expanded ? t("job.collapse") : t("job.expand")}
        </button>
        <div className="job-card-actions" role="group">
          <button type="button" className="btn btn-secondary"
            onClick={onReject}
            disabled={busy}
          >
            {t("job.reject")}
          </button>
          <button type="button" className="btn btn-primary" onClick={onProceed}
            disabled={busy}
          >
            {t("job.proceed")}
          </button>
        </div>
      </div>
    </div>
  );
}
