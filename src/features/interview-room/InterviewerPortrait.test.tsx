import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  createPortraitModel,
  InterviewerPortrait,
  portraitSourceAfterError,
  reducePortraitModel,
} from './InterviewerPortrait';

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

  it('keeps the current portrait mounted until the keyed target has loaded, then crossfades', () => {
    const initial = createPortraitModel('listening');
    const preloading = reducePortraitModel(initial, { type: 'target', state: 'thinking' });

    expect(preloading.current?.source).toBe('/interviewer/listening.webp');
    expect(preloading.pending?.source).toBe('/interviewer/thinking.webp');
    expect(preloading.pending?.key).not.toBe(preloading.current?.key);
    expect(preloading.previous).toBeNull();

    const crossfading = reducePortraitModel(preloading, { type: 'loaded', key: preloading.pending!.key });
    expect(crossfading.current?.source).toBe('/interviewer/thinking.webp');
    expect(crossfading.previous?.source).toBe('/interviewer/listening.webp');

    const settled = reducePortraitModel(crossfading, { type: 'settled', key: crossfading.current!.key });
    expect(settled.previous).toBeNull();
  });

  it('preloads the base fallback after a target error without discarding the visible current layer', () => {
    const initial = createPortraitModel('thinking');
    const preloading = reducePortraitModel(initial, { type: 'target', state: 'listening' });
    const failed = reducePortraitModel(preloading, {
      type: 'failed',
      key: preloading.pending!.key,
      source: '/interviewer/listening.webp',
    });

    expect(failed.current?.source).toBe('/interviewer/thinking.webp');
    expect(failed.pending?.source).toBe('/interviewer/base.webp');
    expect(failed.pending?.key).not.toBe(preloading.pending?.key);
  });

  it('keeps the speaking portrait visible when its optional base animation layer fails', () => {
    const speaking = createPortraitModel('speaking');
    const failed = reducePortraitModel(speaking, { type: 'overlay-failed', key: speaking.current!.key, source: '/interviewer/base.webp' });

    expect(failed.current?.source).toBe('/interviewer/speaking.webp');
    expect(failed.failedOverlayKeys.has(speaking.current!.key)).toBe(true);
  });

  it('queues a loaded C until the active A to B transition settles', () => {
    const initial = createPortraitModel('listening');
    const loadingB = reducePortraitModel(initial, { type: 'target', state: 'thinking' });
    const transitionAB = reducePortraitModel(loadingB, { type: 'loaded', key: loadingB.pending!.key });
    const loadingC = reducePortraitModel(transitionAB, { type: 'target', state: 'speaking' });
    const queuedC = reducePortraitModel(loadingC, { type: 'loaded', key: loadingC.pending!.key });

    expect(queuedC.previous?.source).toBe('/interviewer/listening.webp');
    expect(queuedC.current?.source).toBe('/interviewer/thinking.webp');
    expect(queuedC.pending).toMatchObject({ source: '/interviewer/speaking.webp', loaded: true });

    const transitionBC = reducePortraitModel(queuedC, { type: 'settled', key: queuedC.current!.key });
    expect(transitionBC.previous?.source).toBe('/interviewer/thinking.webp');
    expect(transitionBC.current?.source).toBe('/interviewer/speaking.webp');
    expect(transitionBC.pending).toBeNull();
  });

  it('ignores stale load and error callbacks after a newer pending intent replaces them', () => {
    const initial = createPortraitModel('listening');
    const pendingB = reducePortraitModel(initial, { type: 'target', state: 'thinking' });
    const staleKey = pendingB.pending!.key;
    const pendingC = reducePortraitModel(pendingB, { type: 'target', state: 'speaking' });

    expect(reducePortraitModel(pendingC, { type: 'loaded', key: staleKey })).toBe(pendingC);
    expect(reducePortraitModel(pendingC, {
      type: 'failed',
      key: staleKey,
      source: '/interviewer/thinking.webp',
    })).toBe(pendingC);
  });

  it('enters a labelled terminal placeholder after target and base both fail, then recovers on a later successful target', () => {
    const initial = createPortraitModel('thinking');
    const target = reducePortraitModel(initial, { type: 'target', state: 'listening' });
    const fallback = reducePortraitModel(target, {
      type: 'failed', key: target.pending!.key, source: '/interviewer/listening.webp',
    });
    const terminal = reducePortraitModel(fallback, {
      type: 'failed', key: fallback.pending!.key, source: '/interviewer/base.webp',
    });

    expect(terminal).toMatchObject({ current: null, previous: null, pending: null, placeholderState: 'listening' });

    const recovering = reducePortraitModel(terminal, { type: 'target', state: 'listening' });
    expect(recovering.pending?.source).toBe('/interviewer/listening.webp');
    const recovered = reducePortraitModel(recovering, { type: 'loaded', key: recovering.pending!.key });
    expect(recovered.current?.source).toBe('/interviewer/listening.webp');
    expect(recovered.placeholderState).toBeNull();
  });

  it('attempts a base-state image after the speaking overlay base failed, then uses placeholder if that request fails', () => {
    const speaking = createPortraitModel('speaking');
    const overlayFailed = reducePortraitModel(speaking, { type: 'overlay-failed', key: speaking.current!.key, source: '/interviewer/base.webp' });
    const baseRequested = reducePortraitModel(overlayFailed, { type: 'target', state: 'paused' });

    expect(baseRequested.pending?.source).toBe('/interviewer/base.webp');
    const terminal = reducePortraitModel(baseRequested, {
      type: 'failed', key: baseRequested.pending!.key, source: '/interviewer/base.webp',
    });
    expect(terminal).toMatchObject({ current: null, previous: null, placeholderState: 'paused' });
  });
});
