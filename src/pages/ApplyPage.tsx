import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AdPanel } from "../components/AdPanel";
import { api } from "../lib/api";
import {
  applicationMethodLabelKey,
  detectApplicationMethod,
  getApplicationUrl,
} from "../lib/applicationMethod";
import { revealExportFolder } from "../lib/openExportFolder";
import { useI18n } from "../lib/i18n";
import { useSession } from "../context/SessionContext";
import type { ApplicationMethod } from "../types";

export function ApplyPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { profile } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [adJson, setAdJson] = useState<Record<string, unknown>>({});
  const [applicationMethod, setApplicationMethod] = useState<ApplicationMethod>("unknown");
  const [applyUrl, setApplyUrl] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!applicationId) return;
      setLoading(true);
      setError("");
      try {
        const data = await api.getApplication(Number(applicationId));
        const ad = JSON.parse(data.raw_json) as Record<string, unknown>;
        setAdJson(ad);
        const method = data.application.application_method
          ?? detectApplicationMethod(ad);
        setApplicationMethod(method);
        setApplyUrl(getApplicationUrl(ad));
        setExportPath(data.application.export_path ?? null);
        setNotes(data.application.apply_notes ?? "");
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [applicationId]);

  const saveNotes = async () => {
    if (!applicationId) return;
    await api.saveApplyNotes(Number(applicationId), notes);
  };

  const prepareApplication = async () => {
    if (!profile || !applicationId) return;
    setPreparing(true);
    setError("");
    try {
      await saveNotes();
      const result = await api.exportApplicationPackage(profile.id, Number(applicationId));
      setExportPath(result.export_path);
      await revealExportFolder(result.export_path);
      if (applyUrl) {
        await openUrl(applyUrl);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPreparing(false);
    }
  };

  const openFolder = async () => {
    if (!exportPath) return;
    await revealExportFolder(exportPath);
  };

  const openApplicationPage = async () => {
    if (!applyUrl) return;
    await openUrl(applyUrl);
  };

  const markApplied = async () => {
    if (!applicationId) return;
    await saveNotes();
    await api.markApplicationSent(Number(applicationId));
    navigate("/archive");
  };

  if (loading) {
    return <div className="page loading-page"><p>{t("common.loading")}</p></div>;
  }

  return (
    <div className="page apply-page">
      <div className="page-header">
        <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>{t("apply.back")}</button>
        <h1>{t("apply.title")}</h1>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <p className="hint apply-method-banner">
        <span className="badge">{t(applicationMethodLabelKey(applicationMethod) as never)}</span>
        {applicationMethod === "via_af" && t("apply.viaAfHint")}
        {applicationMethod === "external_url" && t("apply.externalHint")}
        {applicationMethod === "unknown" && t("proceed.unknownHint")}
      </p>

      <div className="apply-layout">
        <div className="apply-ad">
          <AdPanel ad={adJson} />
        </div>
        <div className="apply-panel">
          <div className="apply-actions">
            <button type="button" className="btn btn-primary" onClick={prepareApplication}
              disabled={preparing}
            >
              {preparing ? t("apply.preparing") : t("apply.prepare")}
            </button>
            {exportPath && (
              <button type="button" className="btn btn-secondary" onClick={openFolder}>
                {t("apply.openFolder")}
              </button>
            )}
            {applyUrl && (
              <button type="button" className="btn btn-secondary" onClick={openApplicationPage}>
                {t("apply.openUrl")}
              </button>
            )}
          </div>

          {exportPath && (
            <p className="hint">
              <strong>{t("apply.exportedTo")}:</strong> {exportPath}
            </p>
          )}

          <label>
            {t("apply.notes")}
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder={t("apply.notesPlaceholder")}
            />
          </label>

          <div className="apply-footer">
            <button type="button" className="btn btn-primary" onClick={markApplied}
              disabled={!exportPath}
            >
              {t("apply.markApplied")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
