import { useState, useRef, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { PillToggle } from './PillToggle';
import { SnapshotJson } from '../types';
import { getScoreColor } from '../utils/scoreColor';
import { useDarkMode } from '../hooks/useDarkMode';
import { Plus, Minus } from 'lucide-react';
import { loadImage } from '../utils/image';
import {
  ExportButton, drawMapExport,
  ExportMetric, scoreToMapColor,
  spreadToMapColor,
} from '../utils/exportPanel';

const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

interface MapSectionProps {
  snapshot: SnapshotJson;
}

type Metric = 'SCI' | 'Market-implied SCI' | 'Spread';

// world-atlas name → our compute_index.py country name (Title Case)
const GEO_NAME_MAP: Record<string, string> = {
  "United States of America": "United States",
  "United States":            "United States",
  "South Korea":              "South Korea",
  "Korea":                    "South Korea",
  "Republic of Korea":        "South Korea",
  "Czechia":                  "Czechia",
  "Czech Republic":           "Czechia",
  "Ivory Coast":              "Ivory Coast",
  "Côte d'Ivoire":            "Ivory Coast",
  "Congo":                    "Republic Of The Congo",
  "Republic of the Congo":    "Republic Of The Congo",
  "Dominican Rep.":           "Dominican Republic",
  "Dominican Republic":       "Dominican Republic",
  "United Kingdom":           "United Kingdom",
  "United Arab Emirates":     "United Arab Emirates",
  "Saudi Arabia":             "Saudi Arabia",
  "Hong Kong":                "Hong Kong",
  "New Zealand":              "New Zealand",
  "Papua New Guinea":         "Papua New Guinea",
  "South Africa":             "South Africa",
  "El Salvador":              "El Salvador",
  "Costa Rica":               "Costa Rica",
  "Sri Lanka":                "Sri Lanka",
};

const MAP_TITLES: Record<ExportMetric, string> = {
  sci:            'World - MM Sovereign Credit Index',
  market_implied: 'World - MM Market-Implied Sovereign Credit Index',
  spread:         'World - MM Sovereign Credit Index Spread',
};

function getSpreadColor(val: number, isDark: boolean): string {
  // Positive = agencies ahead of market (stress) → warm
  // Negative = market ahead of agencies (upgrade) → cool green
  if (val > 15)  return isDark ? '#7f1d1d' : '#b91c1c'; // Deep Red
  if (val > 8)   return isDark ? '#993c1d' : '#ea580c'; // Burnt Orange
  if (val > 3)   return isDark ? '#ba7517' : '#d97706'; // Amber
  if (val > -3)  return isDark ? '#355486' : '#80a8e4'; // Muted Gray Neutral
  if (val > -8)  return isDark ? '#065f46' : '#10b981'; // Mint/Emerald
  if (val > -15) return isDark ? '#064e3b' : '#059669'; // Emerald
  return isDark ? '#022c22' : '#047857';                // Deep Forest Green
}

const SCI_LEGEND_ITEMS =[
  { label: 'D',   colorDark: '#7f1d1d', colorLight: '#b91c1c' },
  { label: 'CCC', colorDark: '#991b1b', colorLight: '#dc2626' },
  { label: 'B',   colorDark: '#993c1d', colorLight: '#ea580c' },
  { label: 'BB',  colorDark: '#854f0b', colorLight: '#d97706' },
  { label: 'BBB', colorDark: '#ba7517', colorLight: '#ca8a04' },
  { label: 'A',   colorDark: '#1d9e75', colorLight: '#65a30d' },
  { label: 'AA',  colorDark: '#0f6e56', colorLight: '#16a34a' },
  { label: 'AAA', colorDark: '#085041', colorLight: '#15803d' },
];

const SPREAD_LEGEND_ITEMS =[
  { label: '+15+', colorDark: '#7f1d1d', colorLight: '#b91c1c' },
  { label: '+8',   colorDark: '#993c1d', colorLight: '#ea580c' },
  { label: '+3',   colorDark: '#ba7517', colorLight: '#d97706' },
  { label: '≈0',   colorDark: '#355486', colorLight: '#80a8e4' },
  { label: '−3',   colorDark: '#065f46', colorLight: '#10b981' },
  { label: '−8',   colorDark: '#064e3b', colorLight: '#059669' },
  { label: '−15+', colorDark: '#022c22', colorLight: '#047857' },
];

export function MapSection({ snapshot }: MapSectionProps) {
  const [metric, setMetric] = useState<Metric>('SCI');
  const [position, setPosition] = useState({ coordinates: [0, 20] as[number, number], zoom: 1 });
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { isDark } = useDarkMode();

  const handleZoomIn  = () => setPosition(p => ({ ...p, zoom: Math.min(p.zoom * 1.5, 4) }));
  const handleZoomOut = () => setPosition(p => ({ ...p, zoom: Math.max(p.zoom / 1.5, 1) }));

  // Lookup keyed by lowercase country name for resilient matching
  const dataMap = useMemo(() => {
    const map = new Map<string, typeof snapshot[0]>();
    snapshot.forEach(d => map.set(d.country.toLowerCase(), d));
    return map;
  }, [snapshot]);

  // Smoother background/line contrast profiles
  const mapBg       = isDark ? '#1f2937' : '#f1f5f9'; // Lighter dark-mode gray, neutral light-mode slate
  const noDataFill  = isDark ? '#374151' : '#e2e8f0'; 
  const strokeColor = isDark ? '#111827' : '#ffffff'; 

  const legendItems = metric === 'Spread' ? SPREAD_LEGEND_ITEMS : SCI_LEGEND_ITEMS;

  return (
    <div
      className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden"
      ref={containerRef}
    >
      {/* ── Header ── */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">World Credit Ratings</h2>
        <div className="flex items-center gap-4">
          <PillToggle
            layoutId="map-metric-toggle"
            options={['SCI', 'Market-implied SCI', 'Spread']}
            selected={metric}
            onChange={(v) => setMetric(v as Metric)}
          />
          <ExportButton 
            filename={`world-credit-ratings`}
            draw={async (canvas, w, h) => {
              if (!svgRef.current) return;
              // Convert UI metric name to the export metric name
              const exportMetric = metric === 'SCI' ? 'sci' 
                                : metric === 'Spread' ? 'spread' 
                                : 'market_implied';
                                
              const watermarkImg = await loadImage('/watermark.png').catch(() => null);
              await drawMapExport(
                canvas,
                svgRef.current,
                exportMetric,
                MAP_TITLES[exportMetric],
                w, h,
                watermarkImg
              );
            }} 
          />
        </div>
      </div>

      {/* ── Map ── */}
      <div className="relative w-full aspect-[2/1]" style={{ background: mapBg }}>
        {/* Zoom buttons */}
        <div className="absolute top-4 left-4 flex flex-col gap-1 z-10">
          {[{ icon: <Plus size={16} />, fn: handleZoomIn }, { icon: <Minus size={16} />, fn: handleZoomOut }].map(
            ({ icon, fn }, i) => (
              <button
                key={i}
                onClick={fn}
                className="p-1.5 bg-white dark:bg-[#16181c] border border-gray-200 dark:border-[#2a2d35]
                           rounded-md shadow-sm text-gray-600 dark:text-gray-400
                           hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {icon}
              </button>
            )
          )}
        </div>

        <ComposableMap
          ref={svgRef}
          projectionConfig={{ scale: 140 }}
          width={800}
          height={400}
          className="w-full h-full"
          style={{ background: 'transparent' }}
        >
          <ZoomableGroup zoom={position.zoom} center={position.coordinates} onMoveEnd={setPosition}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const rawName = geo.properties.name as string;
                  const mapped  = GEO_NAME_MAP[rawName] ?? rawName;
                  const entry   = dataMap.get(mapped.toLowerCase());

                  // ── Live UI fill — stays theme-aware (isDark matters here) ───────────
                  const liveScore =
                    metric === 'SCI'                ? (entry?.sci_score           ?? null) :
                    metric === 'Market-implied SCI' ? (entry?.market_implied_score ?? null) : null;
                  const liveSpread = metric === 'Spread' ? (entry?.spread ?? null) : null;

                  const liveFill = metric === 'Spread'
                    ? getSpreadColor(liveSpread ?? 0, isDark)   // ← isDark ✓
                    : getScoreColor(liveScore, isDark);           // ← isDark ✓

                  // ── Export fill — canonical, never theme-aware ───────────────────────
                  const exportFill = metric === 'Spread'
                    ? spreadToMapColor(liveSpread)               // ← no isDark ✓
                    : scoreToMapColor(liveScore);                // ← no isDark ✓

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      data-export-fill={entry ? exportFill : '#d1d5db'}  // export only
                      style={{
                        default:  { fill: entry ? liveFill : noDataFill, outline: 'none', stroke: strokeColor, strokeWidth: 0.5 },
                        hover:    { fill: '#94a3b8', outline: 'none', cursor: 'pointer' },
                        pressed:  { fill: '#64748b', outline: 'none' },
                      }}
                      onMouseEnter={(evt) => { /* your tooltip logic */ }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-20 px-3 py-1.5 rounded-md shadow-md border text-sm font-medium
                       bg-white dark:bg-[#16181c] border-gray-200 dark:border-[#2a2d35]
                       text-gray-900 dark:text-gray-100 whitespace-nowrap"
            style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
          >
            {tooltip.content}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-[#2a2d35] flex flex-col items-center gap-2">
        {/* Spread context labels */}
        {metric === 'Spread' && (
          <div className="w-full max-w-2xl flex justify-between text-xs text-gray-400 dark:text-[#6b7280]">
            <span>← Agencies ahead of market (stress)</span>
            <span>Market ahead of agencies (upgrade) →</span>
          </div>
        )}

        {/* Gradient bar */}
        <div className="w-full max-w-2xl flex h-3 rounded-full overflow-hidden">
          {legendItems.map((item, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ background: isDark ? item.colorDark : item.colorLight }}
            />
          ))}
        </div>

        {/* Tick labels */}
        <div className="w-full max-w-2xl flex justify-between text-xs text-gray-500 dark:text-[#6b7280]">
          {legendItems.map((item, i) => (
            <span key={i}>{item.label}</span>
          ))}
        </div>

        {/* No-data key */}
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-[#6b7280] mt-0.5">
          <span
            className="inline-block w-3 h-3 rounded-sm border border-gray-300 dark:border-[#2a2d35]"
            style={{ background: noDataFill }}
          />
          <span>No data</span>
        </div>
      </div>
    </div>
  );
}