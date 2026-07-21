import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { applicationMethodLabelKey, type ApplicationMethod } from "../lib/applicationMethod";
import { canTailorFormat, versionDisplayName } from "../lib/files";
import { useI18n } from "../lib/i18n";
import type { RoleDocumentVersion } from "../types";

export interface ProceedChoices {
  resumeVersionId: number;
  letterVersionId: number;
  tailorResume: boolean;
  tailorLetter: boolean;
}

interface Props {
  open: boolean;
  roleId: number;
  jobTitle: string;
  applicationMethod?: ApplicationMethod;
  loading?: boolean;
  onConfirm: (choices: ProceedChoices) => void;
  onCancel: () => void;
}

export function ProceedModal({
  open,
  roleId,
  jobTitle,
  applicationMethod,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const [versions, setVersions] = useState<RoleDocumentVersion[]>([]);
  const [resumeVersionId, setResumeVersionId] = useState<number | null>(null);
  const [letterVersionId, setLetterVersionId] = useState<number | null>(null);
  const [tailorResume, setTailorResume] = useState(true);
  const [tailorLetter, setTailorLetter] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    api.listRoleDocumentVersions(roleId).then((list) => {
      setVersions(list);
      const defaultResume = list.find((v) => v.doc_type === "resume" && v.is_default)
        ?? list.find((v) => v.doc_type === "resume");
      const defaultLetter = list.find((v) => v.doc_type === "letter" && v.is_default)
        ?? list.find((v) => v.doc_type === "letter");
      setResumeVersionId(defaultResume?.id ?? null);
      setLetterVersionId(defaultLetter?.id ?? null);
      setTailorResume(defaultResume ? canTailorFormat(defaultResume.format) : true);
      setTailorLetter(defaultLetter ? canTailorFormat(defaultLetter.format) : true);
    }).catch((e) => setError(String(e)));
  }, [open, roleId]);

  if (!open) return null;

  const resumeVersions = versions.filter((v) => v.doc_type === "resume");
  const letterVersions = versions.filter((v) => v.doc_type === "letter");
  const selectedResume = resumeVersions.find((v) => v.id === resumeVersionId);
  const selectedLetter = letterVersions.find((v) => v.id === letterVersionId);
  const resumeCanTailor = selectedResume ? canTailorFormat(selectedResume.format) : false;
  const letterCanTailor = selectedLetter ? canTailorFormat(selectedLetter.format) : false;

  const handleConfirm = () => {
    if (!resumeVersionId || !letterVersionId) {
      setError(t("proceed.selectBoth"));
      return;
    }
    onConfirm({
      resumeVersionId,
      letterVersionId,
      tailorResume: resumeCanTailor && tailorResume,
      tailorLetter: letterCanTailor && tailorLetter,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal proceed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("proceed.title")}</h2>
        </div>
        <div className="modal-body">
          <p className="proceed-job-title">{jobTitle}</p>
          {applicationMethod && applicationMethod !== "email" && (
            <p className="hint proceed-method-hint">
              {applicationMethod === "via_af" && t("proceed.viaAfHint")}
              {applicationMethod === "external_url" && t("proceed.externalHint")}
              {applicationMethod === "unknown" && t("proceed.unknownHint")}
              {" "}
              <span className="badge">{t(applicationMethodLabelKey(applicationMethod) as never)}</span>
            </p>
          )}
          {error && <p className="error-msg">{error}</p>}

          <label className="proceed-field">
            {t("proceed.resume")}
            <select
              value={resumeVersionId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setResumeVersionId(id);
                const v = resumeVersions.find((x) => x.id === id);
                if (v && !canTailorFormat(v.format)) setTailorResume(false);
              }}
            >
              {resumeVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {versionDisplayName(v)}{v.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={`proceed-tailor checkbox-label ${!resumeCanTailor ? "disabled" : ""}`}>
            <span className="taxonomy-option-check color--text-2">
              <input
                type="checkbox"
                checked={tailorResume && resumeCanTailor}
                disabled={!resumeCanTailor}
                onChange={(e) => setTailorResume(e.target.checked)}
              />
            </span>
            <span className="taxonomy-option-label">
            {t("proceed.tailorResume")}
            {!resumeCanTailor && selectedResume && (
              <span className="hint"> {t("proceed.notForFormat")} {selectedResume.format.toUpperCase()}</span>
            )}
            </span>
          </label>

          <label className="proceed-field">
            {t("proceed.letter")}
            <select
              value={letterVersionId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setLetterVersionId(id);
                const v = letterVersions.find((x) => x.id === id);
                if (v && !canTailorFormat(v.format)) setTailorLetter(false);
              }}
            >
              {letterVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {versionDisplayName(v)}{v.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={`proceed-tailor checkbox-label ${!letterCanTailor ? "disabled" : ""}`}>
            <span className="taxonomy-option-check color--text-2">
              <input
                type="checkbox"
                checked={tailorLetter && letterCanTailor}
                disabled={!letterCanTailor}
                onChange={(e) => setTailorLetter(e.target.checked)}
              />
            </span>
            <span className="taxonomy-option-label">
            {t("proceed.tailorLetter")}
            {!letterCanTailor && selectedLetter && (
              <span className="hint"> {t("proceed.notForFormat")} {selectedLetter.format.toUpperCase()}</span>
            )}
            </span>
          </label>
        </div>
        <div className="modal-footer" role="group">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? t("proceed.starting") : t("proceed.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
