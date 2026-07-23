import { useCallback, useEffect, useRef, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import {
  listAnthropicModels,
  listGeminiModels,
  pickDefaultModel,
  type AiModelOption,
} from "../lib/ai-models";
import { useI18n } from "../lib/i18n";

interface Props {
  provider: "gemini" | "anthropic";
  apiKey: string;
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelect({ provider, apiKey, value, onChange }: Props) {
  const { t } = useI18n();
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    if (!apiKey.trim()) {
      setModels([]);
      setError(t("settings.model.enterKey"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const list =
        provider === "anthropic"
          ? await listAnthropicModels(apiKey)
          : await listGeminiModels(apiKey);
      setModels(list);
      if (list.length === 0) {
        setError(t("settings.model.noModels"));
        return;
      }
    } catch (e) {
      setModels([]);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [apiKey, provider, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (models.length === 0) return;
    const resolved = pickDefaultModel(models, value);
    if (resolved !== value) onChangeRef.current(resolved);
  }, [models, value]);

  return (
    <div className="model-select">
      <div className="model-select-row">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || models.length === 0}
        >
          {models.length === 0 ? (
            <option value={value}>{value || "No models loaded"}</option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-icon-square"
          onClick={() => void load()}
          disabled={loading || !apiKey.trim()}
          title={t("settings.model.refresh")}
          aria-label={t("settings.model.refresh")}
        >
          <IconRefresh size={16} className={loading ? "spin" : ""} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="hint error-hint">{error}</p>}
      {!error && models.length > 0 && (
        <p className="hint">{t("settings.model.available").replace("{count}", String(models.length))}</p>
      )}
    </div>
  );
}
