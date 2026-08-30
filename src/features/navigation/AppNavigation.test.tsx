import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AppNavigation } from './AppNavigation';

describe('AppNavigation', () => {
  it('marks the current stable route and keeps every destination visible', () => {
    const html = renderToStaticMarkup(<AppNavigation active="history" />);

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/interview"');
    expect(html).toContain('href="/history"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('面试记录');
  });

  it('renders a labelled safe exit instead of raw destination links in its compact room variant', () => {
    const html = renderToStaticMarkup(<AppNavigation active="interview" compact />);

    expect(html).toContain('app-navigation-compact');
    expect(html).toContain('结束并离开');
    expect(html).not.toContain('href="/history"');
  });
});
