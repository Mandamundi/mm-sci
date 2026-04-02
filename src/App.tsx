import { useState } from 'react';
import { useData } from './hooks/useData';
import { Navbar } from './components/Navbar';
import { MapSection } from './components/MapSection';
import { TimeSeriesSection } from './components/TimeSeriesSection';
import { CountryTable } from './components/CountryTable';
import { CountryDetail } from './components/CountryDetail';
import { HierarchyTable } from './components/HierarchyTable';
import { ThemeProvider } from 'next-themes';

function Dashboard() {
  const { sci, market, snapshot, ratings, hierarchy, meta, loading, error } = useData();
  const [selectedCountry, setSelectedCountry] = useState('Germany');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0e0f11] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-[#1d9e75] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error || !sci || !market || !snapshot || !ratings || !hierarchy || !meta) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0e0f11] flex items-center justify-center">
        <div className="bg-white dark:bg-[#16181c] p-6 rounded-xl border border-red-200 dark:border-red-900/30 text-center max-w-md">
          <h2 className="text-red-600 dark:text-red-400 font-bold text-lg mb-2">Error Loading Data</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">{error?.message || 'Missing required data files.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0e0f11] text-gray-900 dark:text-gray-100 font-sans pb-20">
      <Navbar lastUpdated={meta.last_updated} />
      
      <main className="pt-20 px-4 sm:px-6 max-w-[1600px] mx-auto flex flex-col gap-6">
        <MapSection snapshot={snapshot} />
        
        <TimeSeriesSection sciData={sci} marketData={market} />
        
        <CountryTable 
          sciData={sci} 
          marketData={market} 
          onSelectCountry={(c) => {
            setSelectedCountry(c);
            document.getElementById('country-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }} 
        />
        
        <div id="country-detail" className="scroll-mt-20">
          <CountryDetail 
            sciData={sci} 
            marketData={market} 
            selectedCountry={selectedCountry} 
            onSelectCountry={setSelectedCountry} 
          />
        </div>
        
        <HierarchyTable 
          hierarchy={hierarchy} 
          ratings={ratings} 
          selectedCountry={selectedCountry} 
        />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <Dashboard />
    </ThemeProvider>
  );
}
