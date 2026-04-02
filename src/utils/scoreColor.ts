export function getScoreColor(score: number | null, isDark: boolean) {
  if (score === null) return isDark ? { fill: '#2a2d35', text: '#6b7280' } : { fill: '#e5e7eb', text: '#6b7280' };

  if (score >= 90) return isDark ? { fill: '#085041', text: '#5dcaa5' } : { fill: '#bbf7d0', text: '#166534' };
  if (score >= 75) return isDark ? { fill: '#0f6e56', text: '#9fe1cb' } : { fill: '#86efac', text: '#14532d' };
  if (score >= 60) return isDark ? { fill: '#1d9e75', text: '#e1f5ee' } : { fill: '#4ade80', text: '#14532d' };
  if (score >= 55) return isDark ? { fill: '#ba7517', text: '#fac775' } : { fill: '#fde047', text: '#854d0e' };
  if (score >= 45) return isDark ? { fill: '#854f0b', text: '#ef9f27' } : { fill: '#facc15', text: '#a16207' };
  if (score >= 30) return isDark ? { fill: '#993c1d', text: '#f0997b' } : { fill: '#fb923c', text: '#c2410c' };
  return isDark ? { fill: '#791f1f', text: '#f7c1c1' } : { fill: '#fca5a5', text: '#991b1b' };
}
