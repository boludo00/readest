'use client';

import { useState, useEffect } from 'react';

export interface ThemeColors {
  primary: string;
  primaryContent: string;
  baseContent: string;
  base100: string;
}

const DEFAULT_COLORS: ThemeColors = {
  primary: '#6366f1',
  primaryContent: '#ffffff',
  baseContent: '#1f2937',
  base100: '#ffffff',
};

/**
 * Hook to get computed theme colors from DaisyUI.
 * Creates a hidden DOM element, applies DaisyUI classes, and reads computed styles.
 * Watches for data-theme attribute changes to update colors dynamically.
 */
export const useThemeColors = (): ThemeColors => {
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_COLORS);

  useEffect(() => {
    const updateColors = () => {
      if (typeof window === 'undefined') return;

      // Get the actual computed colors from a test element
      const testEl = document.createElement('div');
      testEl.style.display = 'none';
      document.body.appendChild(testEl);

      testEl.className = 'bg-primary';
      const primary = getComputedStyle(testEl).backgroundColor;

      testEl.className = 'bg-primary-content';
      const primaryContent = getComputedStyle(testEl).backgroundColor;

      testEl.className = 'bg-base-content';
      const baseContent = getComputedStyle(testEl).backgroundColor;

      testEl.className = 'bg-base-100';
      const base100 = getComputedStyle(testEl).backgroundColor;

      document.body.removeChild(testEl);

      setColors({
        primary: primary || DEFAULT_COLORS.primary,
        primaryContent: primaryContent || DEFAULT_COLORS.primaryContent,
        baseContent: baseContent || DEFAULT_COLORS.baseContent,
        base100: base100 || DEFAULT_COLORS.base100,
      });
    };

    updateColors();

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          updateColors();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return colors;
};

/**
 * Create an rgba color string with the specified opacity.
 * Handles rgb/rgba format colors returned by getComputedStyle.
 */
export const withOpacity = (color: string, opacity: number): string => {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
  }
  return color;
};
