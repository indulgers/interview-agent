import { expect, test, type Page } from '@playwright/test';

type TestEvent = Record<string, unknown> & { type: string };
type EndControl = { deferNextEnd(): void; failNextEnd(): void; finishNaturally(): Promise<void> };
async function emit(page: Page, event: TestEvent) {
  await page.evaluate(async (value) => {
    const control = (window as unknown as { __interviewE2E?: { emit(event: TestEvent): Promise<void> } }).__interviewE2E;
    if (!control) throw new Error('test voice unavailable');
    await control.emit(value);
  }, event);
}
async function failConnects(page: Page, count: number) {
  await page.evaluate((value) => {
    (window as unknown as { __interviewE2E?: { failConnects(count: number): void } }).__interviewE2E?.failConnects(value);
  }, count);
}
async function start(page: Page) {
  await page.goto('/interview');
  await page.getByRole('button', { name: '检查设备' }).click();
  await expect(page.getByRole('button', { name: '开始 45 分钟面试' })).toBeEnabled({ timeout: 8_000 });
  await page.getByRole('button', { name: '开始 45 分钟面试' }).click();
  await expect(page.getByText('AI 技术面试官', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __interviewE2E?: { connectionCount(): number } }).__interviewE2E?.connectionCount() ?? -1)).toBe(1);
}
async function latestSession(page: Page) {
  const response = await page.request.get('/api/interviews');
  expect(response.ok()).toBeTruthy();
  return (await response.json() as Array<{ id: string; result: string }>)[0]!;
}
test.describe.serial('interview MVP', () => {
  test('keeps dialog focus stable and exposes no end controls outside compiled mode', async ({ page }) => {
    await start(page);
    const trigger = page.getByRole('button', { name: '结束面试' });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: '继续面试' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '确认结束并查看总结' })).toBeFocused();
    await page.waitForTimeout(350);
    await expect(page.getByRole('button', { name: '确认结束并查看总结' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('waits for durable end, retries a failed end, and redirects natural terminals', async ({ page }) => {
    await start(page);
    await page.evaluate(() => (window as unknown as { __interviewE2E: EndControl }).__interviewE2E.deferNextEnd());
    await page.getByRole('button', { name: '结束面试' }).click();
    await page.getByRole('button', { name: '确认结束并查看总结' }).dblclick();
    await expect(page.getByRole('button', { name: '正在保存…' })).toBeDisabled();
    await expect(page).toHaveURL(/\/interview$/);
    await page.evaluate(() => (window as unknown as { __interviewE2E: EndControl }).__interviewE2E.deferNextEnd());
    await expect(page).toHaveURL(/\/history\/[\w-]+$/);

    await start(page);
    await page.evaluate(() => (window as unknown as { __interviewE2E: EndControl }).__interviewE2E.failNextEnd());
    await page.getByRole('button', { name: '结束面试' }).click();
    await page.getByRole('button', { name: '确认结束并查看总结' }).click();
    await expect(page.getByText('结束保存失败，请重试。')).toBeVisible();
    await expect(page.getByText('AI 技术面试官', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重试结束' }).click();
    await expect(page).toHaveURL(/\/history\/[\w-]+$/);

    await start(page);
    await page.evaluate(() => (window as unknown as { __interviewE2E: EndControl }).__interviewE2E.finishNaturally());
    await expect(page).toHaveURL(/\/history\/[\w-]+$/);
  });

  test('device ready → turns → barge-in → finish → feedback retry → history → delete', async ({ page }) => {
    const apiPayloads: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/api/')) apiPayloads.push(request.postData() ?? ''); });
    await start(page);
    await emit(page, { type: 'assistant_speech', state: 'started', at: Date.now() });
    await expect(page.getByText('面试官正在提问')).toBeVisible();
    await emit(page, { type: 'final_turn', providerTurnId: 'ai-1', speaker: 'ai', text: '请介绍你在 Node.js 项目中的责任边界。', startedAt: Date.now(), endedAt: Date.now() + 1 });
    await emit(page, { type: 'candidate_speech', state: 'started', at: Date.now() });
    await expect(page.getByText('请开始回答')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __interviewE2E?: { cancelCount(): number } }).__interviewE2E?.cancelCount() ?? -1)).toBe(1);
    await emit(page, { type: 'transcript', state: 'pending', providerTurnId: 'candidate-1', speaker: 'candidate', at: Date.now() });
    await emit(page, { type: 'final_turn', providerTurnId: 'candidate-1', speaker: 'candidate', text: '我独立负责接口设计、输入校验和 Agent 上下文管理。', startedAt: Date.now(), endedAt: Date.now() + 1 });
    await page.getByRole('button', { name: '结束面试' }).click();
    await page.getByRole('button', { name: '确认结束并查看总结' }).click();
    await expect(page).toHaveURL(/\/history\/[\w-]+$/);

    const session = await latestSession(page);
    expect(session.result).toBe('completed');
    let failOnce = true;
    await page.route(`**/api/interviews/${session.id}/feedback`, async (route) => {
      if (failOnce) { failOnce = false; await route.fulfill({ status: 400, body: '{}', contentType: 'application/json' }); }
      else await route.continue();
    });
    await page.getByRole('button', { name: '重试生成反馈' }).click();
    await expect(page.getByText('仍未生成，请稍后再试。')).toBeVisible();
    await page.getByRole('button', { name: '重试生成反馈' }).click();
    await expect(page.getByText('项目真实性与个人贡献')).toBeVisible({ timeout: 8_000 });
    const detailResponse = await page.request.get(`/api/interviews/${session.id}`);
    const serialized = JSON.stringify(await detailResponse.json());
    expect(serialized).not.toMatch(/data:audio|data:video|e2e-placeholder|DASHSCOPE_API_KEY/);
    expect(apiPayloads.join('\n')).not.toMatch(/data:audio|data:video|e2e-placeholder|DASHSCOPE_API_KEY/);
    await page.getByRole('button', { name: '删除这场面试' }).click();
    await expect(page.getByText('没有回收站', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '确认删除' }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByText(session.id)).toHaveCount(0);
  });

  test('reconnects successfully after one failed attempt', async ({ page }) => {
    await start(page); await failConnects(page, 1);
    await emit(page, { type: 'connection', state: 'disconnected', at: Date.now() });
    await expect(page.getByText('连接波动，正在恢复')).toBeVisible();
    await expect(page.getByText('请开始回答')).toBeVisible({ timeout: 6_000 });
  });

  test('ends interrupted after the 20-second reconnect deadline', async ({ page }) => {
    await start(page); await failConnects(page, 30);
    await emit(page, { type: 'connection', state: 'disconnected', at: Date.now() });
    await expect(page).toHaveURL(/\/history\/[\w-]+$/, { timeout: 25_000 });
    expect((await latestSession(page)).result).toBe('interrupted');
  });
});
