import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdPanel } from "../components/AdPanel";
import { RichDocumentEditor } from "../components/RichDocumentEditor";
import { api } from "../lib/api";
import { detectApplicationMethod } from "../lib/applicationMethod";
import { getAiProviderLabel, hasAiApiKey, tailorDocuments } from "../lib/ai";
import { canTailorFormat } from "../lib/files";
import { defaultPdfFileName } from "../lib/documentUtils";
import { ensureVersionHtml } from "../lib/ensureEditableHtml";
import { useI18n } from "../lib/i18n";
import { useSession } from "../context/SessionContext";
import type { AdDecision, DocumentFormat, RoleDocumentVersion } from "../types";

type ReviewView = "ad" | "resume" | "letter";

interface DocState {
  versionId: number;
  format: DocumentFormat;
  fileName: string | null;
  content: string;
  editable: boolean;
}

function contentFromApplication(appHtml: string, fallbackHtml: string): string {
  return appHtml.trim() ? appHtml : fallbackHtml;
}

export function ReviewPage() {
  const { decisionId } = useParams<{ decisionId: string }>();
  const { profile, settings } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [adJson, setAdJson] = useState<Record<string, unknown>>({});
  const [decision, setDecision] = useState<AdDecision | null>(null);
  const [resume, setResume] = useState<DocState>({
    versionId: 0,
    format: "html",
    fileName: null,
    content: "",
    editable: true,
  });
  const [letter, setLetter] = useState<DocState>({
    versionId: 0,
    format: "html",
    fileName: null,
    content: "",
    editable: true,
  });
  const [view, setView] = useState<ReviewView>("resume");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");

  const buildDocState = (version: RoleDocumentVersion, content: string): DocState => ({
    versionId: version.id,
    format: "html",
    fileName: version.file_name,
    content,
    editable: true,
  });

  const saveDocs = async (
    d: AdDecision,
    resumeState: DocState,
    letterState: DocState,
  ) => {
    if (!profile) return;
    await api.saveApplication({
      profileId: profile.id,
      adDecisionId: d.id,
      tailoredResumeMd: "",
      tailoredLetterMd: "",
      tailoredResumeHtml: resumeState.content,
      tailoredLetterHtml: letterState.content,
      resumeFormat: "html",
      letterFormat: "html",
      resumeFileName: resumeState.fileName ?? defaultPdfFileName("resume", "html"),
      letterFileName: letterState.fileName ?? defaultPdfFileName("letter", "html"),
    });
  };

  useEffect(() => {
    const load = async () => {
      if (!decisionId || !profile || !settings) return;
      setLoading(true);
      setError("");
      try {
        const [d, adRecord] = await api.getDecisionWithAd(Number(decisionId));
        const ad = JSON.parse((adRecord as { raw_json: string }).raw_json) as Record<string, unknown>;
        setAdJson(ad);
        setDecision(d);

        const resumeRaw = d.resume_version_id
          ? await api.getRoleDocumentVersion(d.resume_version_id)
          : null;
        const letterRaw = d.letter_version_id
          ? await api.getRoleDocumentVersion(d.letter_version_id)
          : null;

        if (!resumeRaw || !letterRaw) {
          setError("Missing document versions for this application.");
          return;
        }

        const resumeEnsured = await ensureVersionHtml(resumeRaw);
        const letterEnsured = await ensureVersionHtml(letterRaw);
        const resumeVersion = resumeEnsured.version;
        const letterVersion = letterEnsured.version;

        const existing = await api.getApplicationByDecision(d.id);
        if (existing) {
          setResume(buildDocState(
            resumeVersion,
            contentFromApplication(existing.tailored_resume_html, resumeEnsured.html),
          ));
          setLetter(buildDocState(
            letterVersion,
            contentFromApplication(existing.tailored_letter_html, letterEnsured.html),
          ));
          return;
        }

        let resumeContent = resumeEnsured.html;
        let letterContent = letterEnsured.html;
        const needsTailoring = (d.tailor_resume && canTailorFormat(resumeVersion.format))
          || (d.tailor_letter && canTailorFormat(letterVersion.format));

        if (needsTailoring) {
          if (!hasAiApiKey(settings)) {
            setError("AI API key not configured. Open Settings and add a key for your chosen provider.");
            setResume(buildDocState(resumeVersion, resumeContent));
            setLetter(buildDocState(letterVersion, letterContent));
            return;
          }
          setGenerating(true);
          const tailorOpts = {
            tailorResume: d.tailor_resume && canTailorFormat(resumeVersion.format),
            tailorLetter: d.tailor_letter && canTailorFormat(letterVersion.format),
            resumeFormat: resumeVersion.format,
            letterFormat: letterVersion.format,
          };
          const roleData = await api.getRole(d.role_id);
          const result = await tailorDocuments(
            settings,
            roleData.role.name,
            resumeContent,
            letterContent,
            JSON.stringify(ad),
            tailorOpts,
            roleData.role.prompt_tailor_docs,
            {
              resumeMd: resumeVersion.content_md,
              letterMd: letterVersion.content_md,
            },
          );
          if (tailorOpts.tailorResume && result.resumeHtml) {
            resumeContent = result.resumeHtml;
          }
          if (tailorOpts.tailorLetter && result.letterHtml) {
            letterContent = result.letterHtml;
          }
          setGenerating(false);
        }

        const resumeState = buildDocState(resumeVersion, resumeContent);
        const letterState = buildDocState(letterVersion, letterContent);
        setResume(resumeState);
        setLetter(letterState);
        await saveDocs(d, resumeState, letterState);
      } catch (e) {
        setError(String(e));
        setGenerating(false);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [decisionId, profile, settings]);

  const regenerate = async () => {
    if (!decisionId || !profile || !settings || !decision || !hasAiApiKey(settings)) return;
    if (!decision.tailor_resume && !decision.tailor_letter) {
      setError("AI tailoring was not enabled for this application.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const resumeRaw = decision.resume_version_id
        ? await api.getRoleDocumentVersion(decision.resume_version_id)
        : null;
      const letterRaw = decision.letter_version_id
        ? await api.getRoleDocumentVersion(decision.letter_version_id)
        : null;
      if (!resumeRaw || !letterRaw) return;

      const resumeEnsured = await ensureVersionHtml(resumeRaw);
      const letterEnsured = await ensureVersionHtml(letterRaw);
      const resumeVersion = resumeEnsured.version;
      const letterVersion = letterEnsured.version;

      const tailorOpts = {
        tailorResume: decision.tailor_resume && canTailorFormat(resumeVersion.format),
        tailorLetter: decision.tailor_letter && canTailorFormat(letterVersion.format),
        resumeFormat: resumeVersion.format,
        letterFormat: letterVersion.format,
      };
      const roleData = await api.getRole(decision.role_id);
      const result = await tailorDocuments(
        settings,
        roleData.role.name,
        resumeEnsured.html,
        letterEnsured.html,
        JSON.stringify(adJson),
        tailorOpts,
        roleData.role.prompt_tailor_docs,
        {
          resumeMd: resumeVersion.content_md,
          letterMd: letterVersion.content_md,
        },
      );

      const nextResume = {
        ...resume,
        format: "html" as const,
        editable: true,
        content: tailorOpts.tailorResume && result.resumeHtml
          ? result.resumeHtml
          : resume.content,
      };
      const nextLetter = {
        ...letter,
        format: "html" as const,
        editable: true,
        content: tailorOpts.tailorLetter && result.letterHtml
          ? result.letterHtml
          : letter.content,
      };
      setResume(nextResume);
      setLetter(nextLetter);
      await saveDocs(decision, nextResume, nextLetter);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const previewActivePdf = async () => {
    const doc = view === "resume" ? resume : letter;
    if (!doc.content.trim()) return;
    setPreviewLoading(true);
    setError("");
    try {
      const fontCss = profile ? await api.getCustomFontsCss(profile.id) : "";
      const data = await api.generateHtmlPdfBase64(doc.content, fontCss || undefined);
      setPreviewPdf(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const saveAndApprove = async () => {
    if (!decision) return;
    const app = await api.saveApplication({
      profileId: decision.profile_id,
      adDecisionId: decision.id,
      tailoredResumeMd: "",
      tailoredLetterMd: "",
      tailoredResumeHtml: resume.content,
      tailoredLetterHtml: letter.content,
      resumeFormat: "html",
      letterFormat: "html",
      resumeFileName: resume.fileName ?? defaultPdfFileName("resume", "html"),
      letterFileName: letter.fileName ?? defaultPdfFileName("letter", "html"),
    });
    const method = decision.application_method ?? detectApplicationMethod(adJson);
    if (method === "email") {
      navigate(`/email/${app.id}`);
    } else {
      navigate(`/apply/${app.id}`);
    }
  };

  const approveUsesEmail = (decision?.application_method ?? detectApplicationMethod(adJson)) === "email";
  const canRegenerate = Boolean(decision && (decision.tailor_resume || decision.tailor_letter));

  const viewTitleKey = view === "ad"
    ? "review.view.ad"
    : view === "resume"
      ? "review.view.resume"
      : "review.view.letter";

  if (loading || generating) {
    return (
      <div className="page loading-page">
        <p>{generating ? `${t("review.tailoring")} ${settings ? getAiProviderLabel(settings) : "AI"}…` : t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="page review-page">
      <header className="page-header" role="group">
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>{t("review.back")}</button>
        <h1>{t("review.title")}</h1>
      </header>
      {error && <p className="error-msg">{error}</p>}
      <div className="review-single">
        <div className="review-view-tabs doc-tabs">
          <button type="button" className={view === "ad" ? "active" : ""} onClick={() => setView("ad")}>
            {t("review.view.ad")}
          </button>
          <button type="button" className={view === "resume" ? "active" : ""} onClick={() => setView("resume")}>
            {t("review.view.resume")}
          </button>
          <button type="button" className={view === "letter" ? "active" : ""} onClick={() => setView("letter")}>
            {t("review.view.letter")}
          </button>
        </div>

        <article className="ui-section--review">
          <header>
            <h2>{t(viewTitleKey)}</h2>
          </header>
          <div className="ui-section-document">
            {view === "ad" && <AdPanel ad={adJson} />}
            {view === "resume" && (
              <RichDocumentEditor
                value={resume.content}
                onChange={(v) => setResume((s) => ({ ...s, content: v }))}
              />
            )}
            {view === "letter" && (
              <RichDocumentEditor
                value={letter.content}
                onChange={(v) => setLetter((s) => ({ ...s, content: v }))}
              />
            )}
            {view !== "ad" && (
              <div className="review-pdf-preview" role="group">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={previewActivePdf}
                  disabled={previewLoading}
                >
                  {previewLoading ? t("review.previewPdfLoading") : t("review.previewPdf")}
                </button>
                {previewPdf && (
                  <iframe
                    title={t("review.previewPdf")}
                    className="pdf-preview-frame"
                    src={`data:application/pdf;base64,${previewPdf}`}
                  />
                )}
              </div>
            )}
          </div>
        </article>

        <article>
          <header>
            <h2>{t("review.section.actions")}</h2>
          </header>
          <div role="group">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={regenerate}
              disabled={!canRegenerate || !settings || !hasAiApiKey(settings)}
            >
              {t("review.regenerate")}
            </button>
            <button type="button" className="btn btn-primary" onClick={saveAndApprove}>
              {approveUsesEmail ? t("review.approve") : t("review.approveApply")}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
