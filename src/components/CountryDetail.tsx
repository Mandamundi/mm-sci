import { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
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

export function CountryDetail({
  sciData,
  marketData,
  selectedCountry,
  onSelectCountry,
}: CountryDetailProps) {
  const [mode, setMode] = useState<'SCI only' | 'SCI vs market-implied'>('SCI only');
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDark } = useDarkMode();

  const hasMarketData = (country: string): boolean =>
    !!marketData[country] &&
    marketData[country].market_implied.some(v => v !== null);

  // When the selected country changes, fall back to SCI only if the new
  // country has no market data. useEffect avoids calling setState during render.
  useEffect(() => {
    if (mode === 'SCI vs market-implied' && !hasMarketData(selectedCountry)) {
      setMode('SCI only');
    }
  }, [selectedCountry]);

  const chartData = useMemo(() => {
    if (mode === 'SCI only') {
      const d = sciData[selectedCountry];
      if (!d) return [];
      return d.dates.map((date, i) => ({
        date,
        sci:    d.sci[i],
        sp:     d.sp[i],
        moodys: d.moodys[i],
        fitch:  d.fitch[i],
      }));
    }

    // SCI vs market-implied: use weekly market dates as spine,
    // carry the SCI value from the most recent monthly observation.
    const sd = sciData[selectedCountry];
    const md = marketData[selectedCountry];
    if (!sd || !md) return [];

    return md.dates.map((date, i) => {
      // Walk backwards through monthly SCI dates to find the latest
      // month-end that is <= the current weekly date.
      let sciVal: number | null = null;
      for (let j = sd.dates.length - 1; j >= 0; j--) {
        if (sd.dates[j] <= date) {
          sciVal = sd.sci[j];
          break;
        }
      }
      return {
        date,
        sci:            sciVal,
        market_implied: md.market_implied[i],
        divergence:     md.divergence[i],
      };
    });
  }, [sciData, marketData, selectedCountry, mode]);

  const allCountries = Object.keys(sciData).sort();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-[#16181c] p-3 border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-lg">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {entry.value != null ? entry.value.toFixed(1) : 'N/A'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const yAxisTicks = [0, 10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
  const yAxisFormatter = (val: number) => {
    const map: Record<number, string> = {
      100: 'AAA', 95: 'AA+', 90: 'AA',  85: 'AA-', 80: 'A+',
      75:  'A',   70: 'A-',  65: 'BBB+', 60: 'BBB', 55: 'BBB-',
      50:  'BB+', 45: 'BB',  40: 'BB-',  35: 'B+',  30: 'B',
      25:  'B-',  20: 'CCC+',10: 'CCC-',  0: 'D',
    };
    return map[val] ?? '';
  };

  const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const axisColor  = isDark ? '#6b7280' : '#9ca3af';
  const floorColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';

  const sharedYAxes = (
    <>
      <YAxis
        yAxisId="left"
        domain={[0, 100]}
        stroke={axisColor}
        tick={{ fill: axisColor, fontSize: 12 }}
        width={40}
      />
      <YAxis
        yAxisId="right"
        orientation="right"
        domain={[0, 100]}
        stroke={axisColor}
        tick={{ fill: axisColor, fontSize: 10 }}
        ticks={yAxisTicks}
        tickFormatter={yAxisFormatter}
        width={42}
      />
    </>
  );

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CountrySelector
            countries={allCountries}
            selected={selectedCountry}
            onChange={onSelectCountry}
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <PillToggle
              layoutId="detail-mode-toggle"
              options={['SCI only', 'SCI vs market-implied']}
              selected={mode}
              onChange={(v) => setMode(v as 'SCI only' | 'SCI vs market-implied')}
              disabledOptions={hasMarketData(selectedCountry) ? [] : ['SCI vs market-implied']}
            />
          </div>
          {!hasMarketData(selectedCountry) && (
            <span className="text-xs text-gray-500 dark:text-[#6b7280]">
              No market-implied data available
            </span>
          )}
          <ExportButton
            targetRef={containerRef}
            filename={`${selectedCountry.toLowerCase().replace(/\s+/g, '-')}-sci`}
          />
        </div>
      </div>

      {/* Chart title */}
      <div className="px-4 pt-4 pb-1">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          {selectedCountry} · MM Sovereign Credit Index
        </h3>
        <p className="text-xs text-gray-500 dark:text-[#6b7280] mt-0.5">
          {mode === 'SCI only'
            ? 'Agency lines & composite'
            : 'SCI vs Market-implied SCI'}
        </p>
      </div>

      {/* Charts */}
      <div
        className="px-4 pb-4 w-full flex flex-col gap-0"
        style={{ height: mode === 'SCI only' ? 400 : 520 }}
      >
        {mode === 'SCI only' ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="date"
                stroke={axisColor}
                tick={{ fill: axisColor, fontSize: 11 }}
                minTickGap={40}
              />
              {sharedYAxes}
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={55}
                yAxisId="left"
                stroke={floorColor}
                strokeDasharray="4 3"
                label={{
                  position: 'insideTopRight',
                  value: 'IG floor  BBB−',
                  fill: axisColor,
                  fontSize: 10,
                }}
              />
              <Line yAxisId="left" type="stepAfter" dataKey="sp"     name="S&P"     stroke="#a8c8e8" strokeWidth={1.5} dot={false} strokeOpacity={0.65} connectNulls />
              <Line yAxisId="left" type="stepAfter" dataKey="moodys" name="Moody's" stroke="#aed6a0" strokeWidth={1.5} dot={false} strokeOpacity={0.65} connectNulls />
              <Line yAxisId="left" type="stepAfter" dataKey="fitch"  name="Fitch"   stroke="#f5c78a" strokeWidth={1.5} dot={false} strokeOpacity={0.65} connectNulls />
              <Line yAxisId="left" type="monotone"  dataKey="sci"    name="SCI Composite" stroke="#e24b4a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <>
            {/* Top panel — SCI vs market-implied */}
            <div style={{ flex: 3, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="date" hide />
                  {sharedYAxes}
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={55}
                    yAxisId="left"
                    stroke={floorColor}
                    strokeDasharray="4 3"
                    label={{
                      position: 'insideTopRight',
                      value: 'IG floor  BBB−',
                      fill: axisColor,
                      fontSize: 10,
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="sci"
                    name="SCI"
                    stroke="#e24b4a"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="market_implied"
                    name="Market-implied"
                    stroke="#1d9e75"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Bottom panel — divergence */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 50, left: 0, bottom: 0 }}>
                  <defs>
                    {/* Two separate areas so Recharts can colour pos/neg independently */}
                    <linearGradient id="divPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f4a460" stopOpacity={0.75} />
                      <stop offset="100%" stopColor="#f4a460" stopOpacity={0.15} />
                    </linearGradient>
                    <linearGradient id="divNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#90ee90" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#90ee90" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke={axisColor}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    minTickGap={40}
                  />
                  <YAxis
                    domain={[-30, 30]}
                    stroke={axisColor}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke={axisColor} strokeOpacity={0.4} />
                  {/* Positive divergence (agencies more optimistic — orange) */}
                  <Area
                    type="monotone"
                    dataKey={(d) => (d.divergence != null && d.divergence > 0 ? d.divergence : 0)}
                    name="Agencies ahead"
                    stroke="#f4a460"
                    strokeWidth={0}
                    fill="url(#divPos)"
                    isAnimationActive={false}
                  />
                  {/* Negative divergence (market more optimistic — green) */}
                  <Area
                    type="monotone"
                    dataKey={(d) => (d.divergence != null && d.divergence < 0 ? d.divergence : 0)}
                    name="Market ahead"
                    stroke="#90ee90"
                    strokeWidth={0}
                    fill="url(#divNeg)"
                    isAnimationActive={false}
                  />
                  {/* Thin line over the top for definition */}
                  <Area
                    type="monotone"
                    dataKey="divergence"
                    name="Divergence"
                    stroke={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}
                    strokeWidth={0.8}
                    fill="transparent"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}