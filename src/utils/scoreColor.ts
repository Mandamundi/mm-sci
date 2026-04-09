export function getScoreColor(score: number | null, isDark: boolean) {
  if (score === null) return isDark ? { fill: '#374151', text: '#9ca3af' } : { fill: '#e2e8f0', text: '#6b7280' };

  // AAA
  if (score >= 90) return isDark ? { fill: '#085041', text: '#5dcaa5' } : { fill: '#15803d', text: '#ffffff' };
  // AA
  if (score >= 75) return isDark ? { fill: '#0f6e56', text: '#9fe1cb' } : { fill: '#16a34a', text: '#ffffff' };
  // A
  if (score >= 60) return isDark ? { fill: '#1d9e75', text: '#e1f5ee' } : { fill: '#65a30d', text: '#ffffff' };
  // BBB
  if (score >= 55) return isDark ? { fill: '#ba7517', text: '#fac775' } : { fill: '#ca8a04', text: '#ffffff' };
  // BB
  if (score >= 45) return isDark ? { fill: '#854f0b', text: '#ef9f27' } : { fill: '#d97706', text: '#ffffff' };
  // B
  if (score >= 30) return isDark ? { fill: '#993c1d', text: '#f0997b' } : { fill: '#ea580c', text: '#ffffff' };
  
  // CCC (Added a new threshold here, e.g., >= 15)
  if (score >= 15) return isDark ? { fill: '#991b1b', text: '#f7c1c1' } : { fill: '#dc2626', text: '#ffffff' };

  // D (Anything below the CCC threshold)
  // This uses the darkest red from your SCI_LEGEND_ITEMS
  return isDark ? { fill: '#7f1d1d', text: '#fca5a5' } : { fill: '#b91c1c', text: '#ffffff' };
}