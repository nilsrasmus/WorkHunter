import { useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { TaxonomyCheckboxGroup, TaxonomyMultiSelect } from "./TaxonomyMultiSelect";
import { useMunicipalitiesForRegions, useTaxonomyOptions } from "../hooks/useTaxonomyOptions";
import { useI18n } from "../lib/i18n";
import type { SearchFilters } from "../types";

interface Props {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  onSearch: () => void;
  onSavePreset: (name: string) => void;
  presets: { id: number; name: string; filters_json: string }[];
  onLoadPreset: (filtersJson: string) => void;
  onDeletePreset: (id: number) => void;
  searching?: boolean;
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="filter-section"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <IconChevronRight size={16} className="filter-section-chevron" aria-hidden="true" />
        {title}
      </summary>
      <div className="filter-section-body">{children}</div>
    </details>
  );
}

function setStringArray(
  filters: SearchFilters,
  key: keyof SearchFilters,
  ids: string[],
) {
  return { ...filters, [key]: ids.length ? ids : undefined };
}

export function FilterPanel({
  filters,
  onChange,
  onSearch,
  onSavePreset,
  presets,
  onLoadPreset,
  onDeletePreset,
  searching,
}: Props) {
  const { t } = useI18n();
  const [presetName, setPresetName] = useState("");
  const taxonomy = useTaxonomyOptions();
  const regionIds = filters.region ?? [];
  const { municipalities, loading: municipalitiesLoading } =
    useMunicipalitiesForRegions(regionIds);

  const update = (patch: Partial<SearchFilters>) =>
    onChange({ ...filters, ...patch });

  const toggleQfield = (field: string) => {
    const current = filters.qfields ?? [];
    const next = current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field];
    update({ qfields: next.length ? next : undefined });
  };

  const sortOptions = [
    { value: "relevance", label: t("filter.sort.relevance") },
    { value: "pubdate-desc", label: t("filter.sort.newest") },
    { value: "pubdate-asc", label: t("filter.sort.oldest") },
    { value: "applydate-desc", label: t("filter.sort.applyNewest") },
    { value: "applydate-asc", label: t("filter.sort.applySoonest") },
    { value: "updated", label: t("filter.sort.updated") },
  ];

  const publishedPresets = [
    { value: "", label: t("filter.published.any") },
    { value: "60", label: t("filter.published.hour") },
    { value: "1440", label: t("filter.published.day") },
    { value: "10080", label: t("filter.published.week") },
  ];

  const qfieldOptions = [
    { value: "occupation", label: t("filter.qfield.occupation") },
    { value: "skill", label: t("filter.qfield.skill") },
    { value: "trait", label: t("filter.qfield.trait") },
    { value: "location", label: t("filter.qfield.location") },
    { value: "employer", label: t("filter.qfield.employer") },
  ];

  return (
    <div className="filter-panel">
      <Section title={t("filter.textSearch")} defaultOpen>
        <label>
          {t("filter.keywords")}
          <input
            value={filters.q ?? ""}
            onChange={(e) => update({ q: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearch();
              }
            }}
            placeholder={t("filter.keywords.placeholder")}
          />
        </label>
        <p className="hint">{t("filter.keywords.hint")}</p>
        <div className="taxonomy-checkbox-group">
          <span className="taxonomy-label">{t("filter.alsoSearchIn")}</span>
          <div className="taxonomy-checkboxes">
            {qfieldOptions.map((opt) => (
              <label key={opt.value} className="checkbox-label">
                <span className="taxonomy-option-check color--text-2">
                  <input
                    type="checkbox"
                    checked={(filters.qfields ?? []).includes(opt.value)}
                    onChange={() => toggleQfield(opt.value)}
                  />
                </span>
                <span className="taxonomy-option-label">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label>
          {t("filter.employer")}
          <input
            value={(filters.employer ?? []).join(", ")}
            onChange={(e) => {
              const v = e.target.value.trim();
              update({ employer: v ? [v] : undefined });
            }}
            placeholder={t("filter.employer")}
          />
        </label>
      </Section>

      <Section title={t("filter.timeSort")}>
        <label>
          {t("filter.published")}
          <select
            value={filters["published-after"] ?? ""}
            onChange={(e) =>
              update({ "published-after": e.target.value || undefined })
            }
          >
            {publishedPresets.map((p) => (
              <option key={p.label} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("filter.sort")}
          <select
            value={filters.sort ?? "pubdate-desc"}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("filter.resultsPerPage")}
          <input
            type="number"
            min={1}
            max={100}
            value={filters.limit ?? 20}
            onChange={(e) => update({ limit: Number(e.target.value) })}
          />
        </label>
      </Section>

      <Section title={t("filter.location")} defaultOpen>
        <TaxonomyMultiSelect
          label={t("filter.region")}
          options={taxonomy.regions}
          selectedIds={regionIds}
          onChange={(ids) => {
            onChange({
              ...filters,
              region: ids.length ? ids : undefined,
              municipality: undefined,
            });
          }}
          placeholder={t("filter.region.placeholder")}
          loading={taxonomy.loading}
        />
        <TaxonomyMultiSelect
          label={t("filter.municipality")}
          options={municipalities}
          selectedIds={filters.municipality ?? []}
          onChange={(ids) => onChange(setStringArray(filters, "municipality", ids))}
          placeholder={t("filter.municipality.placeholder")}
          loading={municipalitiesLoading}
          disabled={regionIds.length === 0}
          emptyHint={t("filter.municipality.hint")}
        />
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={!!filters.remote}
              onChange={(e) => update({ remote: e.target.checked || undefined })}
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.remote")}</span>
        </label>
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={!!filters["unspecified-sweden-workplace"]}
              onChange={(e) =>
                update({ "unspecified-sweden-workplace": e.target.checked || undefined })
              }
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.unspecifiedSweden")}</span>
        </label>
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={!!filters.abroad}
              onChange={(e) => update({ abroad: e.target.checked || undefined })}
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.abroad")}</span>
        </label>
      </Section>

      <Section title={t("filter.employment")}>
        <TaxonomyCheckboxGroup
          label={t("filter.employmentType")}
          options={taxonomy.employmentTypes}
          selectedIds={filters["employment-type"] ?? []}
          onChange={(ids) =>
            onChange(setStringArray(filters, "employment-type", ids))
          }
          loading={taxonomy.loading}
        />
        <TaxonomyCheckboxGroup
          label={t("filter.workingHours")}
          options={taxonomy.worktimeExtents}
          selectedIds={filters["worktime-extent"] ?? []}
          onChange={(ids) =>
            onChange(setStringArray(filters, "worktime-extent", ids))
          }
          loading={taxonomy.loading}
        />
        <TaxonomyCheckboxGroup
          label={t("filter.duration")}
          options={taxonomy.durations}
          selectedIds={filters.duration ?? []}
          onChange={(ids) => onChange(setStringArray(filters, "duration", ids))}
          loading={taxonomy.loading}
        />
        <label>
          Part-time min %
          <input
            type="number"
            value={filters["parttime.min"] ?? ""}
            onChange={(e) =>
              update({
                "parttime.min": e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
        <label>
          Part-time max %
          <input
            type="number"
            value={filters["parttime.max"] ?? ""}
            onChange={(e) =>
              update({
                "parttime.max": e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
      </Section>

      <Section title={t("filter.requirements")}>
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={filters.experience === false}
              onChange={(e) =>
                update({ experience: e.target.checked ? false : undefined })
              }
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.noExperience")}</span>
        </label>
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={!!filters["driving-license-required"]}
              onChange={(e) =>
                update({ "driving-license-required": e.target.checked || undefined })
              }
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.drivingLicense")}</span>
        </label>
      </Section>

      <Section title={t("filter.more")}>
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={!!filters.open_for_all}
              onChange={(e) => update({ open_for_all: e.target.checked || undefined })}
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.openForAll")}</span>
        </label>
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={!!filters.trainee}
              onChange={(e) => update({ trainee: e.target.checked || undefined })}
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.trainee")}</span>
        </label>
        <label className="checkbox-label">
          <span className="taxonomy-option-check color--text-2">
            <input
              type="checkbox"
              checked={!!filters.larling}
              onChange={(e) => update({ larling: e.target.checked || undefined })}
            />
          </span>
          <span className="taxonomy-option-label">{t("filter.larling")}</span>
        </label>
      </Section>

      <div className="filter-actions">
        <button type="button" className="btn btn-primary" onClick={onSearch} disabled={searching}>
          {searching ? t("common.searching") : t("common.search")}
        </button>
      </div>

      <div className="preset-section">
        <h4>{t("filter.presets")}</h4>
        <div className="preset-save" role="group">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={t("filter.presetName")}
          />
          <button type="button" className="btn btn-secondary"
            onClick={() => {
              if (presetName.trim()) {
                onSavePreset(presetName.trim());
                setPresetName("");
              }
            }}
          >
            {t("filter.presetSave")}
          </button>
        </div>
        <ul className="preset-list">
          {presets.map((p) => (
            <li key={p.id}>
              <button type="button" className="link-btn" onClick={() => onLoadPreset(p.filters_json)}>
                {p.name}
              </button>
              <button type="button" className="link-btn danger" onClick={() => onDeletePreset(p.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
