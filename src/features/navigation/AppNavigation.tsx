'use client';

import Link from 'next/link';

type NavigationSection = 'home' | 'interview' | 'history';

const destinations: Array<{ section: NavigationSection; href: '/' | '/interview' | '/history'; label: string }> = [
  { section: 'home', href: '/', label: '首页' },
  { section: 'interview', href: '/interview', label: '模拟面试' },
  { section: 'history', href: '/history', label: '面试记录' },
];

export function AppNavigation({ active, compact = false, onAttemptLeave }: {
  active: NavigationSection;
  compact?: boolean;
  onAttemptLeave?: () => void;
}) {
  if (compact) {
    return <nav aria-label="主导航" className="app-navigation app-navigation-compact">
      <span className="app-navigation-brand">AI 模拟面试</span>
      <button type="button" className="app-navigation-safe-exit" onClick={onAttemptLeave}>结束并离开</button>
    </nav>;
  }

  return <nav aria-label="主导航" className="app-navigation">
    <span className="app-navigation-brand">AI 模拟面试</span>
    <div className="app-navigation-links">
      {destinations.map((destination) => <Link key={destination.href} href={destination.href} aria-current={active === destination.section ? 'page' : undefined}>{destination.label}</Link>)}
    </div>
  </nav>;
}
