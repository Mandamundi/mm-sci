import { useState, useMemo, useRef } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PillToggle } from './PillToggle';
import { CountrySelector } from './CountrySelector';
import { ExportButton } from './ExportButton';
import { SciJson, MarketJson } from '../types';
import { useDarkMode } from '../hooks/useDarkMode';

interface CountryDetailProps {
  sciData: SciJson;
  marketData: MarketJson;
  selectedCountry: string;
  onSelectCountry: (c: string) => void;
}

export function CountryDetail({ sciData, marketData, selectedCountry, onSelectCountry }: CountryDetailProps) {
  const [mode, setMode] = useState<'SCI only' | 'SCI vs market-implied'>('SCI only');
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDark } = useDarkMode();

  const hasMarketData = !!marketData[selectedCountry];

  // If we switch to a country without market data, force mode to SCI only
  if (!hasMarketData && mode === 'SCI vs market-implied') {
    setMode('SCI only');
  }

  const chartData = useMemo(() => {
    if (mode === 'SCI only') {
      const data = sciData[selectedCountry];
      if (!data) return [];
      return data.dates.map((date, i) => ({
        date,
        sci: data.sci[i],
        sp: data.sp[i],
        moodys: data.moodys[i],
        fitch: data.fitch[i],
      }));
    } else {
      // Merge SCI and Market data
      const sData = sciData[selectedCountry];
      const mData = marketData[selectedCountry];
      if (!sData || !mData) return [];
      
      // Use weekly dates from market data as the base
      return mData.dates.map((date, i) => {
        // Find closest SCI date
        const sciIdx = sData.dates.findIndex(d => d >= date);
        const sciVal = sciIdx !== -1 ? sData.sci[sciIdx] : null;
        
        return {
          date,
          sci: sciVal,
          market_implied: mData.market_implied[i],
          divergence: mData.divergence[i],
        };
      });
    }
  }, [sciData, marketData, selectedCountry, mode]);

  const allCountries = Object.keys(sciData).sort();

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

  const yAxisTicks = [0, 10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
  const yAxisFormatter = (val: number) => {
    const map: Record<number, string> = {
      100: 'AAA', 95: 'AA+', 90: 'AA', 85: 'AA-', 80: 'A+', 75: 'A', 70: 'A-',
      65: 'BBB+', 60: 'BBB', 55: 'BBB-', 50: 'BB+', 45: 'BB', 40: 'BB-',
      35: 'B+', 30: 'B', 25: 'B-', 20: 'CCC+', 10: 'CCC-', 0: 'D'
    };
    return map[val] || '';
  };

  return (
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden" ref={containerRef}>
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CountrySelector countries={allCountries} selected={selectedCountry} onChange={onSelectCountry} />
        </div>
        <div className="flex items-center gap-4">
          <PillToggle
            options={['SCI only', 'SCI vs market-implied']}
            selected={mode}
            onChange={setMode}
            disabled={!hasMarketData}
            disabledTooltip="No market-implied data available for this country"
          />
          <ExportButton targetRef={containerRef} filename={`${selectedCountry}-details`} />
        </div>
      </div>
      
      <div className="p-4 text-center">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">{selectedCountry} · MM Sovereign Credit Index</h3>
        <p className="text-xs text-gray-500 dark:text-[#6b7280]">
          {mode === 'SCI only' ? 'Agency lines & composite variants' : 'SCI vs Market-implied SCI'}
        </p>
      </div>

      <div className="px-4 pb-4 w-full flex flex-col gap-1" style={{ height: mode === 'SCI only' ? 400 : 500 }}>
        {mode === 'SCI only' ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} vertical={false} />
              <XAxis dataKey="date" stroke={isDark ? "#6b7280" : "#9ca3af"} tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 12 }} minTickGap={30} />
              <YAxis yAxisId="left" domain={[0, 100]} stroke={isDark ? "#6b7280" : "#9ca3af"} tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 12 }} width={40} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke={isDark ? "#6b7280" : "#9ca3af"} tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 10 }} ticks={yAxisTicks} tickFormatter={yAxisFormatter} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={55} yAxisId="left" stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} strokeDasharray="3 3" label={{ position: 'insideTopRight', value: 'IG floor BBB-', fill: isDark ? '#6b7280' : '#9ca3af', fontSize: 10 }} />
              
              <Line yAxisId="left" type="stepAfter" dataKey="sp" name="S&P" stroke="#a8c8e8" strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
              <Line yAxisId="left" type="stepAfter" dataKey="moodys" name="Moody's" stroke="#aed6a0" strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
              <Line yAxisId="left" type="stepAfter" dataKey="fitch" name="Fitch" stroke="#f5c78a" strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
              <Line yAxisId="left" type="monotone" dataKey="sci" name="SCI Composite" stroke="#e24b4a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <>
            <div style={{ flex: 3, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis yAxisId="left" domain={[0, 100]} stroke={isDark ? "#6b7280" : "#9ca3af"} tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 12 }} width={40} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke={isDark ? "#6b7280" : "#9ca3af"} tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 10 }} ticks={yAxisTicks} tickFormatter={yAxisFormatter} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={55} yAxisId="left" stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} strokeDasharray="3 3" />
                  
                  <Line yAxisId="left" type="monotone" dataKey="sci" name="SCI" stroke="#e24b4a" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="market_implied" name="Market-implied" stroke="#1d9e75" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} vertical={false} />
                  <XAxis dataKey="date" stroke={isDark ? "#6b7280" : "#9ca3af"} tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 12 }} minTickGap={30} />
                  <YAxis domain={[-30, 30]} stroke={isDark ? "#6b7280" : "#9ca3af"} tick={{ fill: isDark ? "#6b7280" : "#6b7280", fontSize: 12 }} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke={isDark ? "#6b7280" : "#9ca3af"} />
                  
                  <defs>
                    <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="50%" stopColor="#f4a460" stopOpacity={0.7} />
                      <stop offset="50%" stopColor="#90ee90" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="divergence" name="Divergence" stroke="none" fill="url(#splitColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
