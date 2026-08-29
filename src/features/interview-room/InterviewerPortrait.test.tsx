import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InterviewerPortrait, portraitSourceAfterError } from './InterviewerPortrait';

describe('InterviewerPortrait', () => {
  it('uses the listening portrait while the candidate answers', () => {
    const html = renderToStaticMarkup(<InterviewerPortrait state="listening" />);

    expect(html).toContain('/interviewer/listening.webp');
    expect(html).toContain('面试官正在聆听你的回答');
  });

  it.each(['thinking', 'connecting'] as const)('uses the thinking portrait while %s', (state) => {
    const html = renderToStaticMarkup(<InterviewerPortrait state={state} />);

    expect(html).toContain('/interviewer/thinking.webp');
  });

  it('stacks base and speaking layers without making the duplicate layer accessible', () => {
    const html = renderToStaticMarkup(<InterviewerPortrait state="speaking" />);

    expect(html).toContain('/interviewer/base.webp');
    expect(html).toContain('/interviewer/speaking.webp');
    expect(html).toContain('interviewer-portrait__layer--speaking');
    expect(html).toContain('alt=""');
  });

  it('preloads the current speaking state instead of the resting layer', () => {
    const html = renderToStaticMarkup(<InterviewerPortrait state="speaking" />);

    expect(html).toContain('<link rel="preload" as="image" href="/interviewer/speaking.webp"');
    expect(html).not.toContain('<link rel="preload" as="image" href="/interviewer/base.webp"');
  });

  it('falls back to the base portrait when a state image fails', () => {
    expect(portraitSourceAfterError('/interviewer/listening.webp')).toBe('/interviewer/base.webp');
    expect(portraitSourceAfterError('/interviewer/base.webp')).toBeNull();
  });

  it('marks animated layers so reduced motion can disable alternation', () => {
    const html = renderToStaticMarkup(<InterviewerPortrait state="speaking" />);

    expect(html).toContain('interviewer-portrait--motion-safe');
    expect(html).toContain('interviewer-portrait__layer--speaking');
  });
});
