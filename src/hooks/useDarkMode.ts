import { useTheme } from 'next-themes';

export function useDarkMode() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  
  const isDark = resolvedTheme === 'dark';
  
  const toggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return { isDark, toggle, theme, setTheme };
}
