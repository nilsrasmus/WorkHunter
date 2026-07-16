import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { TaxonomyOption } from "../components/TaxonomyMultiSelect";

function toOptions(
  items: { id: string; label: string }[],
): TaxonomyOption[] {
  return items.map((i) => ({ id: i.id, label: i.label }));
}

export function useTaxonomyOptions() {
  const [regions, setRegions] = useState<TaxonomyOption[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<TaxonomyOption[]>([]);
  const [worktimeExtents, setWorktimeExtents] = useState<TaxonomyOption[]>([]);
  const [durations, setDurations] = useState<TaxonomyOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [reg, emp, work, dur] = await Promise.all([
          api.taxonomySwedishRegions(),
          api.taxonomyListConcepts("employment-type"),
          api.taxonomyListConcepts("worktime-extent"),
          api.taxonomyListConcepts("employment-duration"),
        ]);
        if (cancelled) return;
        setRegions(toOptions(reg));
        setEmploymentTypes(toOptions(emp));
        setWorktimeExtents(toOptions(work));
        setDurations(toOptions(dur));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    regions,
    employmentTypes,
    worktimeExtents,
    durations,
    loading,
  };
}

export function useMunicipalitiesForRegions(regionIds: string[]) {
  const [municipalities, setMunicipalities] = useState<TaxonomyOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (regionIds.length === 0) {
      setMunicipalities([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.taxonomyMunicipalitiesForRegions(regionIds).then((items) => {
      if (!cancelled) {
        setMunicipalities(toOptions(items));
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setMunicipalities([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [regionIds.join(",")]);

  return { municipalities, loading };
}
