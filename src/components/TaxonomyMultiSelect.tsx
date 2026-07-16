import { useEffect, useMemo, useState } from "react";

export interface TaxonomyOption {
  id: string;
  label: string;
}

interface Props {
  label: string;
  options: TaxonomyOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  emptyHint?: string;
}

export function TaxonomyMultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  placeholder = "Search…",
  loading,
  disabled,
  emptyHint,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 80);
  }, [options, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className={`taxonomy-multi-select${disabled ? " is-disabled" : ""}`}>
      <span className="taxonomy-label">{label}</span>
      {emptyHint && disabled && <p className="hint">{emptyHint}</p>}
      {selectedIds.length > 0 && (
        <div className="taxonomy-chips">
          {selectedIds.map((id) => {
            const text = options.find((o) => o.id === id)?.label ?? id;
            return (
              <span key={id} className="taxonomy-chip">
                {text}
                <button type="button" aria-label={`Remove ${text}`}
                  onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="taxonomy-combobox">
        <input
          value={query}
          placeholder={loading ? "…" : placeholder}
          disabled={loading || disabled}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!disabled) setOpen(true);
          }}
        />
        {open && !loading && !disabled && (
          <>
            <div className="taxonomy-backdrop" onClick={() => setOpen(false)} />
            <ul className="taxonomy-dropdown">
              {filtered.length === 0 && (
                <li className="taxonomy-empty">—</li>
              )}
              {filtered.map((opt) => (
                <li key={opt.id}>
                  <button type="button" className={selectedSet.has(opt.id) ? "selected" : ""}
                    onClick={() => toggle(opt.id)}
                  >
                    <span className="taxonomy-option-check">
                      <input
                        type="checkbox"
                        readOnly
                        checked={selectedSet.has(opt.id)}
                        tabIndex={-1}
                      />
                    </span>
                    <span className="taxonomy-option-label">{opt.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

interface CheckboxGroupProps {
  label: string;
  options: TaxonomyOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
}

export function TaxonomyCheckboxGroup({
  label,
  options,
  selectedIds,
  onChange,
  loading,
}: CheckboxGroupProps) {
  if (loading) {
    return (
      <div className="taxonomy-checkbox-group">
        <span className="taxonomy-label">{label}</span>
        <p className="hint">…</p>
      </div>
    );
  }

  return (
    <div className="taxonomy-checkbox-group">
      <span className="taxonomy-label">{label}</span>
      <div className="taxonomy-checkboxes">
        {options.map((opt) => {
          const checked = selectedIds.includes(opt.id);
          return (
            <label key={opt.id} className="checkbox-label">
              <span className="taxonomy-option-check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      onChange(selectedIds.filter((id) => id !== opt.id));
                    } else {
                      onChange([...selectedIds, opt.id]);
                    }
                  }}
                />
              </span>
              <span className="taxonomy-option-label">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
