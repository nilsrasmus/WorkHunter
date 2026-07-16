import { useCallback, useEffect, useRef, useState } from "react";
import {
  listAnthropicModels,
  listGeminiModels,
  pickDefaultModel,
  type AiModelOption,
} from "../lib/ai-models";

interface Props {
  provider: "gemini" | "anthropic";
  apiKey: string;
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelect({ provider, apiKey, value, onChange }: Props) {
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    if (!apiKey.trim()) {
      setModels([]);
      setError("Enter an API key to load models.");
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
        setError("No models returned for this API key.");
        return;
      }
    } catch (e) {
      setModels([]);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [apiKey, provider]);

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
        <button type="button" className="btn btn-secondary"
          onClick={() => void load()}
          disabled={loading || !apiKey.trim()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p className="hint error-hint">{error}</p>}
      {!error && models.length > 0 && (
        <p className="hint">{models.length} models available</p>
      )}
    </div>
  );
}
