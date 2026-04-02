import { getScoreColor } from '../utils/scoreColor';
import { useDarkMode } from '../hooks/useDarkMode';

export function ScoreCell({ score }: { score: number | null }) {
  const { isDark } = useDarkMode();
  const color = getScoreColor(score, isDark);

  return (
    <div
      className="flex items-center justify-center w-full h-full min-h-[28px] text-xs font-medium rounded-sm"
      style={{ backgroundColor: color.fill, color: color.text }}
    >
      {score !== null ? score.toFixed(1) : '—'}
    </div>
  );
}
