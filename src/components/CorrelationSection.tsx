import { useMemo } from 'react';
import {
  ComposedChart, Scatter, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CdsSnapshotJson, DebtJson, SnapshotJson } from '../types';
import { useDarkMode } from '../hooks/useDarkMode';
import { COLORS } from './TimeSeriesSection';

interface Props {
  snapshot: SnapshotJson;
  cdsSnapshot: CdsSnapshotJson;
  debt: DebtJson;
  selectedCountries: string[];
}

// ── Quadratic regression ────────────────────────────────────────────────────

function quadraticFit(points: { x: number; y: number }[]): ((x: number) => number) | null {
  const n = points.length;
  if (n < 3) return null;

  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let t1 = 0, t2 = 0, t3 = 0;

  for (const { x, y } of points) {
    s1 += x; s2 += x * x; s3 += x * x * x; s4 += x * x * x * x;
    t1 += y; t2 += x * y; t3 += x * x * y;
  }

  // Normal equations for y = ax² + bx + c
  // [s0 s1 s2] [c]   [t1]
  // [s1 s2 s3] [b] = [t2]
  // [s2 s3 s4] [a]   [t3]
  const mat: number[][] = [
    [s0, s1, s2, t1],
    [s1, s2, s3, t2],
    [s2, s3, s4, t3],
  ];

  for (let col = 0; col < 3; col++) {
    let maxRow = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(mat[row][col]) > Math.abs(mat[maxRow][col])) maxRow = row;
    }
    [mat[col], mat[maxRow]] = [mat[maxRow], mat[col]];
    if (Math.abs(mat[col][col]) < 1e-12) return null;
    for (let row = col + 1; row < 3; row++) {
      const f = mat[row][col] / mat[col][col];
      for (let k = col; k <= 3; k++) mat[row][k] -= f * mat[col][k];
    }
  }

  const coef = [0, 0, 0];
  for (let row = 2; row >= 0; row--) {
    coef[row] = mat[row][3];
    for (let col = row + 1; col < 3; col++) coef[row] -= mat[row][col] * coef[col];
    coef[row] /= mat[row][row];
  }

  const [c, b, a] = coef;
  return (x: number) => a * x * x + b * x + c;
}

function buildTrendLine(fn: (x: number) => number, xMin: number, xMax: number, steps = 60) {
  const result = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    const y = fn(x);
    result.push({ x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) });
  }
  return result;
}

// ── Custom dot: circle + label ───────────────────────────────────────────────

function ScatterDot(props: any) {
  const { cx, cy, fill, payload } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="none" stroke={fill} strokeWidth={2} />
      <text
        x={cx}
        y={cy - 14}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={fill}
        fontFamily="Lato, sans-serif"
      >
        {payload.code}
      </text>
    </g>
  );
}

// ── Custom tooltip ───────────────────────────────────────────────────────────

function ScatterTooltip({ active, payload, xLabel, yLabel }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white dark:bg-[#16181c] p-3 border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-lg text-xs">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{d.country}</p>
      <p className="text-gray-500 dark:text-gray-400">{xLabel}: <span className="text-gray-800 dark:text-gray-200 font-medium">{d.x.toFixed(1)}</span></p>
      <p className="text-gray-500 dark:text-gray-400">{yLabel}: <span className="text-gray-800 dark:text-gray-200 font-medium">{d.y.toFixed(1)} bps</span></p>
    </div>
  );
}

// ── Sub-chart ────────────────────────────────────────────────────────────────

interface ChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  points: { x: number; y: number; country: string; code: string; color: string }[];
  isDark: boolean;
}

function CorrelationChart({ title, xLabel, yLabel, points, isDark }: ChartProps) {
  const trendLine = useMemo(() => {
    if (points.length < 3) return [];
    const fn = quadraticFit(points);
    if (!fn) return [];
    const xs = points.map(p => p.x);
    return buildTrendLine(fn, Math.min(...xs), Math.max(...xs));
  }, [points]);

  const axisColor = isDark ? '#6b7280' : '#9ca3af';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 font-medium px-1">
        {title}
      </p>
      {points.length < 2 ? (
        <div className="flex items-center justify-center h-[260px] text-xs text-gray-400 dark:text-gray-600">
          Add more countries with CDS data to see correlation
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart margin={{ top: 16, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={gridColor}
              vertical={false}
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={['auto', 'auto']}
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 11 }}
              tickMargin={8}
              label={{ value: xLabel, position: 'insideBottom', offset: -12, fill: axisColor, fontSize: 11 }}
            />
            <YAxis
              type="number"
              domain={[0, 'auto']}
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 11 }}
              width={46}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: axisColor, fontSize: 11 }}
            />
            <Tooltip
              content={<ScatterTooltip xLabel={xLabel} yLabel="CDS" />}
              cursor={{ strokeDasharray: '3 3', stroke: axisColor }}
            />

            {/* One Scatter per country to get individual colors */}
            {points.map((pt) => (
              <Scatter
                key={pt.country}
                name={pt.country}
                data={[pt]}
                fill={pt.color}
                shape={<ScatterDot />}
                isAnimationActive={false}
              />
            ))}

            {/* Trend line */}
            {trendLine.length > 0 && (
              <Line
                data={trendLine}
                dataKey="y"
                dot={false}
                activeDot={false}
                stroke="#e09c42"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                type="monotone"
                isAnimationActive={false}
                legendType="none"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function CorrelationSection({ snapshot, cdsSnapshot, debt, selectedCountries }: Props) {
  const { isDark } = useDarkMode();

  // Build a map: country → latest SCI score
  const sciByCountry = useMemo(() => {
    const m: Record<string, number> = {};
    for (const entry of snapshot) {
      if (entry.sci != null) m[entry.country] = entry.sci;
    }
    return m;
  }, [snapshot]);

  // Build point sets filtered to selected countries that have CDS data
  const { sciPoints, debtPoints } = useMemo(() => {
    const sciPts: ChartProps['points'] = [];
    const debtPts: ChartProps['points'] = [];

    selectedCountries.forEach((country, i) => {
      const cdsEntry = cdsSnapshot[country];
      if (!cdsEntry) return;

      const sci = sciByCountry[country];
      const debtVal = debt[country];
      const color = COLORS[i % COLORS.length];
      const code = cdsEntry.iso2;

      if (sci != null) {
        sciPts.push({ x: parseFloat(sci.toFixed(1)), y: cdsEntry.cds, country, code, color });
      }
      if (debtVal != null) {
        debtPts.push({ x: debtVal, y: cdsEntry.cds, country, code, color });
      }
    });

    return { sciPoints: sciPts, debtPoints: debtPts };
  }, [selectedCountries, cdsSnapshot, sciByCountry, debt]);

  // Don't render the section at all if no selected country has CDS data
  const hasCdsCountries = sciPoints.length > 0 || debtPoints.length > 0;

  if (!hasCdsCountries) return null;

  return (
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35] flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          CDS Spread Correlations
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-600">
          Latest CDS vs debt/GDP (2024 actual)
        </span>
      </div>

      <div className="p-4 flex flex-col sm:flex-row gap-8">
        <CorrelationChart
          title="Spread vs SCI"
          xLabel="SCI Score"
          yLabel="CDS (bps)"
          points={sciPoints}
          isDark={isDark}
        />
        <div className="hidden sm:block w-px bg-gray-100 dark:bg-[#2a2d35] self-stretch" />
        <CorrelationChart
          title="Spread vs Debt / GDP"
          xLabel="Debt / GDP (%)"
          yLabel="CDS (bps)"
          points={debtPoints}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
