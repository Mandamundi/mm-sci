// ─────────────────────────────────────────────────────────────────────────────
// exportPanel.ts  —  MM Sovereign Credit Dashboard  —  Canvas-based PNG export
//
// Three exporters, all drawn natively on canvas (no html2canvas):
//   exportMap(svgEl, metric, title)
//   exportMultiCountry(series, countries, metric, title)
//   exportCountryDetail(sciSeries, miSeries, country, mode, title)
//
// Brand conventions (matching MM Event Study tool):
//   • White background
//   • Title band at top: title (dark) + subtitle "MacroMicro.me | MacroMicro" (muted)
//   • Watermark PNG centred on plot area at 20% opacity
//   • Gridlines: #e6e6e6
//   • Axes labels / ticks: #666666
//   • Score colour scale consistent with dashboard UI
//   • Rating labels on right y-axis (AAA … D) at standard notch positions
//   • Download modal: three size options (same as Event Study tool)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DateValue { date: string; value: number | null; }

export interface CountrySeries {
  country: string;
  points: DateValue[];   // already filtered / aligned
}

export interface SciDetailSeries {
  dates: string[];
  sci:    (number | null)[];
  sp:     (number | null)[];
  moodys: (number | null)[];
  fitch:  (number | null)[];
}

export interface MarketDetailSeries {
  dates:          string[];
  sci:            (number | null)[];
  market_implied: (number | null)[];
  divergence:     (number | null)[];
}

export type ExportMetric = 'sci' | 'market_implied' | 'spread';
export type DetailMode   = 'sci_only' | 'vs_market';

// ── Constants ─────────────────────────────────────────────────────────────────

export const SIZES = [
  { label: '960 × 540  (16:9)', w: 960,  h: 540  },
  { label: '975 × 650  (3:2)',  w: 975,  h: 650  },
  { label: '800 × 800  (1:1)',  w: 800,  h: 800  },
] as const;

const FONT = 'Lato, Inter, -apple-system, system-ui, sans-serif';

// 8-colour palette for multi-country lines (matches dashboard chip colours)
const LINE_PALETTE = [
  '#3BAFDA', '#E9573F', '#F6BB42', '#70CA63',
  '#926DDE', '#57C7D4', '#F44C87', '#D68C45',
];

// Agency line colours (matches dashboard)
const AGENCY_COLORS: Record<string, string> = {
  sp:     '#a8c8e8',
  moodys: '#aed6a0',
  fitch:  '#f5c78a',
};

// Rating notch positions on the 0-100 SCI scale
const RATING_TICKS: Array<[number, string]> = [
  [100, 'AAA'], [95, 'AA+'], [90, 'AA'], [85, 'AA−'],
  [80, 'A+'],   [75, 'A'],   [70, 'A−'],
  [65, 'BBB+'], [60, 'BBB'], [55, 'BBB−'],
  [50, 'BB+'],  [45, 'BB'],  [40, 'BB−'],
  [35, 'B+'],   [30, 'B'],   [25, 'B−'],
  [20, 'CCC+'], [10, 'CCC−'], [0, 'D'],
];

// Score → fill colour for map choropleth (light-mode palette)
function scoreToMapColor(score: number | null): string {
  if (score === null) return '#e0e0e0';
  if (score >= 90) return '#085041';
  if (score >= 75) return '#0f6e56';
  if (score >= 60) return '#1d9e75';
  if (score >= 55) return '#ba7517';
  if (score >= 45) return '#854f0b';
  if (score >= 30) return '#993c1d';
  return '#791f1f';
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function lerp(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

function bakeComputedStyles(
  clone:    SVGSVGElement,
  original: SVGSVGElement,
): void {
  const SEL = 'path, circle, ellipse, polygon, polyline, rect, line, text';
  const cloneEls = Array.from(clone.querySelectorAll<SVGElement>(SEL));
  const origEls  = Array.from(original.querySelectorAll<SVGElement>(SEL));

  cloneEls.forEach((el, i) => {
    const orig = origEls[i];
    if (!orig) return;
    const cs = window.getComputedStyle(orig);

    const fill = cs.fill;
    if (fill && fill !== 'none') el.setAttribute('fill', fill);

    const stroke = cs.stroke;
    if (stroke && stroke !== 'none') el.setAttribute('stroke', stroke);

    // Strip class names so no external stylesheet can re-theme the element
    el.removeAttribute('class');
  });
}

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = 2;
  canvas.width        = w * dpr;
  canvas.height       = h * dpr;
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
}

/** Title band: main title + "MacroMicro.me | MacroMicro" subtitle. Returns band height. */
function drawTitleBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  title: string,
): number {
  const titleSize    = Math.round(w / 40);
  const subtitleSize = Math.round(w / 62);

  ctx.fillStyle    = '#222222';
  ctx.font         = `500 ${titleSize}px ${FONT}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, w / 2, 14);

  ctx.fillStyle    = '#888888';
  ctx.font         = `400 ${subtitleSize}px ${FONT}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('MacroMicro.me | MacroMicro', w / 2, 14 + titleSize + 5);

  return titleSize + subtitleSize + 28;
}

/** Centred watermark on the plot area at 20% opacity. */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  plotLeft: number, plotTop: number,
  plotW: number,   plotH: number,
): void {
  const maxW = plotW * 0.38;
  const maxH = plotH * 0.30;
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const wmW = img.naturalWidth  * scale;
  const wmH = img.naturalHeight * scale;
  const wmX = plotLeft + (plotW - wmW) / 2;
  const wmY = plotTop  + (plotH - wmH) / 2;
  ctx.globalAlpha = 0.20;
  ctx.drawImage(img, wmX, wmY, wmW, wmH);
  ctx.globalAlpha = 1;
}

interface PlotBox {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number;
}

/**
 * Draw a standard SCI plot area:
 *  - white bg, horizontal gridlines, left numeric axis (0-100),
 *    right rating-label axis, IG floor dashed line, bottom date axis.
 * Returns the PlotBox so callers can draw lines on top.
 */
function drawSciAxes(
  ctx:         CanvasRenderingContext2D,
  w:           number,
  h:           number,
  titleH:      number,
  legendH:     number,
  dates:        string[],   // full sorted date array for x-axis labels
  yMin:         number,
  yMax:         number,
  hasRightAxis: boolean,
): PlotBox {
  const marginTop    = titleH + 10;
  const marginBottom = legendH + 48;
  const marginLeft   = 60;
  const marginRight  = hasRightAxis ? 68 : 24;

  const left   = marginLeft;
  const top    = marginTop;
  const right  = w - marginRight;
  const bottom = h - marginBottom;
  const pw     = right - left;
  const ph     = bottom - top;

  const toX = (i: number) => lerp(i, 0, dates.length - 1, left, right);
  const toY = (v: number) => lerp(v, yMin, yMax, bottom, top);

  // Horizontal gridlines + left y-axis numeric labels
  const yStep = 10;
  ctx.font         = `400 11px ${FONT}`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  for (let y = 0; y <= 100; y += yStep) {
    if (y < yMin || y > yMax) continue;
    const py = toY(y);
    ctx.strokeStyle = '#e6e6e6';
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
    ctx.fillStyle = '#666666';
    ctx.fillText(String(y), left - 8, py);
  }

  // Left axis title
  ctx.save();
  ctx.translate(14, top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle    = '#666666';
  ctx.font         = `400 11px ${FONT}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Score (0–100)', 0, 0);
  ctx.restore();

  // Right y-axis — rating labels at notch positions
  if (hasRightAxis) {
    ctx.font         = `400 9px ${FONT}`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#999999';
    for (const [score, label] of RATING_TICKS) {
      if (score < yMin || score > yMax) continue;
      const py = toY(score);
      ctx.fillText(label, right + 6, py);
    }
    // Axis border line
    ctx.strokeStyle = '#e6e6e6';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.stroke();
  }

  // IG floor dashed line at y=55
  if (yMin <= 55 && yMax >= 55) {
    const igY = toY(55);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth   = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(left, igY);
    ctx.lineTo(right, igY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle    = '#aaaaaa';
    ctx.font         = `400 9px ${FONT}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('IG floor  BBB−', right - 4, igY - 2);
  }

  // Bottom axis: date labels — pick ~6 evenly spaced
  const nLabels = Math.min(6, dates.length);
  const step    = Math.floor(dates.length / nLabels);
  ctx.fillStyle    = '#666666';
  ctx.font         = `400 10px ${FONT}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  // Bottom border
  ctx.strokeStyle = '#e6e6e6';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  for (let i = 0; i < dates.length; i += step) {
    const px    = toX(i);
    const label = dates[i].slice(0, 7); // YYYY-MM
    ctx.fillText(label, px, bottom + 6);
  }

  return { left, top, right, bottom, width: pw, height: ph };
}

function triggerDownload(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href     = canvas.toDataURL('image/png');
  link.click();
}

// ── Legend row ────────────────────────────────────────────────────────────────

interface LegendItem {
  label:  string;
  color:  string;
  dash?:  boolean;
  alpha?: number;
}

/**
 * Draw a centered legend below the plot.
 * Returns height consumed (for marginBottom calculation).
 */
function drawLegend(
  ctx:     CanvasRenderingContext2D,
  items:   LegendItem[],
  w:       number,
  bottomY: number,   // top of legend block
): number {
  const fontSize  = 13;
  const rowH      = fontSize + 10;
  const swatchW   = 22;
  const swatchGap = 6;
  const colPadR   = 22;

  ctx.font = `400 ${fontSize}px ${FONT}`;
  const maxLabelW = Math.max(...items.map(it => ctx.measureText(it.label).width));
  const cellW     = swatchW + swatchGap + maxLabelW + colPadR;
  let cols        = Math.min(5, items.length, Math.max(1, Math.floor((w - 40) / cellW)));
  if (cols > 1 && items.length % cols === 1) cols -= 1;

  let row: LegendItem[] = [];
  let rowIdx = 0;

  for (let i = 0; i < items.length; i++) {
    row.push(items[i]);
    if (row.length === cols || i === items.length - 1) {
      const rowTotalW = row.length * cellW - colPadR;
      const startX    = (w - rowTotalW) / 2;
      const rowY      = bottomY + rowIdx * rowH + rowH / 2;

      row.forEach((item, j) => {
        const lx = startX + j * cellW;
        ctx.strokeStyle = item.color;
        ctx.lineWidth   = 2;
        ctx.globalAlpha = item.alpha ?? 1;
        ctx.setLineDash(item.dash ? [5, 3] : []);
        ctx.beginPath();
        ctx.moveTo(lx, rowY);
        ctx.lineTo(lx + swatchW, rowY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.fillStyle    = '#333333';
        ctx.font         = `400 ${fontSize}px ${FONT}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, lx + swatchW + swatchGap, rowY);
      });

      row = [];
      rowIdx++;
    }
  }

  return rowIdx * rowH + 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTER 1 — World choropleth map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exports the react-simple-maps SVG as a high-quality PNG.
 * Strategy: serialize SVG → Blob URL → draw onto canvas → add title band,
 * legend bar, and watermark.
 *
 * @param svgElement  The <svg> DOM node rendered by react-simple-maps
 * @param snapshot    Array of snapshot entries (for colour legend)
 * @param metric      Which metric is currently shown
 * @param w, h        Output dimensions
 * @param watermarkImg Pre-loaded watermark image (or null)
 */
export async function drawMapExport(
  canvas:       HTMLCanvasElement,
  svgElement:   SVGSVGElement,
  metric:       ExportMetric,
  title:        string,
  w:            number,
  h:            number,
  watermarkImg: HTMLImageElement | null,
): Promise<void> {
  const ctx = setupCanvas(canvas, w, h);

  // ── Background: blue canvas, white title band only ─────────────────────────
  ctx.fillStyle = '#cce5f0';
  ctx.fillRect(0, 0, w, h);

  const _titleSize    = Math.round(w / 40);
  const _subtitleSize = Math.round(w / 62);
  const titleBandH    = _titleSize + _subtitleSize + 28;  // mirrors drawTitleBand arithmetic
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, titleBandH);
  // ──────────────────────────────────────────────────────────────────────────

  // Title band (draws text on top of the white rect)
  const titleH = drawTitleBand(ctx, w, title);

  // ── Serialize SVG ──────────────────────────────────────────────────────────
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  // Bake computed fill/stroke values BEFORE adding the ocean rect or serializing,
  // so the live original's element order still matches the clone's element order.
  bakeComputedStyles(clone, svgElement);

  const oceanRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  oceanRect.setAttribute('width',  '100%');
  oceanRect.setAttribute('height', '100%');
  oceanRect.setAttribute('fill',   '#cce5f0');
  clone.insertBefore(oceanRect, clone.firstChild);

  // Inject only a minimal style that locks color-scheme to light.
  // Do NOT dump document.styleSheets — that bakes in dark/light-mode CSS.
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    :root { color-scheme: light !important; }
    * { color-scheme: light !important; }
  `;
  clone.insertBefore(styleEl, clone.firstChild);

  const svgStr  = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl  = URL.createObjectURL(svgBlob);

  const mapImg = await loadImage(svgUrl);
  URL.revokeObjectURL(svgUrl);

  // ── Map area ───────────────────────────────────────────────────────────────
  const legendBandH = 60;
  const mapTop      = titleH;
  const mapH        = h - titleH - legendBandH;
  const mapW        = w;

  const svgAR = svgElement.viewBox?.baseVal?.width
    ? svgElement.viewBox.baseVal.width / svgElement.viewBox.baseVal.height
    : mapW / mapH;
  let drawW = mapW;
  let drawH = mapW / svgAR;
  if (drawH > mapH) { drawH = mapH; drawW = mapH * svgAR; }
  const drawX = (mapW - drawW) / 2;
  const drawY = mapTop + (mapH - drawH) / 2;

  ctx.drawImage(mapImg, drawX, drawY, drawW, drawH);

  if (watermarkImg) {
    drawWatermark(ctx, watermarkImg, drawX, drawY, drawW, drawH);
  }

  // ── Colour legend bar ──────────────────────────────────────────────────────
  const legendY = h - legendBandH + 10;
  const barH    = 12;
  const barW    = Math.min(500, w * 0.6);
  const barX    = (w - barW) / 2;

  const stops: Array<[number, string, string]> = [
    [0,   '#791f1f', 'D'],
    [30,  '#993c1d', 'B−'],
    [45,  '#854f0b', 'BB'],
    [55,  '#ba7517', 'BBB'],
    [60,  '#1d9e75', 'A'],
    [75,  '#0f6e56', 'AA'],
    [90,  '#085041', 'AAA'],
  ];

  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  stops.forEach(([score, color]) => grad.addColorStop(score / 100, color));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(barX, legendY, barW, barH, 4);
  ctx.fill();

  // Labels below bar
  ctx.font         = `400 10px ${FONT}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = '#555555';
  stops.forEach(([score, , label]) => {
    const lx = barX + (score / 100) * barW;
    ctx.fillText(label, lx, legendY + barH + 4);
  });

  // "Investment Grade" / "Speculative Grade" labels
  const igX = barX + (55 / 100) * barW;
  ctx.font      = `400 9px ${FONT}`;
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'right';
  ctx.fillText('Speculative Grade', igX - 4, legendY - 14);
  ctx.textAlign = 'left';
  ctx.fillText('Investment Grade', igX + 4, legendY - 14);
  // Divider tick
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(igX, legendY - 12);
  ctx.lineTo(igX, legendY + barH + 2);
  ctx.stroke();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTER 2 — Multi-country time series
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All dates across all series, union-merged and sorted.
 */
function mergedDates(series: CountrySeries[]): string[] {
  const set = new Set<string>();
  series.forEach(s => s.points.forEach(p => set.add(p.date)));
  return Array.from(set).sort();
}

export async function drawMultiCountryExport(
  canvas:       HTMLCanvasElement,
  series:       CountrySeries[],
  title:        string,
  w:            number,
  h:            number,
  watermarkImg: HTMLImageElement | null,
): Promise<void> {
  const ctx = setupCanvas(canvas, w, h);
  drawBackground(ctx, w, h);

  // Build legend items first so we know legendH for margin calc
  const legendItems: LegendItem[] = series.map((s, i) => ({
    label: s.country,
    color: LINE_PALETTE[i % LINE_PALETTE.length],
  }));
  // Measure legend height (approximate: 1 row per 5 items)
  const legendRows = Math.ceil(series.length / 5);
  const legendH    = legendRows * 21 + 12;

  const titleH = drawTitleBand(ctx, w, title);

  const dates = mergedDates(series);
  if (dates.length === 0) return;

  const plot = drawSciAxes(ctx, w, h, titleH, legendH, dates, 0, 100, true);

  const toX = (i: number)  => lerp(i, 0, dates.length - 1, plot.left, plot.right);
  const toY = (v: number)  => lerp(v, 0, 100, plot.bottom, plot.top);

  // Watermark
  if (watermarkImg) drawWatermark(ctx, watermarkImg, plot.left, plot.top, plot.width, plot.height);

  // Draw each country line
  series.forEach((s, idx) => {
    const color = LINE_PALETTE[idx % LINE_PALETTE.length];
    const dateIndex = new Map(dates.map((d, i) => [d, i]));

    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;

    s.points.forEach(pt => {
      if (pt.value === null) return;
      const xi = dateIndex.get(pt.date);
      if (xi === undefined) return;
      const px = toX(xi);
      const py = toY(pt.value);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // Legend
  drawLegend(ctx, legendItems, w, plot.bottom + 36);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTER 3 — Single country SCI / SCI vs Market-implied
// ─────────────────────────────────────────────────────────────────────────────

export async function drawCountryDetailExport(
  canvas:       HTMLCanvasElement,
  sciSeries:    SciDetailSeries,
  miSeries:     MarketDetailSeries | null,
  mode:         DetailMode,
  title:        string,
  w:            number,
  h:            number,
  watermarkImg: HTMLImageElement | null,
): Promise<void> {
  const ctx = setupCanvas(canvas, w, h);
  drawBackground(ctx, w, h);

  const titleH = drawTitleBand(ctx, w, title);

  if (mode === 'sci_only' || !miSeries) {
    // ── Single panel: agency lines + SCI composite ─────────────────────────
    const legendItems: LegendItem[] = [
      { label: "S&P",        color: AGENCY_COLORS.sp,     alpha: 0.7 },
      { label: "Moody's",    color: AGENCY_COLORS.moodys, alpha: 0.7 },
      { label: "Fitch",      color: AGENCY_COLORS.fitch,  alpha: 0.7 },
      { label: "SCI Composite", color: '#e24b4a' },
    ];
    const legendH = 32;

    const plot = drawSciAxes(ctx, w, h, titleH, legendH, sciSeries.dates, 0, 100, true);
    const toX  = (i: number) => lerp(i, 0, sciSeries.dates.length - 1, plot.left, plot.right);
    const toY  = (v: number) => lerp(v, 0, 100, plot.bottom, plot.top);

    if (watermarkImg) drawWatermark(ctx, watermarkImg, plot.left, plot.top, plot.width, plot.height);

    // Agency lines (faint)
    const agencyKeys: Array<[keyof SciDetailSeries, string]> = [
      ['sp', AGENCY_COLORS.sp], ['moodys', AGENCY_COLORS.moodys], ['fitch', AGENCY_COLORS.fitch],
    ];
    agencyKeys.forEach(([key, color]) => {
      const vals = sciSeries[key] as (number | null)[];
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      vals.forEach((v, i) => {
        if (v === null) return;
        const px = toX(i); const py = toY(v);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // SCI composite (bold)
    ctx.strokeStyle = '#e24b4a';
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    sciSeries.sci.forEach((v, i) => {
      if (v === null) return;
      const px = toX(i); const py = toY(v);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    drawLegend(ctx, legendItems, w, plot.bottom + 36);

  } else {
    // ── Two panels: top = SCI vs Market-implied, bottom = divergence ────────
    // Use miSeries.dates as the common x-axis (weekly)
    const dates  = miSeries.dates;
    const totalH = h - titleH;

    // Panel split: 70% top (SCI chart), 30% bottom (divergence)
    const splitRatio = 0.68;
    const topPanelH  = Math.floor(totalH * splitRatio);
    const botPanelH  = totalH - topPanelH;

    // ── Top panel ────────────────────────────────────────────────────────────
    const marginLeft   = 60;
    const marginRight  = 68;
    const marginBottom = 8;

    // Map miSeries dates to indices of sciSeries for the SCI step line
    // (SCI is monthly, MI is weekly — they're pre-aligned in market.json)
    const plotLeft   = marginLeft;
    const plotTopY   = titleH + 10;
    const plotRight  = w - marginRight;
    const plotBotTop = titleH + topPanelH - marginBottom; // bottom of top panel
    const plotWid    = plotRight - plotLeft;
    const plotHgt    = plotBotTop - plotTopY;

    const toX  = (i: number) => lerp(i, 0, dates.length - 1, plotLeft, plotRight);
    const toY  = (v: number) => lerp(v, 0, 100, plotBotTop, plotTopY);

    // Gridlines + axes — top panel
    ctx.font         = `400 11px ${FONT}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    for (let y = 0; y <= 100; y += 10) {
      const py = toY(y);
      ctx.strokeStyle = '#e6e6e6'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(plotLeft, py); ctx.lineTo(plotRight, py); ctx.stroke();
      ctx.fillStyle = '#666666';
      ctx.fillText(String(y), plotLeft - 8, py);
    }
    // Right axis rating labels
    ctx.font = `400 9px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = '#999999';
    for (const [score, label] of RATING_TICKS) {
      ctx.fillText(label, plotRight + 6, toY(score));
    }
    // IG floor
    const igY = toY(55);
    ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(plotLeft, igY); ctx.lineTo(plotRight, igY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#aaaaaa'; ctx.font = `400 9px ${FONT}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('IG floor  BBB−', plotRight - 4, igY - 2);

    if (watermarkImg) drawWatermark(ctx, watermarkImg, plotLeft, plotTopY, plotWid, plotHgt);

    // SCI line (dashed, red)
    ctx.strokeStyle = '#e24b4a'; ctx.lineWidth = 2.2; ctx.setLineDash([7, 4]);
    ctx.beginPath();
    let s1 = false;
    miSeries.sci.forEach((v, i) => {
      if (v === null) return;
      const px = toX(i); const py = toY(v);
      if (!s1) { ctx.moveTo(px, py); s1 = true; } else ctx.lineTo(px, py);
    });
    ctx.stroke(); ctx.setLineDash([]);

    // Market-implied line (solid, teal)
    ctx.strokeStyle = '#1d9e75'; ctx.lineWidth = 2.0;
    ctx.beginPath();
    let s2 = false;
    miSeries.market_implied.forEach((v, i) => {
      if (v === null) return;
      const px = toX(i); const py = toY(v);
      if (!s2) { ctx.moveTo(px, py); s2 = true; } else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Separator line between panels
    const sepY = titleH + topPanelH;
    ctx.strokeStyle = '#e6e6e6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(plotLeft, sepY); ctx.lineTo(plotRight, sepY); ctx.stroke();

    // ── Bottom panel: divergence fill chart ─────────────────────────────────
    const divTop    = sepY + 4;
    const divBot    = h - 50;  // leave room for x-axis labels + legend
    const divH      = divBot - divTop;
    const divMin    = -30;
    const divMax    = 30;
    const toYDiv    = (v: number) => lerp(v, divMin, divMax, divBot, divTop);
    const zeroYDiv  = toYDiv(0);

    // Divergence fills
    const divPts = miSeries.divergence
      .map((v, i) => ({ v, i }))
      .filter(p => p.v !== null) as Array<{ v: number; i: number }>;

    if (divPts.length > 1) {
      // Positive divergence (agencies more optimistic) — orange
      ctx.fillStyle = 'rgba(244, 164, 96, 0.65)';
      ctx.beginPath();
      ctx.moveTo(toX(divPts[0].i), zeroYDiv);
      divPts.forEach(p => ctx.lineTo(toX(p.i), toYDiv(Math.max(0, p.v))));
      ctx.lineTo(toX(divPts[divPts.length - 1].i), zeroYDiv);
      ctx.closePath(); ctx.fill();

      // Negative divergence (market more optimistic) — green
      ctx.fillStyle = 'rgba(144, 238, 144, 0.65)';
      ctx.beginPath();
      ctx.moveTo(toX(divPts[0].i), zeroYDiv);
      divPts.forEach(p => ctx.lineTo(toX(p.i), toYDiv(Math.min(0, p.v))));
      ctx.lineTo(toX(divPts[divPts.length - 1].i), zeroYDiv);
      ctx.closePath(); ctx.fill();

      // Outline
      ctx.strokeStyle = '#888888'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      divPts.forEach((p, idx) => {
        const px = toX(p.i); const py = toYDiv(p.v);
        idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Zero baseline
    ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(plotLeft, zeroYDiv); ctx.lineTo(plotRight, zeroYDiv); ctx.stroke();

    // Divergence y-axis labels
    ctx.font = `400 10px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [-20, 0, 20].forEach(v => {
      ctx.fillStyle = '#666666';
      ctx.fillText(String(v), plotLeft - 6, toYDiv(v));
    });

    // Divergence panel label
    ctx.save();
    ctx.translate(14, divTop + divH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#888888'; ctx.font = `400 9px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Divergence', 0, 0);
    ctx.restore();

    // Date labels on x-axis (bottom of divergence panel)
    const nLabels = 6;
    const step    = Math.max(1, Math.floor(dates.length / nLabels));
    ctx.fillStyle = '#666666'; ctx.font = `400 10px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i < dates.length; i += step) {
      ctx.fillText(dates[i].slice(0, 7), toX(i), divBot + 5);
    }

    // Legend below everything
    const legendItems: LegendItem[] = [
      { label: 'SCI (agency composite)',  color: '#e24b4a', dash: true },
      { label: 'Market-implied SCI',      color: '#1d9e75' },
      { label: 'Agencies more optimistic', color: 'rgba(244,164,96,0.8)' },
      { label: 'Market more optimistic',   color: 'rgba(144,238,144,0.8)' },
    ];
    drawLegend(ctx, legendItems, w, divBot + 22);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// React component: ExportButton with size-picker dropdown
// ─────────────────────────────────────────────────────────────────────────────

type ExportFn = (canvas: HTMLCanvasElement, w: number, h: number) => Promise<void>;

interface ExportButtonProps {
  /** Async function that draws onto the provided canvas at the given dimensions. */
  draw:     ExportFn;
  filename: string;
  /** Optional label override; defaults to "Export" */
  label?:  string;
}

export function ExportButton({ draw, filename, label = 'Export' }: ExportButtonProps) {
  const [open,      setOpen]      = useState(false);
  const [sizeIdx,   setSizeIdx]   = useState(0);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { w, h } = SIZES[sizeIdx];
      const canvas   = document.createElement('canvas');
      await draw(canvas, w, h);
      await new Promise(r => setTimeout(r, 60)); // let compositor finish
      triggerDownload(canvas, `${filename}_${w}x${h}.png`);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Export chart as PNG"
        style={{
          background:    'transparent',
          border:        '1px solid rgba(255,255,255,0.15)',
          color:         'rgba(255,255,255,0.45)',
          borderRadius:  '4px',
          padding:       '4px 10px',
          fontSize:      '11px',
          fontFamily:    FONT,
          cursor:        'pointer',
          display:       'flex',
          alignItems:    'center',
          gap:           '5px',
          letterSpacing: '0.04em',
          transition:    'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.color       = 'rgba(255,255,255,0.9)';
          b.style.borderColor = '#1d9e75';
        }}
        onMouseLeave={e => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.color       = 'rgba(255,255,255,0.45)';
          b.style.borderColor = 'rgba(255,255,255,0.15)';
        }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v7M3 5.5L6 8l3-2.5M1 9.5V11h10V9.5"
                stroke="currentColor" strokeWidth="1.3"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {label}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:     'absolute',
          top:          'calc(100% + 6px)',
          right:        0,
          background:   '#1e2128',
          border:       '1px solid rgba(255,255,255,0.12)',
          borderRadius: '6px',
          padding:      '12px 14px',
          zIndex:       200,
          minWidth:     '215px',
          boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
            marginBottom: '8px',
          }}>
            Export Size
          </div>

          {SIZES.map((size, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '5px 4px', cursor: 'pointer', borderRadius: '3px',
              fontSize:   '11.5px',
              color:      sizeIdx === i ? '#ffffff' : 'rgba(255,255,255,0.45)',
              fontWeight: sizeIdx === i ? 600 : 400,
            }}>
              <input
                type="radio" name={`export-size-${filename}`}
                checked={sizeIdx === i}
                onChange={() => setSizeIdx(i)}
                style={{ accentColor: '#1d9e75', width: '12px', height: '12px' }}
              />
              {size.label}
            </label>
          ))}

          <div style={{
            fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic',
            margin: '8px 0 12px', paddingLeft: '2px',
          }}>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              width:        '100%',
              padding:      '7px',
              background:   exporting ? 'rgba(255,255,255,0.08)' : '#1d9e75',
              color:        exporting ? 'rgba(255,255,255,0.35)' : '#ffffff',
              border:       'none',
              borderRadius: '4px',
              fontFamily:   FONT,
              fontSize:     '11px',
              fontWeight:   600,
              cursor:       exporting ? 'not-allowed' : 'pointer',
              letterSpacing:'0.06em',
              textTransform:'uppercase',
              transition:   'background 0.15s',
            }}
          >
            {exporting ? 'Generating…' : 'Download PNG'}
          </button>
        </div>
      )}
    </div>
  );
}