'use client';
import { Moon, Sun } from 'lucide-react';
import { useThemePreference } from '@/components/theme-provider';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useThemePreference();
  return <button type="button" className={`icon-button theme-toggle ${className}`} onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={16}/> : <Sun size={16}/>}</button>;
}
