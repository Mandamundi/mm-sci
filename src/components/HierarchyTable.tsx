import { useMemo } from 'react';
import { motion } from 'motion/react';
import { HierarchyJson, RatingsJson } from '../types';

interface HierarchyTableProps {
  hierarchy: HierarchyJson;
  ratings: RatingsJson;
  selectedCountry: string;
}

export function HierarchyTable({ hierarchy, ratings, selectedCountry }: HierarchyTableProps) {
  const currentRatings = ratings[selectedCountry]?.latest;

  const { rows, spMatch, moodysMatch, fitchMatch } = useMemo(() => {
    let spMatch = -1;
    let moodysMatch = -1;
    let fitchMatch = -1;

    if (currentRatings) {
      hierarchy.forEach((row, i) => {
        if (currentRatings['S&P']?.rating === row.sp) spMatch = i;
        if (currentRatings["Moody's"]?.rating === row.moodys) moodysMatch = i;
        if (currentRatings['Fitch']?.rating === row.fitch) fitchMatch = i;
      });
    }

    // Group by grade_group
    const grouped: any[] = [];
    let currentGroup = '';
    let groupStartIdx = 0;

    hierarchy.forEach((row, i) => {
      if (row.grade_group !== currentGroup) {
        if (currentGroup !== '') {
          grouped[groupStartIdx].rowSpan = i - groupStartIdx;
        }
        currentGroup = row.grade_group;
        groupStartIdx = i;
        grouped.push({ ...row, isFirstInGroup: true, originalIndex: i });
      } else {
        grouped.push({ ...row, isFirstInGroup: false, originalIndex: i });
      }
    });
    if (grouped.length > 0) {
      grouped[groupStartIdx].rowSpan = hierarchy.length - groupStartIdx;
    }

    return { rows: grouped, spMatch, moodysMatch, fitchMatch };
  }, [hierarchy, currentRatings]);

  const renderCell = (agency: 'S&P' | "Moody's" | 'Fitch', rating: string, matchIdx: number, rowIdx: number, isIG: boolean) => {
    const isMatch = matchIdx === rowIdx;
    const isAdjacent = Math.abs(matchIdx - rowIdx) === 1;
    
    const outlook = currentRatings?.[agency]?.outlook;
    let outlookColor = 'text-gray-500';
    if (outlook === 'Positive') outlookColor = 'text-[#1d9e75]';
    if (outlook === 'Negative') outlookColor = 'text-[#e24b4a]';
    if (outlook === 'Watch') outlookColor = 'text-[#facc15]';

    return (
      <td className={`px-2 py-1.5 text-center relative ${isAdjacent ? 'opacity-45' : ''}`}>
        {isMatch ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full font-bold text-white ${isIG ? 'bg-[#1d9e75]' : 'bg-[#e24b4a]'}`}
          >
            {rating}
          </motion.div>
        ) : (
          <span className="text-gray-600 dark:text-gray-400 font-medium">{rating}</span>
        )}
        {isMatch && outlook && (
          <span className={`absolute ml-1 text-[10px] font-medium ${outlookColor} top-1/2 -translate-y-1/2`}>
            {outlook}
          </span>
        )}
      </td>
    );
  };

  return (
    <div className="bg-white dark:bg-[#16181c] rounded-xl border border-gray-200 dark:border-[#2a2d35] shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2d35]">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Current Rating Status — {selectedCountry}</h2>
      </div>
      
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-gray-500 dark:text-[#6b7280] border-b border-gray-200 dark:border-[#2a2d35]">
            <tr>
              <th className="px-4 py-2 font-medium">Grade</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-2 py-2 font-medium text-center">S&P</th>
              <th className="px-2 py-2 font-medium text-center">Moody's</th>
              <th className="px-2 py-2 font-medium text-center">Fitch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isIG = row.grade_group === 'Investment Grade';
              return (
                <tr key={row.originalIndex} className="border-b border-gray-100 dark:border-[#1e2025]/50">
                  {row.isFirstInGroup && (
                    <td 
                      rowSpan={row.rowSpan} 
                      className={`px-4 py-2 font-medium text-gray-700 dark:text-gray-300 align-middle border-l-2 ${isIG ? 'border-[#1d9e75]' : 'border-[#facc15]'}`}
                    >
                      {row.grade_group}
                    </td>
                  )}
                  <td className="px-4 py-1.5 text-gray-600 dark:text-gray-400 text-xs">{row.description}</td>
                  {renderCell('S&P', row.sp, spMatch, row.originalIndex, isIG)}
                  {renderCell("Moody's", row.moodys, moodysMatch, row.originalIndex, isIG)}
                  {renderCell('Fitch', row.fitch, fitchMatch, row.originalIndex, isIG)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-[#2a2d35] grid grid-cols-3 gap-4 bg-gray-50 dark:bg-[#0e0f11]">
        {(['S&P', "Moody's", 'Fitch'] as const).map(agency => {
          const data = currentRatings?.[agency];
          return (
            <div key={agency} className="bg-white dark:bg-[#16181c] p-3 rounded-lg border border-gray-200 dark:border-[#2a2d35] flex flex-col items-center justify-center text-center">
              <span className="text-xs text-gray-500 dark:text-[#6b7280] font-medium mb-1">{agency}</span>
              {data ? (
                <>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{data.rating}</span>
                  <span className="text-xs text-gray-500 dark:text-[#6b7280] mt-1">{data.outlook} · {data.date}</span>
                </>
              ) : (
                <span className="text-sm text-gray-400 dark:text-gray-600">No rating</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
