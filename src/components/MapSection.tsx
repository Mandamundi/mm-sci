import { useState, useRef, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { PillToggle } from './PillToggle';
import { ExportButton } from './ExportButton';
import { SnapshotJson } from '../types';
import { getScoreColor } from '../utils/scoreColor';
import { useDarkMode } from '../hooks/useDarkMode';
import { Plus, Minus } from 'lucide-react';

const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

interface MapSectionProps {
  snapshot: SnapshotJson;
}

type Metric = 'SCI' | 'Market-implied SCI' | 'Spread';

export function MapSection({ snapshot }: MapSectionProps) {
  const [metric, setMetric] = useState<Metric>('SCI');
  const [position, setPosition] = useState({ coordinates: [0, 20] as [number, number], zoom: 1 });
  const [tooltipContent, setTooltipContent] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDark } = useDarkMode();

  const handleZoomIn = () => {
    if (position.zoom >= 4) return;
    setPosition((pos) => ({ ...pos, zoom: pos.zoom * 1.5 }));
  };

  const handleZoomOut = () => {
    if (position.zoom <= 1) return;
    setPosition((pos) => ({ ...pos, zoom: pos.zoom / 1.5 }));
  };

  const handleMoveEnd = (position: any) => {
    setPosition(position);
  };

  const dataMap = useMemo(() => {
    const map = new Map();
    snapshot.forEach(d => map.set(d.country, d));
    // Also map by ID if possible, but world-atlas uses names or ISO codes.
    // We'll try to match by name.
    return map;
  }, [snapshot]);

  return (
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden" ref={containerRef}>
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">World Credit Ratings</h2>
        <div className="flex items-center gap-4">
          <PillToggle
            layoutId="map-metric-toggle"
            options={['SCI', 'Market-implied SCI', 'Spread']}
            selected={metric}
            onChange={setMetric}
          />
          <ExportButton targetRef={containerRef} filename="world-credit-ratings" />
        </div>
      </div>
      
      <div className="relative w-full aspect-[2/1] bg-[#f8f9fa] dark:bg-[#0e0f11]">
        <div className="absolute top-4 left-4 flex flex-col gap-1 z-10">
          <button onClick={handleZoomIn} className="p-1.5 bg-white dark:bg-[#16181c] border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
            <Plus size={16} />
          </button>
          <button onClick={handleZoomOut} className="p-1.5 bg-white dark:bg-[#16181c] border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
            <Minus size={16} />
          </button>
        </div>
        
        <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={400} className="w-full h-full">
          <ZoomableGroup zoom={position.zoom} center={position.coordinates} onMoveEnd={handleMoveEnd}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const countryName = geo.properties.name;
                  // Simple mapping for common mismatches
                  let mappedName = countryName;
                  if (countryName === "United States of America") mappedName = "United States";
                  
                  const d = dataMap.get(mappedName);
                  
                  let val = null;
                  if (d) {
                    if (metric === 'SCI') val = d.sci;
                    if (metric === 'Market-implied SCI') val = d.market_implied;
                    if (metric === 'Spread') val = d.spread;
                  }

                  // Spread uses a different color scale (diverging)
                  let fill = isDark ? '#2a2d35' : '#e5e7eb';
                  if (val !== null) {
                    if (metric === 'Spread') {
                      // Spread: positive = orange, negative = green
                      if (val > 5) fill = isDark ? '#993c1d' : '#fb923c';
                      else if (val > 0) fill = isDark ? '#ba7517' : '#facc15';
                      else if (val > -5) fill = isDark ? '#0f6e56' : '#86efac';
                      else fill = isDark ? '#085041' : '#4ade80';
                    } else {
                      fill = getScoreColor(val, isDark).fill;
                    }
                  }

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={isDark ? '#0e0f11' : '#ffffff'}
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none' },
                        hover: { outline: 'none', opacity: 0.8 },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={() => {
                        if (d) {
                          setTooltipContent(`${d.flag || ''} ${d.country}: ${metric} = ${val !== null ? val.toFixed(1) : 'N/A'}`);
                        } else {
                          setTooltipContent(`${countryName}: No data`);
                        }
                      }}
                      onMouseLeave={() => {
                        setTooltipContent("");
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
        
        {tooltipContent && (
          <div className="absolute bottom-4 left-4 bg-white dark:bg-[#16181c] px-3 py-1.5 rounded-md shadow-md border border-gray-200 dark:border-[#2a2d35] text-sm font-medium text-gray-900 dark:text-gray-100 pointer-events-none">
            {tooltipContent}
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-200 dark:border-[#2a2d35] flex flex-col items-center">
        <div className="w-full max-w-2xl flex h-3 rounded-full overflow-hidden">
          <div className="flex-1 bg-[#791f1f] dark:bg-[#791f1f]" title="D to CCC (0-29)"></div>
          <div className="flex-1 bg-[#993c1d] dark:bg-[#993c1d]" title="B (30-44)"></div>
          <div className="flex-1 bg-[#854f0b] dark:bg-[#854f0b]" title="BB (45-54)"></div>
          <div className="flex-1 bg-[#ba7517] dark:bg-[#ba7517]" title="BBB (55-59)"></div>
          <div className="flex-1 bg-[#1d9e75] dark:bg-[#1d9e75]" title="A (60-74)"></div>
          <div className="flex-1 bg-[#0f6e56] dark:bg-[#0f6e56]" title="AA (75-89)"></div>
          <div className="flex-1 bg-[#085041] dark:bg-[#085041]" title="AAA (90-100)"></div>
        </div>
        <div className="w-full max-w-2xl flex justify-between mt-2 text-xs text-gray-500 dark:text-[#6b7280]">
          <span>D</span>
          <span>CCC</span>
          <span>B</span>
          <span>BB</span>
          <span>BBB</span>
          <span>A</span>
          <span>AA</span>
          <span>AAA</span>
        </div>
      </div>
    </div>
  );
}
