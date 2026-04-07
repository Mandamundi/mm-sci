import { useTheme } from 'next-themes';
import { startTransition } from 'react';

export function useDarkMode() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  
  const isDark = resolvedTheme === 'dark';
  
  const toggle = () => {
    startTransition(() => {
      setTheme(isDark ? 'light' : 'dark');
    });
  };

  return { isDark, toggle, theme, setTheme };
}