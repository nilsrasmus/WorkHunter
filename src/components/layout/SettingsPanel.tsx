import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { clearGeminiPromptCache } from "../../lib/ai";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../context/SessionContext";
import { ModelSelect } from "../ModelSelect";
import type { AiProvider, AppLanguage, AppTheme, ProfileSettings } from "../../types";
import { IconX } from '@tabler/icons-react'

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const { profile, settings, refreshSettings } = useSession();
  const { t } = useI18n();
  const [form, setForm] = useState<ProfileSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (settings) {
      setForm({
        ...settings,
        language: settings.language ?? "sv",
        theme: settings.theme ?? "light",
        applications_export_dir: settings.applications_export_dir ?? "",
      });
    }
  }, [settings, open]);

  if (!open || !profile || !form) return null;

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.saveSettings(profile.id, form);
      clearGeminiPromptCache();
      await refreshSettings();
      setMessage(t("settings.saved"));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetPrompt = async (key: string) => {
    const val = await api.resetPrompt(profile.id, key);
    clearGeminiPromptCache();
    setForm((f: ProfileSettings | null) => f && { ...f, [key]: val });
  };

  const clearTestData = async () => {
    if (!confirm(t("settings.clearData.confirm"))) return;
    setClearing(true);
    try {
      await api.clearWorkflowData(profile.id);
      setMessage(t("settings.clearData.done"));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("settings.title")}</h2>
          <button type="button" className="btn-icon" onClick={onClose}><IconX size={18}/></button>
        </div>

        <div className="modal-body settings-body">
          <section>
            <h3>{t("settings.language")}</h3>
            <label>
              {t("settings.language")}
              <select
                value={form.language ?? "sv"}
                onChange={(e) =>
                  setForm({ ...form, language: e.target.value as AppLanguage })
                }
              >
                <option value="sv">{t("settings.language.sv")}</option>
                <option value="en">{t("settings.language.en")}</option>
              </select>
            </label>
            <label>
              {t("settings.theme")}
              <select
                value={form.theme ?? "light"}
                onChange={(e) =>
                  setForm({ ...form, theme: e.target.value as AppTheme })
                }
              >
                <option value="light">{t("settings.theme.light")}</option>
                <option value="dark">{t("settings.theme.dark")}</option>
              </select>
            </label>
          </section>

          <section>
            <h3>{t("settings.aiApi")}</h3>
            <label>
              {t("settings.aiProvider")}
              <select
                value={form.ai_provider}
                onChange={(e) =>
                  setForm({ ...form, ai_provider: e.target.value as AiProvider })
                }
              >
                <option value="gemini">Google Gemini</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </label>
            {form.ai_provider === "anthropic" ? (
              <>
                <label>
                  {t("settings.anthropicKey")}{" "}
                  <input
                    type="password"
                    value={form.anthropic_api_key}
                    onChange={(e) =>
                      setForm({ ...form, anthropic_api_key: e.target.value })
                    }
                  />
                </label>
                <label>
                  {t("settings.model")}
                  <ModelSelect
                    provider="anthropic"
                    apiKey={form.anthropic_api_key}
                    value={form.anthropic_model}
                    onChange={(anthropic_model) =>
                      setForm({ ...form, anthropic_model })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  {t("settings.geminiKey")}{" "}
                  <input
                    type="password"
                    value={form.gemini_api_key}
                    onChange={(e) =>
                      setForm({ ...form, gemini_api_key: e.target.value })
                    }
                  />
                </label>
                <label>
                  {t("settings.model")}
                  <ModelSelect
                    provider="gemini"
                    apiKey={form.gemini_api_key}
                    value={form.gemini_model}
                    onChange={(gemini_model) => setForm({ ...form, gemini_model })}
                  />
                </label>
              </>
            )}
            <label>{t("settings.yourName")} <input value={form.your_name} onChange={(e) => setForm({ ...form, your_name: e.target.value })} /></label>
          </section>

          <section>
            <h3>{t("settings.promptTailor")}</h3>
            <p className="hint">{t("settings.promptTailorHint")}</p>
            <div className="settings-prompt-block">
              <textarea rows={8} value={form.prompt_tailor_docs} onChange={(e) => setForm({ ...form, prompt_tailor_docs: e.target.value })} />
              <button type="button" className="btn btn-secondary" onClick={() => resetPrompt("prompt_tailor_docs")}>{t("settings.resetDefault")}</button>
            </div>
          </section>

          <section>
            <h3>{t("settings.promptEmail")}</h3>
            <p className="hint">Placeholders: {"{{email_template}}"}, {"{{ad_json}}"}, {"{{company}}"}, {"{{contact_name}}"}, {"{{job_title}}"}</p>
            <div className="settings-prompt-block">
              <textarea rows={6} value={form.prompt_email_note} onChange={(e) => setForm({ ...form, prompt_email_note: e.target.value })} />
              <button type="button" className="btn btn-secondary" onClick={() => resetPrompt("prompt_email_note")}>{t("settings.resetDefault")}</button>
            </div>
          </section>

          <section>
            <h3>{t("settings.emailTemplate")}</h3>
            <p className="hint">Placeholders: {"{{company}}"}, {"{{contact_name}}"}, {"{{job_title}}"}, {"{{your_name}}"}</p>
            <div className="settings-prompt-block">
              <textarea rows={5} value={form.email_body_template} onChange={(e) => setForm({ ...form, email_body_template: e.target.value })} />
              <button type="button" className="btn btn-secondary" onClick={() => resetPrompt("email_body_template")}>{t("settings.resetDefault")}</button>
            </div>
          </section>

          <section>
            <h3>{t("settings.exportDir")}</h3>
            <p className="hint">{t("settings.exportDirHint")}</p>
            <label>
              {t("settings.exportDir")}
              <input
                value={form.applications_export_dir}
                onChange={(e) => setForm({ ...form, applications_export_dir: e.target.value })}
              />
            </label>
          </section>

          <section>
            <h3>{t("settings.testMode")}</h3>
            <label className="checkbox-label">
              <span className="taxonomy-option-check">
                <input type="checkbox" checked={form.test_mode} onChange={(e) => setForm({ ...form, test_mode: e.target.checked })} />
              </span>
              <span className="taxonomy-option-label">{t("settings.testModeLabel")}</span>
            </label>
            <label>{t("settings.testEmail")} <input type="email" value={form.test_email} onChange={(e) => setForm({ ...form, test_email: e.target.value })} /></label>
          </section>

          <section className="danger-zone">
            <h3>{t("settings.clearData.title")}</h3>
            <p>{t("settings.clearData.desc")}</p>
            <button type="button" className="btn btn-danger" onClick={clearTestData} disabled={clearing}>
              {clearing ? t("settings.clearData.clearing") : t("settings.clearData.button")}
            </button>
          </section>

          {message && <p className="status-msg">{message}</p>}
        </div>

        <div className="modal-footer" role="group">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? t("common.saving") : t("settings.save")}</button>
        </div>
      </div>
    </div>
  );
}
