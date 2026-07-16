import { useEffect, useState } from "react";
import { AdPanel } from "./AdPanel";
import { api } from "../lib/api";
import { applicationMethodLabelKey, detectApplicationMethod } from "../lib/applicationMethod";
import { useI18n } from "../lib/i18n";
import type { JobAdHit } from "../types";

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
      <button type="button" className="job-card-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="job-card-summary">
          <h3>{hit.headline}</h3>
          <p className="job-card-meta">
            {hit.employer?.name && <span>{hit.employer.name}</span>}
            {location && <span> · {location}</span>}
            {hit.publication_date && (
              <span> · {new Date(hit.publication_date).toLocaleDateString()}</span>
            )}
            {remote && <span className="badge">{t("job.remote")}</span>}
            <span className="badge badge-method">{t(applicationMethodLabelKey(applyMethod) as never)}</span>
          </p>
          {!expanded && hit.description?.text && (
            <p className="job-card-snippet">
              {hit.description.text.slice(0, 200)}
              {hit.description.text.length > 200 ? "…" : ""}
            </p>
          )}
          <span className="job-card-expand-hint">
            {expanded ? t("job.collapse") : t("job.expand")}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="job-card-details">
          {loadingAd ? (
            <p className="hint">{t("job.loadingDetails")}</p>
          ) : (
            <AdPanel ad={displayAd} />
          )}
        </div>
      )}

      <div className="job-card-actions" role="group">
        <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onProceed(); }}
          disabled={busy}
        >
          {t("job.proceed")}
        </button>
        <button type="button" className="btn btn-secondary"
          onClick={(e) => { e.stopPropagation(); onReject(); }}
          disabled={busy}
        >
          {t("job.reject")}
        </button>
      </div>
    </div>
  );
}
