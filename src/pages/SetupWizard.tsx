import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { RoleDocumentEditor, type RoleDocTab } from "../components/RoleDocumentEditor";
import { api } from "../lib/api";
import { bytesToBase64 } from "../lib/files";
import { useSession } from "../context/SessionContext";

export function SetupWizard() {
  const { profile, setProfile, refreshSession } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(profile ? (profile.setup_completed ? 4 : 2) : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [resume, setResume] = useState("");
  const [letter, setLetter] = useState("");

  const signIn = async () => {
    setLoading(true);
    setError("");
    try {
      const p = await api.startGoogleAuth();
      setProfile(p);
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
      await api.updateRoleDocument(roleId, "resume", resume);
      await api.updateRoleDocument(roleId, "letter", letter);
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
    const lower = file.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".txt")) {
      const content = await readTextFile(file);
      if (docType === "resume") setResume(content);
      else setLetter(content);
      return;
    }
    const format = lower.endsWith(".pdf") ? "pdf" as const : "docx" as const;
    const bytes = await readFile(file);
    const fileName = file.split(/[/\\]/).pop() ?? `upload.${format}`;
    const name = fileName.replace(/\.(pdf|docx)$/i, "");
    const v = await api.uploadRoleDocumentFile(roleId, docType, name, format, fileName, bytesToBase64(bytes));
    await api.setDefaultRoleDocumentVersion(v.id);
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
              {loading ? "Saving…" : "Continue"}
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
