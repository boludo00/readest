import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import { TOCItem, SectionItem } from '@/libs/document';
import { ViewSettings, ProgressBarStyle, ProgressBarColorScheme, ChapterMarkerStyle } from '@/types/book';

interface ChapterMarker {
  position: number;
  label: string;
  href: string;
}

interface ProgressBarProps {
  value: number;
  onChange: (value: number) => void;
  toc?: TOCItem[];
  sections?: SectionItem[];
  currentSectionHref?: string;
  viewSettings?: ViewSettings;
  disabled?: boolean;
  rtl?: boolean;
  label: string;
  compact?: boolean;
}

const getProgressColor = (
  scheme: ProgressBarColorScheme,
  customColor: string,
): string => {
  switch (scheme) {
    case 'theme-accent':
      return 'oklch(var(--a))';
    case 'theme-primary':
      return 'oklch(var(--p))';
    case 'custom':
      return customColor || 'oklch(var(--a))';
    default:
      return 'oklch(var(--a))';
  }
};

const flattenToc = (items: TOCItem[], depth = 0): TOCItem[] => {
  const result: TOCItem[] = [];
  for (const item of items) {
    if (depth === 0) {
      result.push(item);
    }
    if (item.subitems && depth < 1) {
      result.push(...flattenToc(item.subitems, depth + 1));
    }
  }
  return result;
};

const useChapterMarkers = (
  toc: TOCItem[] | undefined,
  sections: SectionItem[] | undefined,
  showMarkers: boolean,
): ChapterMarker[] => {
  return useMemo(() => {
    if (!showMarkers || !toc || !sections || toc.length === 0 || sections.length === 0) {
      return [];
    }

    const totalSize = sections.reduce((acc, s) => acc + (s.linear !== 'no' ? s.size : 0), 0);
    if (totalSize === 0) return [];

    const sectionPositions = new Map<string, number>();
    let cumulativeSize = 0;
    for (const section of sections) {
      if (section.linear !== 'no') {
        sectionPositions.set(section.id, (cumulativeSize / totalSize) * 100);
        cumulativeSize += section.size;
      }
    }

    const flatToc = flattenToc(toc);
    const markers: ChapterMarker[] = [];
    const seenPositions = new Set<number>();

    for (const item of flatToc) {
      if (!item.href) continue;
      const sectionId = item.href.split('#')[0] || item.href;
      const position = sectionPositions.get(sectionId);
      if (position !== undefined && position > 0 && position < 100) {
        const roundedPos = Math.round(position * 10) / 10;
        if (!seenPositions.has(roundedPos)) {
          seenPositions.add(roundedPos);
          markers.push({
            position: roundedPos,
            label: item.label,
            href: item.href,
          });
        }
      }
    }

    return markers.slice(0, 50);
  }, [toc, sections, showMarkers]);
};

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  onChange,
  toc,
  sections,
  viewSettings,
  disabled = false,
  rtl = false,
  label,
  compact = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState<ChapterMarker | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const style = viewSettings?.progressBarStyle || 'filled';
  const colorScheme = viewSettings?.progressBarColorScheme || 'theme-accent';
  const customColor = viewSettings?.progressBarCustomColor || '';
  const heightPx = viewSettings?.progressBarHeightPx || 4;
  const showChapterMarkers = viewSettings?.progressBarShowChapterMarkers ?? true;
  const markerStyle = viewSettings?.progressBarMarkerStyle || 'tick';
  const isEink = viewSettings?.isEink || false;

  const markers = useChapterMarkers(toc, sections, showChapterMarkers && markerStyle !== 'none');

  const progressColor = getProgressColor(colorScheme, customColor);

  const handlePositionChange = useCallback(
    (clientX: number) => {
      if (!trackRef.current || disabled) return;
      const rect = trackRef.current.getBoundingClientRect();
      let position = ((clientX - rect.left) / rect.width) * 100;
      if (rtl) {
        position = 100 - position;
      }
      position = Math.max(0, Math.min(100, position));
      onChange(position);
    },
    [onChange, rtl, disabled],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      setIsDragging(true);
      handlePositionChange(e.clientX);
    },
    [handlePositionChange, disabled],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        handlePositionChange(e.clientX);
      }
    },
    [isDragging, handlePositionChange],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTrackHover = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      let position = ((e.clientX - rect.left) / rect.width) * 100;
      if (rtl) {
        position = 100 - position;
      }
      position = Math.max(0, Math.min(100, position));
      setHoverPosition(position);

      const nearbyMarker = markers.find(
        (m) => Math.abs(m.position - position) < 3,
      );
      setHoveredMarker(nearbyMarker || null);
    },
    [rtl, markers],
  );

  const handleTrackLeave = useCallback(() => {
    setHoverPosition(null);
    setHoveredMarker(null);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const getTrackHeight = (barStyle: ProgressBarStyle): number => {
    switch (barStyle) {
      case 'thin':
        return Math.max(2, heightPx - 2);
      case 'filled':
      case 'gradient':
        return heightPx;
      default:
        return heightPx;
    }
  };

  const getMarkerElement = (
    marker: ChapterMarker,
    markerStyleType: ChapterMarkerStyle,
    trackHeight: number,
  ): React.ReactNode => {
    const isHovered = hoveredMarker?.href === marker.href;
    const baseClasses = clsx(
      'absolute top-1/2 -translate-y-1/2',
      !isEink && 'not-eink:transition-opacity not-eink:duration-150',
    );

    const pos = rtl ? 100 - marker.position : marker.position;

    switch (markerStyleType) {
      case 'tick':
        return (
          <div
            key={marker.href}
            className={baseClasses}
            style={{
              left: `${pos}%`,
              width: '1px',
              height: `${trackHeight + 6}px`,
              backgroundColor: isHovered
                ? 'oklch(var(--bc))'
                : 'oklch(var(--bc) / 0.4)',
            }}
          />
        );
      case 'dot':
        return (
          <div
            key={marker.href}
            className={clsx(baseClasses, 'rounded-full')}
            style={{
              left: `${pos}%`,
              transform: 'translate(-50%, -50%)',
              width: `${Math.max(4, trackHeight - 2)}px`,
              height: `${Math.max(4, trackHeight - 2)}px`,
              backgroundColor: isHovered
                ? 'oklch(var(--bc))'
                : 'oklch(var(--bc) / 0.5)',
            }}
          />
        );
      case 'line':
        return (
          <div
            key={marker.href}
            className={baseClasses}
            style={{
              left: `${pos}%`,
              width: '2px',
              height: `${trackHeight}px`,
              backgroundColor: isHovered
                ? 'oklch(var(--bc))'
                : 'oklch(var(--bc) / 0.3)',
            }}
          />
        );
      default:
        return null;
    }
  };

  const trackHeight = getTrackHeight(style);
  const fillPercentage = Math.max(0, Math.min(100, value));

  const trackClasses = clsx(
    'relative w-full rounded-full cursor-pointer select-none',
    disabled && 'opacity-50 cursor-not-allowed',
  );

  const backgroundStyle: React.CSSProperties = {
    height: `${trackHeight}px`,
    backgroundColor: 'oklch(var(--b3) / 0.4)',
  };

  const getFillStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      height: `${trackHeight}px`,
      borderRadius: '9999px',
      [rtl ? 'right' : 'left']: 0,
      width: `${fillPercentage}%`,
    };

    if (style === 'gradient') {
      const gradientDir = rtl ? 'to left' : 'to right';
      base.background = `linear-gradient(${gradientDir}, oklch(var(--p)), ${progressColor})`;
    } else {
      base.backgroundColor = progressColor;
    }

    if (!isEink) {
      base.transition = isDragging ? 'none' : 'width 150ms ease-out';
    }

    return base;
  };

  return (
    <div
      className={clsx('flex-1 min-w-0', compact ? 'mx-1' : 'mx-2')}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)}%`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(Math.min(100, value + step));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(Math.max(0, value - step));
        } else if (e.key === 'Home') {
          e.preventDefault();
          onChange(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          onChange(100);
        }
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={trackRef}
        className={trackClasses}
        style={backgroundStyle}
        onMouseDown={handleMouseDown}
        onMouseMove={handleTrackHover}
        onMouseLeave={handleTrackLeave}
      >
        <div className="rounded-full overflow-hidden" style={backgroundStyle}>
          <div style={getFillStyle()} />
        </div>

        {markers.map((marker) => getMarkerElement(marker, markerStyle, trackHeight))}

        {hoveredMarker && hoverPosition !== null && (
          <div
            className={clsx(
              'absolute bottom-full mb-2 px-2 py-1 rounded text-xs',
              'bg-base-300 text-base-content shadow-lg',
              'whitespace-nowrap max-w-[200px] truncate',
              'pointer-events-none z-50',
            )}
            style={{
              left: `${rtl ? 100 - hoveredMarker.position : hoveredMarker.position}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {hoveredMarker.label}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
