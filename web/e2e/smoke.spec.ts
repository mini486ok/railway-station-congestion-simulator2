import { test, expect } from '@playwright/test'

test('앱 로드 → 템플릿 → 즉시 실행 → 데이터 생성', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /시뮬레이터/ })).toBeVisible()
  // 예제 템플릿 로드
  await page.getByRole('combobox').first().selectOption({ index: 1 })
  // 즉시 실행 (Pyodide 로드 포함하여 시간이 걸릴 수 있음)
  await page.getByRole('button', { name: /즉시 실행/ }).click()
  // 누적 발생이 0보다 커질 때까지 대기 (Pyodide 초기 로드 여유 60s)
  await expect(page.getByText(/누적 발생: /)).not.toHaveText(/누적 발생: 0(\.0)?$/, { timeout: 60000 })
})
