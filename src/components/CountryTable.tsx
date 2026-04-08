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
  const isSci = metric === 'SCI (monthly)';

  const { countries, dates } = useMemo(() => {
    if (isSci) {
      const countries = Object.keys(sciData).sort();
      const allDates = new Set<string>();
      countries.forEach(c => sciData[c]?.dates.forEach(d => allDates.add(d)));
      const dates = Array.from(allDates).sort().slice(-15);
      return { countries, dates };
    } else {
      // Only include countries that actually have market data
      const countries = Object.keys(marketData).sort();
      const allDates = new Set<string>();
      countries.forEach(c => marketData[c]?.dates.forEach(d => allDates.add(d)));
      const dates = Array.from(allDates).sort().slice(-15);
      return { countries, dates };
    }
  }, [sciData, marketData, isSci]);

  const getValue = (country: string, date: string): number | null => {
    if (isSci) {
      const entry = sciData[country];
      if (!entry) return null;
      const idx = entry.dates.indexOf(date);
      return idx !== -1 ? (entry.sci[idx] ?? null) : null;
    } else {
      const entry = marketData[country];
      if (!entry) return null;
      const idx = entry.dates.indexOf(date);
      return idx !== -1 ? (entry.market_implied[idx] ?? null) : null;
    }
  };

  const formatDate = (date: string): string => {
    const d = new Date(date + 'T00:00:00');
    if (isSci) {
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            MM Sovereign Credit Index — All Countries
          </h2>
          <p className="text-xs text-gray-400 dark:text-[#6b7280] mt-0.5">
            {isSci
              ? `${countries.length} countries · monthly`
              : `${countries.length} countries with CDS data · weekly`}
          </p>
        </div>
        <PillToggle
          layoutId="table-metric-toggle"
          options={['SCI (monthly)', 'Market-implied (weekly)']}
          selected={metric}
          onChange={(v) => setMetric(v as 'SCI (monthly)' | 'Market-implied (weekly)')}
        />
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-gray-500 dark:text-[#6b7280] bg-gray-50 dark:bg-[#0e0f11] sticky top-0 z-20">
            <tr>
              <th className="px-4 py-3 font-medium sticky left-0 bg-gray-50 dark:bg-[#0e0f11] z-30 border-b border-r border-gray-200 dark:border-[#2a2d35] min-w-[160px]">
                Country
              </th>
              {dates.map(date => (
                <th
                  key={date}
                  className="px-2 py-3 font-medium text-center border-b border-gray-200 dark:border-[#2a2d35] min-w-[60px] whitespace-nowrap"
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
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-white dark:bg-[#16181c] z-10 border-r border-gray-100 dark:border-[#1e2025] whitespace-nowrap">
                  {country}
                </td>
                {dates.map(date => (
                  <td key={date} className="px-1 py-1 text-center">
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