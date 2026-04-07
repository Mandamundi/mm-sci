import { useState, useMemo } from 'react';
import { PillToggle } from './PillToggle';
import { ScoreCell } from './ScoreCell';
import { SciJson, MarketJson } from '../types';

interface CountryTableProps {
  sciData: SciJson;
  marketData: MarketJson;
  onSelectCountry: (country: string) => void;
}

export function CountryTable({ sciData, marketData, onSelectCountry }: CountryTableProps) {
  const [metric, setMetric] = useState<'SCI (monthly)' | 'Market-implied (weekly)'>('SCI (monthly)');

  const { countries, dates } = useMemo(() => {
    const isSci = metric === 'SCI (monthly)';

    // Always use the full SCI country list — sciData has all 116 countries.
    // When market-implied is selected, countries without CDS data just show nulls.
    const countries = Object.keys(sciData).sort();

    // Collect dates from the active source, but only from countries that
    // actually have data for the selected metric.
    const allDates = new Set<string>();

    if (isSci) {
      countries.forEach(c => {
        sciData[c]?.dates.forEach(d => allDates.add(d));
      });
    } else {
      // Only pull dates from marketData — these are the weekly dates.
      // Countries absent from marketData will just render null cells.
      Object.values(marketData).forEach(entry => {
        entry.dates.forEach(d => allDates.add(d));
      });
    }

    const sortedDates = Array.from(allDates).sort().slice(-15);
    return { countries, dates: sortedDates };
  }, [sciData, marketData, metric]);

  const getValue = (country: string, date: string): number | null => {
    if (metric === 'SCI (monthly)') {
      const entry = sciData[country];
      if (!entry) return null;
      const idx = entry.dates.indexOf(date);
      return idx !== -1 ? entry.sci[idx] : null;
    } else {
      // Country may not have market data — return null gracefully
      const entry = marketData[country];
      if (!entry) return null;
      const idx = entry.dates.indexOf(date);
      return idx !== -1 ? entry.market_implied[idx] : null;
    }
  };

  // Format column header depending on metric frequency
  const formatDate = (date: string): string => {
    if (metric === 'SCI (monthly)') {
      // e.g. "2024-03-31" → "Mar 24"
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else {
      // e.g. "2024-03-31" → "Mar 31"
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          MM Sovereign Credit Index — All Countries
        </h2>
        <PillToggle
          layoutId="table-metric-toggle"
          options={['SCI (monthly)', 'Market-implied (weekly)']}
          selected={metric}
          onChange={(v) => setMetric(v as 'SCI (monthly)' | 'Market-implied (weekly)')}
        />
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[420px] custom-scrollbar">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-gray-500 dark:text-[#6b7280] bg-gray-50 dark:bg-[#0e0f11] sticky top-0 z-20">
            <tr>
              <th className="px-4 py-3 font-medium sticky left-0 bg-gray-50 dark:bg-[#0e0f11] z-30 border-b border-r border-gray-200 dark:border-[#2a2d35]">
                Country
              </th>
              {dates.map(date => (
                <th
                  key={date}
                  className="px-2 py-3 font-medium text-center border-b border-gray-200 dark:border-[#2a2d35] min-w-[60px]"
                >
                  {formatDate(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countries.map(country => (
              <tr
                key={country}
                onClick={() => onSelectCountry(country)}
                className="border-b border-gray-100 dark:border-[#1e2025] hover:bg-gray-50 dark:hover:bg-[#1e2025] cursor-pointer transition-colors"
              >
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-white dark:bg-[#16181c] z-10 border-r border-gray-100 dark:border-[#1e2025]">
                  {country}
                </td>
                {dates.map(date => (
                  <td key={date} className="px-1 py-1">
                    <ScoreCell score={getValue(country, date)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}