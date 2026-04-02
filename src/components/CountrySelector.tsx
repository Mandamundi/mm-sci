import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface CountrySelectorProps {
  countries: string[];
  selected: string;
  onChange: (country: string) => void;
}

export function CountrySelector({ countries, selected, onChange }: CountrySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = countries.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-48 px-3 py-1.5 text-sm bg-white dark:bg-[#0e0f11] border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-sm text-gray-900 dark:text-gray-100"
      >
        <span className="truncate">{selected}</span>
        <ChevronDown size={16} className="text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-64 mt-1 bg-white dark:bg-[#16181c] border border-gray-200 dark:border-[#2a2d35] rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-200 dark:border-[#2a2d35]">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-gray-50 dark:bg-[#0e0f11] border border-gray-200 dark:border-[#2a2d35] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1d9e75] text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {filtered.map(country => (
              <button
                key={country}
                onClick={() => {
                  onChange(country);
                  setIsOpen(false);
                  setSearch('');
                }}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selected === country 
                    ? 'bg-[#1d9e75]/10 text-[#1d9e75] font-medium' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a2d35]'
                }`}
              >
                {country}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">No countries found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
