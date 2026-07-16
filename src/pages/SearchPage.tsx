import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilterPanel } from "../components/FilterPanel";
import { JobCard } from "../components/JobCard";
import { ProceedModal } from "../components/ProceedModal";
import { api } from "../lib/api";
import { detectApplicationMethod } from "../lib/applicationMethod";
import { useSession } from "../context/SessionContext";
import { useI18n } from "../lib/i18n";
import type { JobAdHit, Role, SearchFilters, SearchPreset } from "../types";

export function SearchPage() {
  const { profile } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({ limit: 20, sort: "pubdate-desc" });
  const [hits, setHits] = useState<JobAdHit[]>([]);
  const [total, setTotal] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proceedHit, setProceedHit] = useState<JobAdHit | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [presets, setPresets] = useState<SearchPreset[]>([]);
  const [error, setError] = useState("");
  const [expandedHitId, setExpandedHitId] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    if (!profile) return;
    const list = await api.listRoles(profile.id);
    setRoles(list);
    if (list.length && !roleId) setRoleId(list[0].id);
  }, [profile, roleId]);

  const loadPresets = useCallback(async () => {
    if (!profile) return;
    const p = await api.listSearchPresets(profile.id, roleId ?? undefined);
    setPresets(p);
  }, [profile, roleId]);

  useEffect(() => { loadRoles(); }, [loadRoles]);
  useEffect(() => { loadPresets(); }, [loadPresets]);

  const search = async () => {
    if (!profile) return;
    setSearching(true);
    setError("");
    try {
      const [result, processed] = await Promise.all([
        api.jobsearchSearch(filters),
        api.getProcessedAdIds(profile.id),
      ]);
      const processedSet = new Set(processed);
      const rawHits = result.hits as JobAdHit[];
      const filtered = rawHits.filter((h) => !processedSet.has(h.id));
      setHits(filtered);
      setHiddenCount(rawHits.length - filtered.length);
      setTotal(result.total?.value ?? 0);
      setHasSearched(true);
      setExpandedHitId(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  };

  const handleProceed = (hit: JobAdHit) => {
    if (!profile || !roleId) return;
    setProceedHit(hit);
  };

  const confirmProceed = async (choices: {
    resumeVersionId: number;
    letterVersionId: number;
    tailorResume: boolean;
    tailorLetter: boolean;
  }) => {
    if (!profile || !roleId || !proceedHit) return;
    setProceeding(true);
    setBusyId(proceedHit.id);
    try {
      const fullAd = await api.jobsearchGetAd(proceedHit.id);
      const decision = await api.proceedAd(
        profile.id,
        roleId,
        JSON.stringify(fullAd),
        choices.resumeVersionId,
        choices.letterVersionId,
        choices.tailorResume,
        choices.tailorLetter,
      );
      setProceedHit(null);
      navigate(`/review/${decision.id}`);
    } catch (e) {
      alert(String(e));
    } finally {
      setProceeding(false);
      setBusyId(null);
    }
  };

  const handleReject = async (hit: JobAdHit) => {
    if (!profile || !roleId) return;
    setBusyId(hit.id);
    try {
      await api.rejectAd(profile.id, roleId, JSON.stringify(hit));
      setHits((h) => h.filter((x) => x.id !== hit.id));
      setHiddenCount((n) => n + 1);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (!profile) return null;

  return (
    <div className="page search-page">
      <div className="search-header">
        <label>
          {t("search.role")}
          <select value={roleId ?? ""} onChange={(e) => setRoleId(Number(e.target.value))}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        {hasSearched && total > 0 && (
          <span className="result-count">
            {hits.length} {t("search.results.new")}
            {hiddenCount > 0 && ` · ${hiddenCount} ${t("search.results.handled")}`}
            {` · ${total} ${t("search.results.total")}`}
          </span>
        )}
      </div>

      <div className="search-layout">
        <aside>
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onSearch={search}
            searching={searching}
            presets={presets}
            onSavePreset={async (name) => {
              if (!profile) return;
              await api.saveSearchPreset(profile.id, roleId, name, JSON.stringify(filters));
              loadPresets();
            }}
            onLoadPreset={(json) => setFilters(JSON.parse(json))}
            onDeletePreset={async (id) => {
              await api.deleteSearchPreset(id);
              loadPresets();
            }}
          />
        </aside>
        <main className="search-results">
          {error && <p className="error-msg">{error}</p>}
          {hits.length === 0 && !searching && hasSearched && (
            <p className="empty-state">
              {hiddenCount > 0
                ? t("search.empty.handled")
                : t("search.empty.none")}
            </p>
          )}
          {hits.length === 0 && !searching && !hasSearched && (
            <p className="empty-state">{t("search.empty.prompt")}</p>
          )}
          {hits.map((hit) => (
            <JobCard
              key={hit.id}
              hit={hit}
              expanded={expandedHitId === hit.id}
              onToggle={() =>
                setExpandedHitId((current) => (current === hit.id ? null : hit.id))
              }
              onProceed={() => handleProceed(hit)}
              onReject={() => handleReject(hit)}
              busy={busyId === hit.id}
            />
          ))}
        </main>
      </div>

      {proceedHit && roleId && (
        <ProceedModal
          open
          roleId={roleId}
          jobTitle={proceedHit.headline}
          applicationMethod={detectApplicationMethod(proceedHit as unknown as Record<string, unknown>)}
          loading={proceeding}
          onConfirm={confirmProceed}
          onCancel={() => !proceeding && setProceedHit(null)}
        />
      )}
    </div>
  );
}
