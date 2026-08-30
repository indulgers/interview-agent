import { expect, test, type Page } from '@playwright/test';

type TestEvent = Record<string, unknown> & { type: string };
type Task4Control = {
  emit(event: TestEvent): Promise<void>;
  deferNextConnect(): void;
  resolveNextConnect(): void;
  connectAttemptCount(): number;
  connectionCount(): number;
  deferNextSubmit(): void;
  rejectNextSubmit(): void;
  submitAnswerCount(): number;
};

function control(page: Page) {
  return page.evaluateHandle(() => (window as unknown as { __interviewE2E: Task4Control }).__interviewE2E);
}

async function prepareDevices(page: Page) {
  await page.goto('/interview');
  await expect(page.getByText('设备就绪后显示本机画面')).toBeVisible();
  await expect(page.locator('.device-preview video')).toHaveCount(0);
  await page.getByRole('button', { name: '检查设备' }).click();
  const preview = page.locator('video[aria-label="本机摄像头画面"]');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((video) => {
    const stream = (video as HTMLVideoElement).srcObject as MediaStream | null;
    return stream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
  })).toBe(true);
  await expect(page.getByRole('button', { name: '开始 45 分钟面试' })).toBeEnabled({ timeout: 8_000 });
}

async function start(page: Page) {
  await prepareDevices(page);
  await page.getByRole('button', { name: '开始 45 分钟面试' }).click();
  await expect(page.getByText('AI 技术面试官', { exact: true })).toBeVisible();
}

test.describe('Task 4 behavior', () => {
  test('binds the real preview and guards duplicate starts while connection is pending', async ({ page }) => {
    await prepareDevices(page);
    const handle = await control(page);
    await handle.evaluate((value) => value.deferNextConnect());
    const startButton = page.getByRole('button', { name: '开始 45 分钟面试' });
    await startButton.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });

    await expect(page.getByRole('button', { name: '正在连接…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '正在连接…' })).toHaveAttribute('aria-busy', 'true');
    expect(await handle.evaluate((value) => value.connectAttemptCount())).toBe(1);

    await handle.evaluate((value) => value.resolveNextConnect());
    await expect(page.getByText('AI 技术面试官', { exact: true })).toBeVisible();
    expect(await handle.evaluate((value) => value.connectionCount())).toBe(1);
  });

  test('keeps keyed old/new layers through load and the 200ms crossfade, then survives base-layer failure', async ({ page }) => {
    await start(page);
    let releaseSpeaking!: () => void;
    const speakingGate = new Promise<void>((resolve) => { releaseSpeaking = resolve; });
    await page.route('**/interviewer/speaking.webp', async (route) => {
      await speakingGate;
      await route.continue();
    });
    await page.route('**/interviewer/base.webp', (route) => route.fulfill({ status: 404, body: 'missing' }));
    const frozenCrossfade = await page.addStyleTag({ content: '.interviewer-portrait__layer--entering,.interviewer-portrait__layer--leaving{animation-duration:200ms!important;animation-delay:-100ms!important;animation-play-state:paused!important}' });

    await page.evaluate(async () => {
      await (window as unknown as { __interviewE2E: Task4Control }).__interviewE2E.emit({ type: 'assistant_speech', state: 'started', at: Date.now() });
    });
    const oldLayer = page.locator('.interviewer-portrait__layer--current');
    const pending = page.locator('.interviewer-portrait__layer--pending');
    await expect(oldLayer).toHaveAttribute('data-portrait-source', '/interviewer/listening.webp');
    await expect(pending).toHaveAttribute('data-portrait-source', '/interviewer/speaking.webp');
    expect(await oldLayer.getAttribute('data-portrait-key')).not.toBe(await pending.getAttribute('data-portrait-key'));

    releaseSpeaking();
    const entering = page.locator('.interviewer-portrait__layer--entering');
    const leaving = page.locator('.interviewer-portrait__layer--leaving');
    await expect(entering).toHaveAttribute('data-portrait-source', '/interviewer/speaking.webp');
    await expect(leaving).toHaveAttribute('data-portrait-source', '/interviewer/listening.webp');
    await expect.poll(() => entering.evaluate((node) => getComputedStyle(node).animationDuration)).toBe('0.2s');
    expect(await entering.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0);
    expect(await entering.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeLessThan(1);
    expect(await leaving.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0);
    expect(await leaving.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeLessThan(1);
    await expect(page.locator('.interviewer-portrait__image--speaking-base')).toHaveCount(0);
    await expect(page.locator('.interviewer-portrait__layer--current .interviewer-portrait__image--primary')).toBeVisible();
    await frozenCrossfade.evaluate((node) => (node as HTMLElement).remove());
    await expect(page.locator('.interviewer-portrait__layer--previous')).toHaveCount(0);
  });

  test('shows one busy answer submission, then the provider error and enabled retry', async ({ page }) => {
    await start(page);
    const handle = await control(page);
    await handle.evaluate((value) => value.deferNextSubmit());
    const answer = page.getByRole('button', { name: '我回答完了' });
    await answer.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });

    await expect(page.getByRole('button', { name: '正在提交…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '正在提交…' })).toHaveAttribute('aria-busy', 'true');
    expect(await handle.evaluate((value) => value.submitAnswerCount())).toBe(1);

    await handle.evaluate((value) => value.rejectNextSubmit());
    await expect(page.getByRole('button', { name: '重新提交回答' })).toBeEnabled();
    await expect(page.locator('.room-error')).toContainText('回答提交失败，请重试。');
    await page.getByRole('button', { name: '重新提交回答' }).click();
    await expect(page.locator('.state-overlay > span')).toHaveText('正在思考你的回答');
  });
});
