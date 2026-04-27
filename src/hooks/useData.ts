import { useState, useEffect } from 'react';
import { SciJson, MarketJson, SnapshotJson, RatingsJson, HierarchyJson, MetaJson, CdsSnapshotJson, DebtJson } from '../types';

export function useData() {
  const [data, setData] = useState<{
    sci: SciJson | null;
    market: MarketJson | null;
    snapshot: SnapshotJson | null;
    ratings: RatingsJson | null;
    hierarchy: HierarchyJson | null;
    meta: MetaJson | null;
    cdsSnapshot: CdsSnapshotJson | null;
    debt: DebtJson | null;
  }>({
    sci: null,
    market: null,
    snapshot: null,
    ratings: null,
    hierarchy: null,
    meta: null,
    cdsSnapshot: null,
    debt: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [sciRes, marketRes, snapshotRes, ratingsRes, hierarchyRes, metaRes, cdsRes, debtRes] = await Promise.all([
          fetch('/data/sci.json'),
          fetch('/data/market.json'),
          fetch('/data/snapshot.json'),
          fetch('/data/ratings.json'),
          fetch('/data/hierarchy.json'),
          fetch('/data/meta.json'),
          fetch('/data/cds_snapshot.json'),
          fetch('/data/debt.json'),
        ]);

        const [sci, market, snapshot, ratings, hierarchy, meta, cdsSnapshot, debt] = await Promise.all([
          sciRes.json(),
          marketRes.json(),
          snapshotRes.json(),
          ratingsRes.json(),
          hierarchyRes.json(),
          metaRes.json(),
          cdsRes.json(),
          debtRes.json(),
        ]);

        setData({ sci, market, snapshot, ratings, hierarchy, meta, cdsSnapshot, debt });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch data'));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { ...data, loading, error };
}
