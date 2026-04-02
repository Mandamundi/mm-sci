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

  const { countries, dates, data } = useMemo(() => {
    const isSci = metric === 'SCI (monthly)';
    const sourceData = isSci ? sciData : marketData;
    
    const countries = Object.keys(sourceData).sort();
    
    // Get all unique dates and take the last 15
    const allDates = new Set<string>();
    countries.forEach(c => {
      sourceData[c].dates.forEach(d => allDates.add(d));
    });
    
    const sortedDates = Array.from(allDates).sort().slice(-15);
    
    return { countries, dates: sortedDates, data: sourceData };
  }, [sciData, marketData, metric]);

  return (
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">MM Sovereign Credit Index — All Countries</h2>
        <PillToggle
          options={['SCI (monthly)', 'Market-implied (weekly)']}
          selected={metric}
          onChange={setMetric}
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
                <th key={date} className="px-2 py-3 font-medium text-center border-b border-gray-200 dark:border-[#2a2d35] min-w-[60px]">
                  {date.substring(5)} {/* MM-DD */}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countries.map(country => {
              // Find flag from somewhere, or just use a generic one if not available.
              // We can pass a flag map or just use the name.
              // For now, we'll just show the name.
              return (
                <tr 
                  key={country} 
                  onClick={() => onSelectCountry(country)}
                  className="border-b border-gray-100 dark:border-[#1e2025] hover:bg-gray-50 dark:hover:bg-[#1e2025] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-white dark:bg-[#16181c] z-10 border-r border-gray-100 dark:border-[#1e2025] group-hover:bg-gray-50 dark:group-hover:bg-[#1e2025]">
                    {country}
                  </td>
                  {dates.map(date => {
                    const idx = data[country].dates.indexOf(date);
                    const val = idx !== -1 ? (metric === 'SCI (monthly)' ? (data[country] as any).sci[idx] : (data[country] as any).market_implied[idx]) : null;
                    return (
                      <td key={date} className="px-1 py-1">
                        <ScoreCell score={val} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
