import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdPanel } from "../components/AdPanel";
import { BinaryDocumentPreview } from "../components/BinaryDocumentPreview";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { api } from "../lib/api";
import { detectApplicationMethod } from "../lib/applicationMethod";
import { getAiProviderLabel, hasAiApiKey, tailorDocuments } from "../lib/ai";
import { canTailorFormat } from "../lib/files";
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

export function ReviewPage() {
  const { decisionId } = useParams<{ decisionId: string }>();
  const { profile, settings } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [adJson, setAdJson] = useState<Record<string, unknown>>({});
  const [decision, setDecision] = useState<AdDecision | null>(null);
  const [resume, setResume] = useState<DocState>({
    versionId: 0,
    format: "markdown",
    fileName: null,
    content: "",
    editable: true,
  });
  const [letter, setLetter] = useState<DocState>({
    versionId: 0,
    format: "markdown",
    fileName: null,
    content: "",
    editable: true,
  });
  const [view, setView] = useState<ReviewView>("resume");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const buildDocState = (version: RoleDocumentVersion, content: string): DocState => ({
    versionId: version.id,
    format: version.format,
    fileName: version.file_name,
    content,
    editable: version.format === "markdown",
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
      tailoredResumeMd: resumeState.content,
      tailoredLetterMd: letterState.content,
      resumeFormat: resumeState.format,
      letterFormat: letterState.format,
      resumeFileName: resumeState.fileName ?? (resumeState.format === "markdown" ? "resume.pdf" : null),
      letterFileName: letterState.fileName ?? (letterState.format === "markdown" ? "personal_letter.pdf" : null),
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

        const resumeVersion = d.resume_version_id
          ? await api.getRoleDocumentVersion(d.resume_version_id)
          : null;
        const letterVersion = d.letter_version_id
          ? await api.getRoleDocumentVersion(d.letter_version_id)
          : null;

        if (!resumeVersion || !letterVersion) {
          setError("Missing document versions for this application.");
          return;
        }

        const existing = await api.getApplicationByDecision(d.id);
        if (existing) {
          setResume(buildDocState(resumeVersion, existing.tailored_resume_md));
          setLetter(buildDocState(letterVersion, existing.tailored_letter_md));
          if (existing.resume_format) {
            setResume((s) => ({ ...s, format: existing.resume_format!, fileName: existing.resume_file_name }));
          }
          if (existing.letter_format) {
            setLetter((s) => ({ ...s, format: existing.letter_format!, fileName: existing.letter_file_name }));
          }
          return;
        }

        let resumeContent = resumeVersion.content_md;
        let letterContent = letterVersion.content_md;
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
            resumeVersion.content_md,
            letterVersion.content_md,
            JSON.stringify(ad),
            tailorOpts,
            roleData.role.prompt_tailor_docs,
          );
          if (tailorOpts.tailorResume && result.resume) {
            resumeContent = result.resume;
          }
          if (tailorOpts.tailorLetter && result.letter) {
            letterContent = result.letter;
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
      const resumeVersion = decision.resume_version_id
        ? await api.getRoleDocumentVersion(decision.resume_version_id)
        : null;
      const letterVersion = decision.letter_version_id
        ? await api.getRoleDocumentVersion(decision.letter_version_id)
        : null;
      if (!resumeVersion || !letterVersion) return;

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
        resumeVersion.content_md,
        letterVersion.content_md,
        JSON.stringify(adJson),
        tailorOpts,
        roleData.role.prompt_tailor_docs,
      );

      const nextResume = {
        ...resume,
        content: tailorOpts.tailorResume && result.resume
          ? result.resume
          : resume.content,
      };
      const nextLetter = {
        ...letter,
        content: tailorOpts.tailorLetter && result.letter
          ? result.letter
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

  const saveAndApprove = async () => {
    if (!decision) return;
    const app = await api.saveApplication({
      profileId: decision.profile_id,
      adDecisionId: decision.id,
      tailoredResumeMd: resume.content,
      tailoredLetterMd: letter.content,
      resumeFormat: resume.format,
      letterFormat: letter.format,
      resumeFileName: resume.fileName,
      letterFileName: letter.fileName,
    });
    const method = decision.application_method ?? detectApplicationMethod(adJson);
    if (method === "email") {
      navigate(`/email/${app.id}`);
    } else {
      navigate(`/apply/${app.id}`);
    }
  };

  const approveUsesEmail = (decision?.application_method ?? detectApplicationMethod(adJson)) === "email";

  const activeDoc = view === "resume" ? resume : letter;
  const canRegenerate = decision && (decision.tailor_resume || decision.tailor_letter)
    && (resume.editable || letter.editable);

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
              activeDoc.editable ? (
                <MarkdownEditor
                  value={resume.content}
                  onChange={(v) => setResume((s) => ({ ...s, content: v }))}
                />
              ) : (
                <div className="binary-doc-preview">
                  <p className="hint">{t("review.binary.hint")}</p>
                  <BinaryDocumentPreview source={{ kind: "version", versionId: resume.versionId }} />
                </div>
              )
            )}
            {view === "letter" && (
              letter.editable ? (
                <MarkdownEditor
                  value={letter.content}
                  onChange={(v) => setLetter((s) => ({ ...s, content: v }))}
                />
              ) : (
                <div className="binary-doc-preview">
                  <p className="hint">{t("review.binary.hint")}</p>
                  <BinaryDocumentPreview source={{ kind: "version", versionId: letter.versionId }} />
                </div>
              )
            )}
          </div>
        </article>

        <article>
          <header>
            <h2>{t("review.section.actions")}</h2>
          </header>
          <div role="group">
            {canRegenerate && (
              <button type="button" className="btn btn-secondary" onClick={regenerate} disabled={generating}>
                {t("review.regenerate")}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={saveAndApprove}>
              {approveUsesEmail ? t("review.approve") : t("review.approveApply")}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
