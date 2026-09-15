import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import * as XLSX from 'xlsx'
import { extractExcelData, buildCanonicalExcelData } from '../../services/excelImportService.js'
import { getAssetsByReportingPeriod, getReportingPeriods } from '../../services/assetService.js'
import { getPersistentRiskSummary } from '../../services/persistentRiskService.js'
import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'
import { buildRiskContext } from './riskContextEngine.js'
import { formatRiskAnalysis } from './riskAnalysisFormatter.js'

const fixtureUrl = new URL('../../../test-fixtures/greennode_test_30000_assets_2026-08.xlsx', import.meta.url)
const workbook = XLSX.readFile(fixtureUrl)

const importStart = performance.now()
const extracted = extractExcelData(workbook)
const dataset = buildCanonicalExcelData(extracted)
const canonicalMs = performance.now() - importStart

assert.equal(dataset.valuationAssets.length, 30000)
assert.equal(dataset.valuationSnapshots.length, 30000)
assert.equal(dataset.valuationRisks.length, 1200)
assert.deepEqual(getReportingPeriods(dataset), ['2026-08-31'])

const projectionStart = performance.now()
const augustAssets = getAssetsByReportingPeriod('2026-08-31', dataset)
const firstProjectionMs = performance.now() - projectionStart
assert.equal(augustAssets.length, 30000)

const cachedStart = performance.now()
const augustAssetsCached = getAssetsByReportingPeriod('2026-08-31', dataset)
const cachedProjectionMs = performance.now() - cachedStart
assert.equal(augustAssetsCached, augustAssets, 'period projection should be reused from cache')

// Real field bug #1: one-period Excel must NEVER return 1,200 current risks
// as if they were persistent risks.
const persistentKpi = getPersistentRiskSummary({
  period: '2026-08-31',
  dataset,
  assetIds: augustAssets.map((asset) => asset.maTsDg),
})
assert.equal(persistentKpi.available, false)
assert.equal(persistentKpi.persistentAssets, 0)
assert.equal(persistentKpi.availablePeriods, 1)

for (const question of [
  'tài sản nào phát sinh 2 kỳ rủi ro liên tiếp',
  'tài sản nào phát sinh rủi ro 2 kỳ liên tiếp',
  'liệt kê tài sản rủi ro kéo dài',
]) {
  const plan = await createQueryPlanFromGreenNode(question, dataset, {
    defaultPeriod: '2026-08-31',
    periodAssets: augustAssets,
    persistentAssetIds: augustAssets.map((asset) => asset.maTsDg),
  })
  assert.equal(plan.answerContext?.domain, 'PERSISTENT_RISK', question)
  assert.equal(plan.answerContext?.available, false, question)
  const validation = validateQueryPlan(plan)
  assert.equal(validation.valid, true, validation.errors?.join('; '))
  const result = executeQueryPlan(plan, dataset)
  assert.equal(result.data.length, 0, question)
  assert.match(
    formatQueryAnswer(plan, result),
    /Chưa đủ dữ liệu để xác định tài sản rủi ro 2 kỳ liên tiếp/,
    question
  )
}

// Real field bug #2: Đà Nẵng + current UI risk type must not fall back to
// nationwide 1,200 cases. In the uploaded Excel, Đà Nẵng has 300 risk cases
// total and 100 "Sai thông tin tài sản" cases.
const allRiskPlan = await createQueryPlanFromGreenNode(
  'Đà Nẵng có bao nhiêu case tài sản bảo đảm rủi ro',
  dataset,
  { defaultPeriod: '2026-08-31', periodAssets: augustAssets }
)
assert.ok(
  allRiskPlan.steps.some((step) => step.action === 'FILTER' && step.field === 'province' && step.value === 'Đà Nẵng'),
  'dynamic province Đà Nẵng must be resolved from the real dataset'
)
const allRiskResult = executeQueryPlan(allRiskPlan, dataset)
assert.equal(allRiskResult.data?.value ?? allRiskResult.data, 300)

const filteredRiskPlan = await createQueryPlanFromGreenNode(
  'Đà Nẵng có bao nhiêu case tài sản bảo đảm rủi ro',
  dataset,
  {
    defaultPeriod: '2026-08-31',
    periodAssets: augustAssets,
    defaultRiskType: 'Sai thông tin tài sản',
  }
)
assert.ok(
  filteredRiskPlan.steps.some((step) => step.action === 'FILTER' && step.field === 'province' && step.value === 'Đà Nẵng')
)
assert.ok(
  filteredRiskPlan.steps.some((step) => step.action === 'FILTER' && step.field === 'valuationRisk' && step.value === 'Sai thông tin tài sản')
)
const filteredRiskResult = executeQueryPlan(filteredRiskPlan, dataset)
assert.equal(filteredRiskResult.data?.value ?? filteredRiskResult.data, 100)


// Real field bug #3: analytical ranking must preserve ties across the full
// RiskContext -> formatter path. The uploaded 30K workbook has 4 provinces
// tied at 300 cases and 3 risk types tied at 400 cases.
const analytical = buildRiskContext(
  'Dựa trên dữ liệu hiện tại, tôi nên ưu tiên kiểm tra những gì?',
  dataset
)
assert.equal(analytical.status, 'OK')
assert.equal(analytical.riskContext.ranking.province.isTie, true)
assert.deepEqual(
  new Set(analytical.riskContext.ranking.province.leaders),
  new Set(['Bắc Ninh', 'Đà Nẵng', 'Đồng Nai', 'Thanh Hóa'])
)
assert.equal(analytical.riskContext.ranking.province.value, 300)
assert.equal(analytical.riskContext.ranking.riskType.isTie, true)
assert.deepEqual(
  new Set(analytical.riskContext.ranking.riskType.leaders),
  new Set(['Định giá cao', 'Sai phương pháp', 'Sai thông tin tài sản'])
)
assert.equal(analytical.riskContext.ranking.riskType.value, 400)
const analyticalText = formatRiskAnalysis(analytical).text
assert.match(analyticalText, /Bắc Ninh, Đà Nẵng, Đồng Nai và Thanh Hóa/)
assert.match(analyticalText, /Định giá cao, Sai phương pháp và Sai thông tin tài sản/)
assert.doesNotMatch(analyticalText, /Bắc Ninh có 300 case, cao nhất/)
assert.doesNotMatch(analyticalText, /tập trung vào nhóm “Định giá cao”/)

// Performance guard: cached period projection should be effectively immediate.
assert.ok(cachedProjectionMs < 20, `cached projection too slow: ${cachedProjectionMs.toFixed(2)}ms`)

console.log('V2.6.7 REAL EXCEL regression: PASS')
console.log(`Canonical build: ${canonicalMs.toFixed(2)}ms`)
console.log(`First 30K period projection: ${firstProjectionMs.toFixed(2)}ms`)
console.log(`Cached 30K period projection: ${cachedProjectionMs.toFixed(2)}ms`)
