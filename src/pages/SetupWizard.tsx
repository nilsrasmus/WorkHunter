import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { BusyModal } from "../components/BusyModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RoleDocumentEditor, type RoleDocTab } from "../components/RoleDocumentEditor";
import { api } from "../lib/api";
import { ensureSlotIds } from "../lib/contentSlots";
import { importPathToHtml } from "../lib/ensureEditableHtml";
import { useSession } from "../context/SessionContext";
import { hasAiApiKey } from "../lib/ai";
import { useI18n } from "../lib/i18n";

export function SetupWizard() {
  const { t } = useI18n();
  const { profile, refreshSession, settings } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(profile ? (profile.setup_completed ? 4 : 2) : 1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [aiErrorDetail, setAiErrorDetail] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [resume, setResume] = useState("");
  const [letter, setLetter] = useState("");
  const aiReady = !!(settings && hasAiApiKey(settings));

  const signIn = async () => {
    setLoading(true);
    setError("");
    try {
      await api.startGoogleAuth();
      // Reload profile + settings so AI document import has API keys available.
      await refreshSession();
      setStep(2);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const createRole = async () => {
    if (!profile || !roleName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const role = await api.createRole(profile.id, roleName.trim());
      setRoleId(role.id);
      setStep(3);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const saveDocs = async () => {
    if (!roleId) return;
    setLoading(true);
    setError("");
    try {
      const versions = await api.listRoleDocumentVersions(roleId);
      const resumeVersion = versions.find((v) => v.doc_type === "resume" && v.is_default);
      const letterVersion = versions.find((v) => v.doc_type === "letter" && v.is_default);
      if (resumeVersion) {
        await api.updateRoleDocumentHtml(resumeVersion.id, ensureSlotIds(resume));
      }
      if (letterVersion) {
        await api.updateRoleDocumentHtml(letterVersion.id, ensureSlotIds(letter));
      }
      setStep(4);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      await api.completeSetup(profile.id);
      await refreshSession();
      navigate("/");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (docType: RoleDocTab) => {
    if (!roleId) return;
    const file = await open({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["md", "txt", "pdf", "docx"] }],
    });
    if (!file || typeof file !== "string") return;
    setUploading(true);
    setLoading(true);
    setError("");
    try {
      const imported = await importPathToHtml(file, {
        settings,
        docType,
      });
      if (imported.aiError) setAiErrorDetail(imported.aiError);
      if (docType === "resume") setResume(imported.html);
      else setLetter(imported.html);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
      setLoading(false);
    }
  };

  const stepsBar = (
    <div className="setup-steps">
      <span className={step >= 1 ? "active" : ""}>1. Sign in</span>
      <span className={step >= 2 ? "active" : ""}>2. Role</span>
      <span className={step >= 3 ? "active" : ""}>3. Documents</span>
      <span className={step >= 4 ? "active" : ""}>4. Ready</span>
    </div>
  );

  if (step === 3) {
    return (
      <div className="setup-wizard setup-wizard--documents">
        <ConfirmDialog
          open={!!aiErrorDetail}
          title={t("roles.aiImportFailed")}
          message={`${t("roles.aiImportFailedHint")}\n\n${aiErrorDetail ?? ""}`}
          alertOnly
          confirmLabel={t("common.close")}
          onConfirm={() => setAiErrorDetail(null)}
          onCancel={() => setAiErrorDetail(null)}
        />
        <BusyModal
          open={uploading && aiReady}
          title={t("roles.convertingAiTitle")}
          message={t("roles.convertingAiBody")}
        />
        <div className="setup-documents-shell">
          <header className="setup-documents-header">
            <div>
              <h1>Base documents</h1>
              <p>
                Add your resume and personal letter for <strong>{roleName}</strong>.
                Edit one document at a time — use the tabs to switch.
              </p>
            </div>
            {stepsBar}
          </header>

          {error && <p className="error-msg">{error}</p>}

          <RoleDocumentEditor
            resume={resume}
            letter={letter}
            onResumeChange={setResume}
            onLetterChange={setLetter}
            onUpload={uploadFile}
          />

          <footer className="setup-documents-footer" role="group">
            <button type="button" className="btn btn-secondary"
              onClick={() => setStep(2)}
              disabled={loading}
            >
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={saveDocs}
              disabled={loading}
            >
              {loading && !uploading ? "Saving…" : "Continue"}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-wizard">
      <div className="setup-card">
        <h1>Welcome to WorkHunter</h1>
        {stepsBar}

        {error && <p className="error-msg">{error}</p>}

        {step === 1 && (
          <div className="setup-step">
            <p>Sign in with your Google account to create your profile. This also enables Gmail draft creation.</p>
            <button type="button" className="btn btn-primary" onClick={signIn} disabled={loading}>
              {loading ? "Signing in…" : "Sign in with Google"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="setup-step">
            <p>Add your first job-search role (e.g. "Backend Developer").</p>
            <label>
              Role name
              <input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Backend Developer" />
            </label>
            <button type="button" className="btn btn-primary" onClick={createRole} disabled={loading || !roleName.trim()}>
              Continue
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="setup-step">
            <h2>You're ready!</h2>
            <p>Start searching Platsbanken for jobs matching your role.</p>
            <button type="button" className="btn btn-primary" onClick={finish} disabled={loading}>
              {loading ? "Starting…" : "Go to search"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
