import { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { PillToggle } from './PillToggle';
import { CountrySelector } from './CountrySelector';
import { ExportButton } from './ExportButton';
import { drawCountryDetailExport, DetailMode } from '../utils/exportPanel';
import { loadImage } from '../utils/image';
import { SciJson, MarketJson } from '../types';
import { useDarkMode } from '../hooks/useDarkMode';

// ── Score → letter rating lookup ──────────────────────────────────────────────
// Maps the numeric base score (0–100) back to the canonical letter rating
// for display in the tooltip. Agency lines carry base scores (no outlook adj).
const SCORE_TO_RATING: Record<number, string> = {
  100: 'AAA', 95: 'AA+',  90: 'AA',   85: 'AA-',
  80:  'A+',  75: 'A',    70: 'A-',
  65:  'BBB+',60: 'BBB',  55: 'BBB-',
  50:  'BB+', 45: 'BB',   40: 'BB-',
  35:  'B+',  30: 'B',    25: 'B-',
  20:  'CCC+',15: 'CCC',  10: 'CCC-',
  5:   'CC',  2:  'C',    0:  'D',
};

function scoreToRating(score: number | null): string {
  if (score == null) return 'N/A';
  const keys = Object.keys(SCORE_TO_RATING).map(Number);
  const closest = keys.reduce((a, b) =>
    Math.abs(b - score) < Math.abs(a - score) ? b : a
  );
  return SCORE_TO_RATING[closest] ?? score.toFixed(1);
}

// ── Y-axis tick configuration ─────────────────────────────────────────────────
const Y_TICKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

const Y_LABELS: Record<number, string> = {
  100: 'AAA', 95: 'AA+',  90: 'AA',   85: 'AA-',
  80:  'A+',  75: 'A',    70: 'A-',
  65:  'BBB+',60: 'BBB',  55: 'BBB-',
  50:  'BB+', 45: 'BB',   40: 'BB-',
  35:  'B+',  30: 'B',    25: 'B-',
  20:  'CCC+',10: 'CCC-',  0: 'D',
};

// ── Agency line style constants ───────────────────────────────────────────────
const AGENCY_LINES = [
  { key: 'sp',     label: "S&P",     color: '#a8c8e8' },
  { key: 'moodys', label: "Moody's", color: '#aed6a0' },
  { key: 'fitch',  label: 'Fitch',   color: '#f5c78a' },
] as const;

const AGENCY_KEYS = new Set(['sp', 'moodys', 'fitch']);

// ── Props ─────────────────────────────────────────────────────────────────────
interface CountryDetailProps {
  sciData: SciJson;
  marketData: MarketJson;
  selectedCountry: string;
  onSelectCountry: (c: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (mode === 'SCI vs market-implied' && !hasMarketData(selectedCountry)) {
      setMode('SCI only');
    }
  }, [selectedCountry]);

  // ── Chart data ──────────────────────────────────────────────────────────────
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

    const sd = sciData[selectedCountry];
    const md = marketData[selectedCountry];
    if (!sd || !md) return [];

    return md.dates.map((date, i) => {
      let sciVal: number | null = null;
      for (let j = sd.dates.length - 1; j >= 0; j--) {
        if (sd.dates[j] <= date) { sciVal = sd.sci[j]; break; }
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

  // ── Shared style tokens ─────────────────────────────────────────────────────
  const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const axisColor  = isDark ? '#6b7280' : '#9ca3af';
  const floorColor = isDark ? 'rgba(255,255,255,0.2)'  : 'rgba(0,0,0,0.2)';

  // ── Custom tooltip ──────────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const entries = (payload as any[]).filter(
      (e: any) => e.value != null
    );

    return (
      <div className="bg-white dark:bg-[#16181c] p-3 border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-lg min-w-[160px]">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{label}</p>
        {entries.map((entry: any, i: number) => {
          const isAgency = AGENCY_KEYS.has(entry.dataKey);
          const display  = isAgency
            ? scoreToRating(entry.value)
            : entry.value != null
              ? entry.value.toFixed(1)
              : 'N/A';

          return (
            <div key={i} className="flex items-center justify-between gap-4 text-xs py-0.5">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-500 dark:text-gray-400">{entry.name}</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                {display}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Shared Y-axes ───────────────────────────────────────────────────────────
  const sharedYAxes = (
    <>
      <YAxis
        yAxisId="left"
        domain={[0, 100]}
        ticks={[0, 20, 40, 55, 60, 80, 100]}
        stroke={axisColor}
        tick={{ fill: axisColor, fontSize: 11 }}
        width={32}
      />
      <YAxis
        yAxisId="right"
        orientation="right"
        domain={[0, 100]}
        ticks={Y_TICKS}
        tickFormatter={(v: number) => Y_LABELS[v] ?? ''}
        stroke={axisColor}
        tick={{ fill: axisColor, fontSize: 10 }}
        width={46}
      />
    </>
  );

  // ── Legends ─────────────────────────────────────────────────────────────────
  const SciLegend = () => (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 pb-2 pt-1">
      {AGENCY_LINES.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="22" y2="5" stroke={color} strokeWidth="2" strokeOpacity="0.75" />
          </svg>
          <span className="text-xs text-gray-500 dark:text-[#6b7280]">{label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true">
          <line x1="0" y1="5" x2="22" y2="5" stroke="#e24b4a" strokeWidth="2.5" />
        </svg>
        <span className="text-xs text-gray-500 dark:text-[#6b7280]">SCI composite</span>
      </div>
    </div>
  );

  const MarketLegend = () => (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 pb-2 pt-1">
      <div className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true">
          <line x1="0" y1="5" x2="22" y2="5" stroke="#e24b4a" strokeWidth="2" strokeDasharray="5 4" />
        </svg>
        <span className="text-xs text-gray-500 dark:text-[#6b7280]">SCI (agency composite)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true">
          <line x1="0" y1="5" x2="22" y2="5" stroke="#1d9e75" strokeWidth="2.5" />
        </svg>
        <span className="text-xs text-gray-500 dark:text-[#6b7280]">Market-implied SCI</span>
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="14" height="10" aria-hidden="true">
          <rect x="0" y="1" width="14" height="8" fill="#f4a460" fillOpacity="0.6" rx="1" />
        </svg>
        <span className="text-xs text-gray-500 dark:text-[#6b7280]">Agencies more optimistic</span>
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="14" height="10" aria-hidden="true">
          <rect x="0" y="1" width="14" height="8" fill="#90ee90" fillOpacity="0.6" rx="1" />
        </svg>
        <span className="text-xs text-gray-500 dark:text-[#6b7280]">Market more optimistic</span>
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <CountrySelector
          countries={allCountries}
          selected={selectedCountry}
          onChange={onSelectCountry}
        />
        <div className="flex items-center gap-4">
          <PillToggle
            layoutId="detail-mode-toggle"
            options={['SCI only', 'SCI vs market-implied']}
            selected={mode}
            onChange={(v) => setMode(v as 'SCI only' | 'SCI vs market-implied')}
            disabledOptions={hasMarketData(selectedCountry) ? [] : ['SCI vs market-implied']}
          />
          {!hasMarketData(selectedCountry) && (
            <span className="text-xs text-gray-500 dark:text-[#6b7280]">
              No market-implied data available
            </span>
          )}
          <ExportButton
            filename={`${selectedCountry.toLowerCase().replace(/\s+/g, '-')}-sci`}
            draw={async (canvas, w, h) => {
              const sciSeries = sciData[selectedCountry] ?? null;
              const miSeries = marketData[selectedCountry] ?? null;
              
              if (!sciSeries) return;

              const detailMode: DetailMode = mode === 'SCI only' ? 'sci_only' : 'vs_market';
              const title = detailMode === 'sci_only' 
                ? `${selectedCountry} - MM Sovereign Credit Index`
                : `${selectedCountry} - MM SCI vs. Market-Implied SCI`;

              const watermarkImg = await loadImage('/watermark.png').catch(() => null);
                      
              await drawCountryDetailExport(
                canvas,
                sciSeries as any, 
                detailMode === 'vs_market' ? (miSeries as any) : null,
                detailMode,
                title,
                w, h,
                watermarkImg
              );
            }}
          />
        </div>
      </div>

      {/* Chart title */}
      <div className="px-4 pt-4 pb-0">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          {selectedCountry} · MM Sovereign Credit Index
        </h3>
        <p className="text-xs text-gray-500 dark:text-[#6b7280] mt-0.5">
          {mode === 'SCI only'
            ? 'Agency lines & SCI composite (Weighted + Outlook)'
            : 'SCI composite vs market-implied SCI (panel FE on log CDS)'}
        </p>
      </div>

      {/* Legend — swaps with mode */}
      {mode === 'SCI only' ? <SciLegend /> : <MarketLegend />}

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
                minTickGap={50}
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
              {AGENCY_LINES.map(({ key, label, color }) => (
                <Line
                  key={key}
                  yAxisId="left"
                  type="stepAfter"
                  dataKey={key}
                  name={label}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                  dot={false}
                  connectNulls
                />
              ))}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="sci"
                name="SCI composite"
                stroke="#e24b4a"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <>
            {/* Top panel */}
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
                    <linearGradient id="divPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#f4a460" stopOpacity={0.75} />
                      <stop offset="100%" stopColor="#f4a460" stopOpacity={0.15} />
                    </linearGradient>
                    <linearGradient id="divNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#90ee90" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#90ee90" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke={axisColor}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    minTickGap={50}
                  />
                  <YAxis
                    domain={[-30, 30]}
                    stroke={axisColor}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    width={32}
                    ticks={[-30, -20, -10, 0, 10, 20, 30]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke={axisColor} strokeOpacity={0.4} />
                  <Area
                    type="monotone"
                    dataKey={(d: any) =>
                      d.divergence != null && d.divergence > 0 ? d.divergence : 0
                    }
                    name="Agencies ahead"
                    stroke="#f4a460"
                    strokeWidth={0}
                    fill="url(#divPos)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey={(d: any) =>
                      d.divergence != null && d.divergence < 0 ? d.divergence : 0
                    }
                    name="Market ahead"
                    stroke="#90ee90"
                    strokeWidth={0}
                    fill="url(#divNeg)"
                    isAnimationActive={false}
                  />
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