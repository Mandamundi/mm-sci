import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { motion } from 'motion/react';
import { format } from 'date-fns';

export function Navbar({ lastUpdated }: { lastUpdated?: string }) {
  const { isDark, toggle } = useDarkMode();

  return (
    <nav className="fixed top-0 left-0 right-0 h-14 z-50 bg-white/80 dark:bg-[#0e0f11]/80 backdrop-blur-md border-b border-gray-200 dark:border-[#2a2d35] flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2">
        {/* Updated src to .svg */}
        <img 
          src="/favicon.svg" 
          alt="MM Logo" 
          className="w-8 h-8 object-contain" 
        />
        
        {/* Remember: If your SVG already has the letters "MM" in it, 
            you can delete this next line! */}
        <span className="text-[#dff3ef] font-bold text-lg">MM</span>
        
        <span className="text-gray-900 dark:text-white font-medium hidden sm:inline">
          Sovereign Credit Index
        </span>
      </div>
      
      <div className="flex items-center gap-4">
        {lastUpdated && (
          <span className="text-xs text-gray-500 dark:text-[#6b7280] hidden sm:inline">
            Last updated: {format(new Date(lastUpdated), 'MMM d, yyyy')}
          </span>
        )}
        <button
          onClick={toggle}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
        >
          <motion.div
            initial={false}
            animate={{ rotate: isDark ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 10 }}
          >
            {isDark ? <Moon size={18} /> : <Sun size={18} />}
          </motion.div>
        </button>
      </div>
    </nav>
  );
}