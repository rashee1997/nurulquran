'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'badge';
  id?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  variant = 'icon',
  id = 'theme-toggle-btn',
}) => {
  const { resolvedTheme, toggleTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <button
        id={id}
        type="button"
        className={`p-2 rounded-xl border border-border text-muted-foreground transition-colors ${className}`}
        aria-label="Toggle color theme"
        disabled
      >
        <Sun className="w-4 h-4 opacity-50" />
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  if (variant === 'badge') {
    return (
      <button
        id={id}
        type="button"
        onClick={toggleTheme}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-foreground text-xs font-semibold transition-colors shadow-2xs ${className}`}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        title={`Current: ${isDark ? 'Dark' : 'Light'} Mode. Click to switch.`}
      >
        {isDark ? (
          <>
            <Moon className="w-3.5 h-3.5 text-primary" />
            <span>Dark Mode</span>
          </>
        ) : (
          <>
            <Sun className="w-3.5 h-3.5 text-secondary" />
            <span>Light Mode</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      id={id}
      type="button"
      onClick={toggleTheme}
      className={`p-2 rounded-xl border border-border bg-surface hover:bg-surface-hover text-foreground transition-colors shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Current: ${isDark ? 'Dark' : 'Light'} Mode. Click to switch.`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-secondary-strong hover:rotate-45 transition-transform" />
      ) : (
        <Moon className="w-4 h-4 text-primary-strong hover:-rotate-12 transition-transform" />
      )}
    </button>
  );
};
