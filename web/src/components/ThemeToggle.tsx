import React from 'react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../hooks/useTheme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex items-center justify-center p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      aria-label="Toggle theme"
    >
      <SunIcon className={`h-5 w-5 text-yellow-500 transition-all ${theme === 'light' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'} absolute`} />
      <MoonIcon className={`h-5 w-5 text-blue-500 transition-all ${theme === 'dark' ? 'scale-100 rotate-0' : 'scale-0 -rotate-90'} absolute`} />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};