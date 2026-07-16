import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirm } from "@tauri-apps/plugin-dialog";
import { RoleDocumentVersionsPanel } from "../components/RoleDocumentVersionsPanel";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../context/SessionContext";

export function RolesPage() {
  const { profile, settings } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [saving, setSaving] = useState(false);
  const [storedTailorPrompt, setStoredTailorPrompt] = useState<string | null>(null);
  const [tailorPromptDraft, setTailorPromptDraft] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  const loadRoles = useCallback(async () => {
    if (!profile) return;
    const list = await api.listRoles(profile.id);
    setRoles(list.map((r) => ({ id: r.id, name: r.name })));
  }, [profile]);

  const loadRole = useCallback(async (id: number) => {
    const data = await api.getRole(id);
    setSelectedId(id);
    setName(data.role.name);
    setStoredTailorPrompt(data.role.prompt_tailor_docs);
    setTailorPromptDraft(data.role.prompt_tailor_docs ?? "");
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  useEffect(() => {
    if (roles.length > 0 && selectedId === null) {
      loadRole(roles[0].id);
    }
  }, [roles, selectedId, loadRole]);

  const createRole = async () => {
    if (!profile || !newRoleName.trim()) return;
    const role = await api.createRole(profile.id, newRoleName.trim());
    setNewRoleName("");
    await loadRoles();
    await loadRole(role.id);
  };

  const saveName = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.updateRoleName(selectedId, name);
      await loadRoles();
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (id: number) => {
    const ok = await confirm(t("role.delete.message"), {
      title: t("role.delete.title"),
      kind: "warning",
      okLabel: t("role.delete.confirm"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    await api.deleteRole(id);
    setSelectedId(null);
    await loadRoles();
  };

  const importBaseTailorPrompt = () => {
    if (!settings) return;
    setTailorPromptDraft(settings.prompt_tailor_docs);
  };

  const saveTailorPrompt = async () => {
    if (!selectedId || !tailorPromptDraft.trim()) return;
    setSavingPrompt(true);
    try {
      const role = await api.saveRoleTailorPrompt(selectedId, tailorPromptDraft);
      setStoredTailorPrompt(role.prompt_tailor_docs);
      setTailorPromptDraft(role.prompt_tailor_docs ?? "");
    } finally {
      setSavingPrompt(false);
    }
  };

  const deleteTailorPrompt = async () => {
    if (!selectedId) return;
    const ok = await confirm(t("roles.tailorPrompt.deleteMessage"), {
      title: t("roles.tailorPrompt.deleteTitle"),
      kind: "warning",
      okLabel: t("roles.tailorPrompt.delete"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    setSavingPrompt(true);
    try {
      await api.clearRoleTailorPrompt(selectedId);
      setStoredTailorPrompt(null);
      setTailorPromptDraft("");
    } finally {
      setSavingPrompt(false);
    }
  };

  const hasStoredTailorPrompt = storedTailorPrompt !== null;
  const tailorPromptDirty = tailorPromptDraft !== (storedTailorPrompt ?? "");

  if (!profile) return null;

  return (
    <div className="page roles-page">
      <header className="page-header roles-page-header" role="group">
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>{t("roles.back")}</button>
        <h1>{t("roles.title")}</h1>
      </header>

      <div className="roles-layout">
        <aside className="roles-sidebar">
          <ul>
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={selectedId === r.id ? "active" : ""}
                  onClick={() => loadRole(r.id)}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="new-role" role="group">
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder={t("roles.newRolePlaceholder")}
            />
            <button type="button" className="btn btn-secondary" onClick={createRole}>{t("roles.addRole")}</button>
          </div>
        </aside>

        <main className="roles-editor">
          {selectedId ? (
            <>
              <article>
                <header>
                  <h2>{t("roles.section.editRole")}</h2>
                </header>
                <label>
                  {t("roles.roleName")}
                  <div role="group">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <button type="button" className="btn btn-secondary" onClick={saveName} disabled={saving}>
                      {saving ? t("common.saving") : t("roles.saveName")}
                    </button>
                  </div>
                </label>
                <div className="ui-section-separator">
                  <button type="button" className="btn btn-danger" onClick={() => deleteRole(selectedId)}>
                    {t("roles.delete")}
                  </button>
                </div>
              </article>

              <article>
                <header>
                  <h2>{t("roles.section.tailorPrompt")}</h2>
                </header>
                <p className="hint">
                  {hasStoredTailorPrompt
                    ? t("roles.tailorPrompt.custom")
                    : t("roles.tailorPrompt.fallback")}
                </p>
                <p className="hint">{t("roles.tailorPrompt.hint")}</p>
                <div className="settings-prompt-block">
                  <textarea
                    rows={8}
                    value={tailorPromptDraft}
                    onChange={(e) => setTailorPromptDraft(e.target.value)}
                    placeholder={hasStoredTailorPrompt ? "" : t("roles.tailorPrompt.importBase")}
                  />
                  <div className="role-prompt-actions" role="group">
                    {!hasStoredTailorPrompt && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={importBaseTailorPrompt}
                        disabled={!settings || savingPrompt}
                      >
                        {t("roles.tailorPrompt.importBase")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={saveTailorPrompt}
                      disabled={!tailorPromptDirty || !tailorPromptDraft.trim() || savingPrompt}
                    >
                      {savingPrompt ? t("common.saving") : t("roles.tailorPrompt.save")}
                    </button>
                    {hasStoredTailorPrompt && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={deleteTailorPrompt}
                        disabled={savingPrompt}
                      >
                        {t("roles.tailorPrompt.delete")}
                      </button>
                    )}
                  </div>
                </div>
              </article>

              <RoleDocumentVersionsPanel roleId={selectedId} />
            </>
          ) : (
            <p className="empty-state">{t("roles.empty")}</p>
          )}
        </main>
      </div>
    </div>
  );
}
