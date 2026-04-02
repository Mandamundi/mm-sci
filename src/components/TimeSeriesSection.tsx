import { useState, useMemo, useRef, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PillToggle } from './PillToggle';
import { ExportButton } from './ExportButton';
import { SciJson, MarketJson } from '../types';
import { useDarkMode } from '../hooks/useDarkMode';
import { Search, X } from 'lucide-react';

interface TimeSeriesSectionProps {
  sciData: SciJson;
  marketData: MarketJson;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#6366f1'];

export function TimeSeriesSection({ sciData, marketData }: TimeSeriesSectionProps) {
  const [metric, setMetric] = useState<'SCI' | 'Market-implied'>('SCI');
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['United States', 'Germany', 'China', 'Brazil', 'India']);
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const { isDark } = useDarkMode();

  const availableCountries = Object.keys(sciData).sort();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const chartData = useMemo(() => {
    const sourceData = metric === 'SCI' ? sciData : marketData;
    if (!sourceData) return [];
    
    const allDates = new Set<string>();
    selectedCountries.forEach(c => {
      if (sourceData[c]) {
        sourceData[c].dates.forEach(d => allDates.add(d));
      }
    });
    
    const sortedDates = Array.from(allDates).sort();
    
    return sortedDates.map(date => {
      const row: any = { date };
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
  }, [sciData, marketData, metric, selectedCountries]);

  const removeCountry = (country: string) => {
    setSelectedCountries(prev => prev.filter(c => c !== country));
  };

  const addCountry = (country: string) => {
    if (!selectedCountries.includes(country) && selectedCountries.length < 8) {
      setSelectedCountries(prev => [...prev, country]);
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
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden" ref={containerRef}>
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">MM Sovereign Credit Index</h2>
        <div className="flex items-center gap-4">
          <PillToggle
            options={['SCI', 'Market-implied']}
            selected={metric}
            onChange={setMetric}
          />
          <ExportButton targetRef={containerRef} filename="mm-sci-timeseries" />
        </div>
      </div>
      
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-wrap items-center gap-2">
        {selectedCountries.map((country, i) => {
          const hasMarketData = !!marketData[country];
          const isDisabled = metric === 'Market-implied' && !hasMarketData;
          
          return (
            <div
              key={country}
              title={isDisabled ? "No CDS data available" : undefined}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${
                isDisabled
                  ? 'bg-transparent border-gray-100 dark:border-[#1e2025] text-gray-400 dark:text-gray-600'
                  : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-[#2a2d35] text-gray-900 dark:text-gray-100'
              }`}
            >
              {!isDisabled && (
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
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
            <div className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-dashed border-gray-300 dark:border-gray-600 bg-transparent text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 cursor-text" onClick={() => setIsSearchOpen(true)}>
              <Search size={12} />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Add country..."
                className="bg-transparent outline-none w-24 placeholder-gray-400 dark:placeholder-gray-600"
              />
            </div>
            
            {isSearchOpen && (
              <div className="absolute z-50 top-full left-0 mt-1 w-48 bg-white dark:bg-[#16181c] border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-lg max-h-48 overflow-y-auto custom-scrollbar p-1">
                {filteredCountries.map(country => (
                  <button
                    key={country}
                    onClick={() => addCountry(country)}
                    className="w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a2d35]"
                  >
                    {country}
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500 text-center">No matches</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke={isDark ? "#6b7280" : "#9ca3af"} 
              tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 12 }} 
              tickMargin={10}
              minTickGap={30}
            />
            <YAxis 
              yAxisId="left"
              domain={[0, 100]} 
              stroke={isDark ? "#6b7280" : "#9ca3af"} 
              tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 12 }}
              width={40}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              domain={[0, 100]} 
              stroke={isDark ? "#6b7280" : "#9ca3af"} 
              tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 10 }}
              ticks={[0, 10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]}
              tickFormatter={(val) => {
                const map: Record<number, string> = {
                  100: 'AAA', 95: 'AA+', 90: 'AA', 85: 'AA-', 80: 'A+', 75: 'A', 70: 'A-',
                  65: 'BBB+', 60: 'BBB', 55: 'BBB-', 50: 'BB+', 45: 'BB', 40: 'BB-',
                  35: 'B+', 30: 'B', 25: 'B-', 20: 'CCC+', 10: 'CCC-', 0: 'D'
                };
                return map[val] || '';
              }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={55} yAxisId="left" stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} strokeDasharray="3 3" label={{ position: 'insideTopRight', value: 'IG floor BBB-', fill: isDark ? '#6b7280' : '#9ca3af', fontSize: 10 }} />
            
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
                animationDuration={1000}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
