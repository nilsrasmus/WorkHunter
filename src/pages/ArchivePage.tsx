import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IconChevronRight, IconClock } from "@tabler/icons-react";
import { RichDocumentEditor } from "../components/RichDocumentEditor";
import { AdPanel } from "../components/AdPanel";
import { api } from "../lib/api";
import {
  applicationMethodBadgeClass,
  applicationMethodLabelKey,
  detectApplicationMethod,
  getApplicationUrl,
} from "../lib/applicationMethod";
import { markdownToHtml } from "../lib/documentUtils";
import { revealExportFolder } from "../lib/openExportFolder";
import { useI18n } from "../lib/i18n";
import { safeHttpUrl } from "../lib/safeUrl";
import { useSession } from "../context/SessionContext";
import type { ApplicationMethod, ApplicationWithMeta } from "../types";

function formatUrlForDisplay(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function archiveDocHtml(html: string | undefined, md: string | undefined): string {
  if (html?.trim()) return html;
  if (md?.trim()) return markdownToHtml(md);
  return "<p></p>";
}

function parseAdJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type ArchiveItemView = ApplicationWithMeta & {
  ad: Record<string, unknown>;
  method: ApplicationMethod;
};

function toArchiveItemView(item: ApplicationWithMeta): ArchiveItemView {
  const ad = parseAdJson(item.raw_json);
  const method = item.application.application_method ?? detectApplicationMethod(ad);
  return { ...item, ad, method };
}

export function ArchivePage() {
  const { profile } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ArchiveItemView[]>([]);
  const [selected, setSelected] = useState<ArchiveItemView | null>(null);
  const [docTab, setDocTab] = useState<"resume" | "letter" | "email">("resume");
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    if (!profile) return;
    const requestId = ++requestIdRef.current;
    const results = await api.searchArchive(profile.id, q);
    if (requestId !== requestIdRef.current) return;
    setItems(results.map(toArchiveItemView));
  }, [profile]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, runSearch]);

  const selectItem = async (item: ArchiveItemView) => {
    setSelected(item);
    setDocTab("resume");
    if (item.application.sent_at) {
      const days = await api.daysUntilRetention(item.application.sent_at);
      setRetentionDays(days);
    } else {
      setRetentionDays(null);
    }
  };

  const selectedUrl = useMemo(
    () => (selected ? safeHttpUrl(getApplicationUrl(selected.ad)) : null),
    [selected],
  );
  const hasDetailsSection = Boolean(
    selected?.method
    || selectedUrl
    || selected?.application.export_path
    || selected?.application.email_to
    || selected?.contact_name
    || selected?.application.email_subject
    || selected?.application.apply_notes,
  );

  if (!profile) return null;

  return (
    <div className="page archive-page">
      <header className="page-header" role="group">
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>{t("common.back")}</button>
        <h1>{t("nav.archive")}</h1>
      </header>

      <div className="archive-search" role="search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("archive.searchPlaceholder")}
        />
        <button type="button" className="btn btn-primary" onClick={() => void runSearch(query)}>{t("common.search")}</button>
      </div>

      <div className="archive-layout">
        <div className="archive-list">
          {items.length === 0 && <p className="empty-state">{t("archive.empty")}</p>}
          {items.map((item) => (
            <button
              key={item.application.id}
              type="button"
              className={`archive-item ${selected?.application.id === item.application.id ? "active" : ""}`}
              onClick={() => void selectItem(item)}
            >
              <strong>{item.headline}</strong>
              <span>{item.employer_name}</span>
              <span className="archive-item-meta">
                <span className={`badge ${applicationMethodBadgeClass(item.method)}`}>
                  {t(applicationMethodLabelKey(item.method) as never)}
                </span>
                <span>{item.application.sent_at ? new Date(item.application.sent_at).toLocaleDateString() : ""}</span>
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="archive-detail">
            <article className="archive-detail-card">
              <header className="archive-detail-header">
                <h2>{selected.headline}</h2>
                <p className="archive-detail-meta">
                  {selected.employer_name}
                  {selected.location ? ` · ${selected.location}` : ""}
                </p>
                {retentionDays !== null && (
                  <span className="badge badge-retention">
                    <IconClock size={14} aria-hidden="true" />
                    {t("archive.retention").replace("{days}", String(retentionDays))}
                  </span>
                )}
              </header>

              {hasDetailsSection && (
                <section className="archive-detail-section archive-detail-section--bordered">
                  <h3>{t("archive.section.details")}</h3>
                  <dl className="archive-details-list">
                    {selected.method && (
                      <>
                        <dt>{t("archive.method")}</dt>
                        <dd>{t(applicationMethodLabelKey(selected.method) as never)}</dd>
                      </>
                    )}
                    {selectedUrl && (
                      <>
                        <dt>{t("archive.applyUrl")}</dt>
                        <dd>
                          <a href={selectedUrl} target="_blank" rel="noreferrer">
                            {formatUrlForDisplay(selectedUrl)}
                          </a>
                        </dd>
                      </>
                    )}
                    {selected.application.email_to && (
                      <>
                        <dt>{t("archive.emailTo")}</dt>
                        <dd>{selected.application.email_to}</dd>
                      </>
                    )}
                    {selected.contact_name && (
                      <>
                        <dt>{t("archive.contact")}</dt>
                        <dd>{selected.contact_name}</dd>
                      </>
                    )}
                    {selected.application.email_subject && (
                      <>
                        <dt>{t("archive.subject")}</dt>
                        <dd>{selected.application.email_subject}</dd>
                      </>
                    )}
                    {selected.application.apply_notes && (
                      <>
                        <dt>{t("archive.notes")}</dt>
                        <dd>{selected.application.apply_notes}</dd>
                      </>
                    )}
                    {selected.application.export_path && (
                      <>
                        <dt>{t("archive.exportPath")}</dt>
                        <dd>
                          <button type="button" className="link-btn"
                            onClick={() => revealExportFolder(selected.application.export_path!)}
                          >
                            {t("archive.openFolder")}
                          </button>
                        </dd>
                      </>
                    )}
                  </dl>
                </section>
              )}

              <section className="archive-detail-section ui-section--archive-docs">
                <h3>{t("archive.section.documents")}</h3>
                <div className="doc-tabs doc-tabs-lg" role="group">
                  <button type="button" className={docTab === "resume" ? "active" : ""}
                    onClick={() => setDocTab("resume")}
                  >
                    {t("archive.tab.resume")}
                  </button>
                  <button type="button" className={docTab === "letter" ? "active" : ""}
                    onClick={() => setDocTab("letter")}
                  >
                    {t("archive.tab.letter")}
                  </button>
                  {selected.method === "email" && (
                    <button type="button" className={docTab === "email" ? "active" : ""}
                      onClick={() => setDocTab("email")}
                    >
                      {t("archive.tab.email")}
                    </button>
                  )}
                </div>
                <div className="ui-section-document">
                  {profile.display_name && docTab !== "email" && (
                    <p className="archive-doc-byline">{profile.display_name}</p>
                  )}
                  {docTab === "resume" && (
                    <RichDocumentEditor
                      value={archiveDocHtml(
                        selected.application.tailored_resume_html,
                        selected.application.tailored_resume_md,
                      )}
                      onChange={() => {}}
                      preview
                    />
                  )}
                  {docTab === "letter" && (
                    <RichDocumentEditor
                      value={archiveDocHtml(
                        selected.application.tailored_letter_html,
                        selected.application.tailored_letter_md,
                      )}
                      onChange={() => {}}
                      preview
                    />
                  )}
                  {docTab === "email" && selected.method === "email" && (
                    <pre className="email-body-preview">{selected.application.email_body}</pre>
                  )}
                </div>
              </section>

              <details className="filter-section archive-ad-toggle">
                <summary>
                  <IconChevronRight size={16} className="filter-section-chevron" aria-hidden="true" />
                  {t("archive.section.jobAd")}
                </summary>
                <div className="filter-section-body archive-ad-body">
                  <AdPanel ad={selected.ad} />
                  {selectedUrl && (
                    <button type="button" className="btn btn-secondary archive-ad-open-btn"
                      onClick={() => openUrl(selectedUrl)}
                    >
                      {t("archive.openUrl")}
                    </button>
                  )}
                </div>
              </details>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
