import { Download } from 'lucide-react';
import { exportPanel } from '../utils/exportPanel';

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLElement | null>;
  filename: string;
}

export function ExportButton({ targetRef, filename }: ExportButtonProps) {
  return (
    <button
      onClick={() => exportPanel(targetRef, filename)}
      className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
      title="Export to PNG"
    >
      <Download size={16} />
    </button>
  );
}
