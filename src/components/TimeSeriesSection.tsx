import { useState, useMemo, useRef, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { PillToggle } from './PillToggle';
import { ExportButton } from './ExportButton';
import { drawMultiCountryExport, CountrySeries } from '../utils/exportPanel';
import { loadImage } from '../utils/image';
import { SciJson, MarketJson } from '../types';
import { useDarkMode } from '../hooks/useDarkMode';
import { Search, X } from 'lucide-react';

interface TimeSeriesSectionProps {
  sciData: SciJson;
  marketData: MarketJson;
  selectedCountries: string[];
  onSelectedCountriesChange: (countries: string[]) => void;
}

export const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#6366f1'];

type RangeKey = '3Y' | '5Y' | '10Y' | 'ALL' | 'CUSTOM';
const RANGE_OPTIONS: RangeKey[] = ['3Y', '5Y', '10Y', 'ALL', 'CUSTOM'];

function getStartDateForRange(key: RangeKey): Date {
  const now = new Date();
  if (key === '3Y')  return new Date(now.getFullYear() - 3,  now.getMonth(), 1);
  if (key === '5Y')  return new Date(now.getFullYear() - 5,  now.getMonth(), 1);
  if (key === '10Y') return new Date(now.getFullYear() - 10, now.getMonth(), 1);
  return new Date('1970-01-01');
}

export function TimeSeriesSection({ sciData, marketData, selectedCountries, onSelectedCountriesChange }: TimeSeriesSectionProps) {
  const [metric, setMetric] = useState<'SCI' | 'Market-implied'>('SCI');
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>('ALL');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const { isDark } = useDarkMode();

  const availableCountries = Object.keys(sciData).sort();

  const hasMarketData = (country: string) =>
    !!marketData[country] && marketData[country].market_implied?.some(v => v !== null);

  const handleMetricChange = (newMetric: 'SCI' | 'Market-implied') => {
    setMetric(newMetric);
    if (newMetric === 'Market-implied') {
      onSelectedCountriesChange(selectedCountries.filter(c => hasMarketData(c)));
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const effectiveStart: Date = rangeKey === 'CUSTOM' && customStart
    ? new Date(customStart)
    : getStartDateForRange(rangeKey);

  const effectiveEnd: Date = rangeKey === 'CUSTOM' && customEnd
    ? new Date(customEnd)
    : new Date();

  const chartData = useMemo(() => {
    const sourceData = metric === 'SCI' ? sciData : marketData;
    if (!sourceData) return [];

    const allDates = new Set<string>();
    selectedCountries.forEach(c => {
      if (sourceData[c]) {
        sourceData[c].dates.forEach(d => allDates.add(d));
      }
    });

    return Array.from(allDates)
      .sort()
      .filter(dateStr => {
        const d = new Date(dateStr);
        return d >= effectiveStart && d <= effectiveEnd;
      })
      .map(date => {
        const row: Record<string, string | number | null> = { date };
        selectedCountries.forEach(c => {
          if (sourceData[c]) {
            const idx = sourceData[c].dates.indexOf(date);
            if (idx !== -1) {
              row[c] = metric === 'SCI'
                ? (sourceData[c] as any).sci[idx]
                : (sourceData[c] as any).market_implied[idx];
            }
          }
        });
        return row;
      });
  }, [sciData, marketData, metric, selectedCountries, effectiveStart, effectiveEnd]);

  const removeCountry = (country: string) => {
    onSelectedCountriesChange(selectedCountries.filter(c => c !== country));
  };

  const addCountry = (country: string) => {
    if (!selectedCountries.includes(country) && selectedCountries.length < 8) {
      onSelectedCountriesChange([...selectedCountries, country]);
    }
    setSearch('');
    setIsSearchOpen(false);
  };

  const filteredCountries = availableCountries.filter(c =>
    c.toLowerCase().includes(search.toLowerCase()) && !selectedCountries.includes(c)
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-[#16181c] p-3 border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {entry.value !== null ? entry.value.toFixed(1) : 'N/A'}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden"
      ref={containerRef}
    >
      {/* ── Header row ── */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PillToggle
            layoutId="series-mode-toggle"
            options={['SCI', 'Market-implied']}
            selected={metric}
            onChange={handleMetricChange}
          />
          <ExportButton 
            filename={`mm-sci-timeseries`}
            draw={async (canvas, w, h) => {
              const exportMetric = metric === 'SCI' ? 'sci' : 'market_implied';
              const title = exportMetric === 'sci' 
                ? 'World - MM Sovereign Credit Index' 
                : 'World - MM Market-Implied Sovereign Credit Index';

              const series: CountrySeries[] = selectedCountries.flatMap(country => {
                if (metric === 'SCI') {
                  const d = sciData[country];
                  if (!d) return [];
                  return [{ country, points: d.dates.map((date, i) => ({ date, value: d.sci[i] })) }];
                } else {
                  const d = marketData[country];
                  if (!d) return [];
                  return [{ country, points: d.dates.map((date, i) => ({ date, value: d.market_implied[i] })) }];
                }
              });

              const watermarkImg = await loadImage('/watermark.png').catch(() => null);
              await drawMultiCountryExport(canvas, series, title, w, h, watermarkImg);
            }}
          />
        </div>

        {/* ── Range selector ── */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-200 dark:border-[#2a2d35] overflow-hidden">
            {RANGE_OPTIONS.map(key => (
              <button
                key={key}
                onClick={() => setRangeKey(key)}
                className="relative px-3 py-1 text-xs font-medium transition-colors"
              >
                {rangeKey === key && (
                  <motion.div
                    layoutId="range-indicator"
                    className="absolute inset-0 bg-[#1d9e75]/20 border-x border-[#1d9e75]/40"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className={`relative z-10 transition-colors ${
                  rangeKey === key
                    ? 'text-[#1d9e75]'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                  {key}
                </span>
              </button>
            ))}
          </div>

          {/* Custom date inputs — slide in when CUSTOM is active */}
          <AnimatePresence>
            {rangeKey === 'CUSTOM' && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2"
              >
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-gray-50 dark:bg-[#1e2025] border border-gray-200 dark:border-[#2a2d35]
                             rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-200
                             focus:outline-none focus:border-[#1d9e75]/60"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-gray-50 dark:bg-[#1e2025] border border-gray-200 dark:border-[#2a2d35]
                             rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-200
                             focus:outline-none focus:border-[#1d9e75]/60"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Country chips ── */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-wrap items-center gap-2">
        {selectedCountries.map((country, i) => {
          const unavailable = metric === 'Market-implied' && !hasMarketData(country);
          return (
            <div
              key={country}
              title={unavailable ? 'No CDS data available' : undefined}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors ${
                unavailable
                  ? 'bg-transparent border-gray-100 dark:border-[#1e2025] text-gray-400 dark:text-gray-600'
                  : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-[#2a2d35] text-gray-900 dark:text-gray-100'
              }`}
            >
              {!unavailable && (
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
              )}
              <span>{country}</span>
              <button
                onClick={() => removeCountry(country)}
                className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {selectedCountries.length < 8 && (
          <div className="relative" ref={searchRef}>
            <div
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-dashed
                         border-gray-300 dark:border-gray-600 bg-transparent text-gray-500
                         dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 cursor-text"
              onClick={() => setIsSearchOpen(true)}
            >
              <Search size={12} />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setIsSearchOpen(true); }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Add country..."
                className="bg-transparent outline-none w-24 placeholder-gray-400 dark:placeholder-gray-600"
              />
            </div>

            {isSearchOpen && (
              <div className="absolute z-50 top-full left-0 mt-1 w-52 bg-white dark:bg-[#16181c]
                              border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-lg
                              max-h-52 overflow-y-auto p-1">
                {filteredCountries.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500 text-center">No matches</div>
                ) : (
                  filteredCountries.map(country => {
                    const unavailable = metric === 'Market-implied' && !hasMarketData(country);
                    return (
                      <button
                        key={country}
                        onClick={() => !unavailable && addCountry(country)}
                        disabled={unavailable}
                        title={unavailable ? 'No CDS data available' : undefined}
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors flex items-center justify-between ${
                          unavailable
                            ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a2d35] cursor-pointer'
                        }`}
                      >
                        <span>{country}</span>
                        {unavailable && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-1">
                            no CDS
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      <div className="p-4 h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke={isDark ? '#6b7280' : '#9ca3af'}
              tick={{ fill: isDark ? '#6b7280' : '#6b7280', fontSize: 12 }}
              tickMargin={10}
              minTickGap={40}
            />
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              stroke={isDark ? '#6b7280' : '#9ca3af'}
              tick={{ fill: isDark ? '#6b7280' : '#6b7280', fontSize: 12 }}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              stroke={isDark ? '#6b7280' : '#9ca3af'}
              tick={{ fill: isDark ? '#6b7280' : '#6b7280', fontSize: 10 }}
              ticks={[0, 10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]}
              tickFormatter={(val) => {
                const map: Record<number, string> = {
                  100: 'AAA', 95: 'AA+', 90: 'AA', 85: 'AA−', 80: 'A+',
                  75: 'A', 70: 'A−', 65: 'BBB+', 60: 'BBB', 55: 'BBB−',
                  50: 'BB+', 45: 'BB', 40: 'BB−', 35: 'B+', 30: 'B',
                  25: 'B−', 20: 'CCC+', 10: 'CCC−', 0: 'D',
                };
                return map[val] || '';
              }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={55}
              yAxisId="left"
              stroke={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}
              strokeDasharray="3 3"
              label={{
                position: 'insideTopRight',
                value: 'IG floor BBB−',
                fill: isDark ? '#6b7280' : '#9ca3af',
                fontSize: 10,
              }}
            />
            {selectedCountries.map((country, i) => (
              <Line
                key={country}
                yAxisId="left"
                type="monotone"
                dataKey={country}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={true}
                animationDuration={800}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}