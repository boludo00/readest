'use client';

import clsx from 'clsx';
import { useRouter, usePathname } from 'next/navigation';
import { PiBooks, PiChartBar, PiUserCircle } from 'react-icons/pi';

import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useThemeStore } from '@/store/themeStore';

const BottomNav: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const _ = useTranslation();
  const iconSize = useResponsiveSize(22);
  const { safeAreaInsets: insets } = useThemeStore();

  const tabs = [
    { path: '/library', icon: PiBooks, label: _('Library') },
    { path: '/statistics', icon: PiChartBar, label: _('Statistics') },
    { path: '/user', icon: PiUserCircle, label: _('Profile') },
  ];

  const isActive = (tabPath: string) => {
    if (tabPath === '/library') {
      return pathname === '/library' || pathname === '/';
    }
    return pathname?.startsWith(tabPath);
  };

  return (
    <nav
      className='bg-base-200 border-base-300 fixed bottom-0 left-0 right-0 z-50 border-t'
      style={{ paddingBottom: `${insets?.bottom || 0}px` }}
    >
      <div className='flex h-14 w-full'>
        {tabs.map((tab) => (
          <button
            key={tab.path}
            className={clsx(
              'relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
              isActive(tab.path) ? 'text-primary' : 'text-base-content/50',
            )}
            onClick={() => router.push(tab.path)}
            aria-label={tab.label}
          >
            {isActive(tab.path) && (
              <span className='bg-primary absolute left-1/2 top-0 h-0.5 w-10 -translate-x-1/2 rounded-full' />
            )}
            <tab.icon size={iconSize} />
            <span className={clsx('text-xs', isActive(tab.path) ? 'font-semibold' : 'font-normal')}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
