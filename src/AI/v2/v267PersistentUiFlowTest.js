import assert from 'node:assert/strict'
import fs from 'node:fs'
import { MOCK_DATASET } from '../../services/assetService.js'
import { getPersistentRiskSummary } from '../../services/persistentRiskService.js'
import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'
import { buildRiskContext } from './riskContextEngine.js'
import { formatRiskAnalysis } from './riskAnalysisFormatter.js'

function runPlan(plan, dataset) {
  const validation = validateQueryPlan(plan)
  assert.equal(validation.valid, true, validation.errors?.join('; '))
  return executeQueryPlan(plan, dataset)
}

// 1) Exact manual scenario caught by user: KPI and natural-language result must never disagree.
const manualQuestion = 'tài sản nào phát sinh rủi ro 2 kỳ liên tiếp'
const mockKpi = getPersistentRiskSummary({ period: '2026-08-31', dataset: MOCK_DATASET })
const mockPlan = await createQueryPlanFromGreenNode(manualQuestion, MOCK_DATASET, { defaultPeriod: '2026-08-31' })
assert.equal(mockPlan.answerContext?.domain, 'PERSISTENT_RISK')
const mockResult = runPlan(mockPlan, MOCK_DATASET)
assert.equal(mockResult.data.length, mockKpi.persistentAssets)
const mockAnswer = formatQueryAnswer(mockPlan, mockResult)
if (mockKpi.persistentAssets === 0) {
  assert.match(mockAnswer, /Không có tài sản nào phát sinh rủi ro từ 2 kỳ liên tiếp/)
}

// 1b) Exact field scenario caught on Excel: one reporting period + current risks.
// The phrase order "2 kỳ rủi ro liên tiếp" must NOT fall through to the normal risk list.
const onePeriodDataset = {
  valuationAssets: Array.from({ length: 6 }, (_, i) => ({
    recordId: `ONE_REC_${i + 1}`,
    maTsDg: `ONE_${i + 1}`,
    tenTaiSan: `TS ONE ${i + 1}`,
    tinhTp: 'Hà Nội',
    gtDinhGia: 1_000_000_000,
  })),
  valuationSnapshots: Array.from({ length: 6 }, (_, i) => ({
    kyBaoCao: '2026-08-31',
    valuationRecordId: `ONE_REC_${i + 1}`,
    maTsDg: `ONE_${i + 1}`,
    gtDinhGia: 1_000_000_000,
  })),
  valuationRisks: Array.from({ length: 4 }, (_, i) => ({
    kyBaoCao: '2026-08-31',
    valuationRecordId: `ONE_REC_${i + 1}`,
    maTsDg: `ONE_${i + 1}`,
    maRuiRo: `ONE_R_${i + 1}`,
    loaiRuiRo: 'Định giá cao',
  })),
  collateralAssets: [],
  collateralSnapshots: [],
  collateralCustomers: [],
  customers: [],
}
for (const q of [
  'tài sản nào phát sinh 2 kỳ rủi ro liên tiếp',
  'tài sản nào phát sinh rủi ro 2 kỳ liên tiếp',
  'tài sản nào rủi ro liên tục hai tháng',
  'liệt kê tài sản rủi ro kéo dài',
]) {
  const plan = await createQueryPlanFromGreenNode(q, onePeriodDataset, { defaultPeriod: '2026-08-31' })
  assert.equal(plan.answerContext?.domain, 'PERSISTENT_RISK', q)
  assert.equal(plan.answerContext?.available, false, q)
  const result = runPlan(plan, onePeriodDataset)
  assert.equal(result.data.length, 0, q)
  assert.match(formatQueryAnswer(plan, result), /Chưa đủ dữ liệu để xác định tài sản rủi ro 2 kỳ liên tiếp/, q)
}

// 2) Controlled dataset: A = 3 consecutive, B = 2 consecutive, C has a gap, D is new.
const periods = ['2026-06-30', '2026-07-31', '2026-08-31']
const ids = ['A', 'B', 'C', 'D']
const valuationAssets = ids.map((id) => ({
  recordId: `REC_${id}`,
  maTsDg: id,
  tenTaiSan: `TS ${id}`,
  nhomTsCap1: 'BĐS',
  loaiTsCap2: 'Nhà đất',
  tinhTp: id === 'A' ? 'Nghệ An' : 'Hà Nội',
  gtDinhGia: 1_000_000_000,
}))
const valuationSnapshots = periods.flatMap((kyBaoCao) => ids.map((id) => ({
  kyBaoCao,
  valuationRecordId: `REC_${id}`,
  maTsDg: id,
  gtDinhGia: 1_000_000_000,
})))
const riskRows = [
  ['2026-06-30','A'], ['2026-07-31','A'], ['2026-08-31','A'],
  ['2026-07-31','B'], ['2026-08-31','B'],
  ['2026-06-30','C'], ['2026-08-31','C'],
  ['2026-08-31','D'],
]
const valuationRisks = riskRows.map(([kyBaoCao, id], i) => ({
  kyBaoCao,
  valuationRecordId: `REC_${id}`,
  maTsDg: id,
  maRuiRo: `R${i}`,
  loaiRuiRo: 'Định giá cao',
}))
const dataset = {
  valuationAssets,
  valuationSnapshots,
  valuationRisks,
  collateralAssets: [],
  collateralSnapshots: [],
  collateralCustomers: [],
  customers: [],
}

const kpi = getPersistentRiskSummary({ period: '2026-08-31', dataset })
assert.equal(kpi.persistentAssets, 2)
assert.equal(kpi.threePlusAssets, 1)

for (const q of [
  'tài sản nào phát sinh rủi ro 2 kỳ liên tiếp',
  'tài sản nào bị rủi ro liên tục 2 tháng',
  'liệt kê tài sản rủi ro kéo dài',
]) {
  const plan = await createQueryPlanFromGreenNode(q, dataset, { defaultPeriod: '2026-08-31' })
  assert.equal(plan.answerContext?.domain, 'PERSISTENT_RISK', q)
  const result = runPlan(plan, dataset)
  assert.deepEqual(result.data.map((x) => x.maTsDg).sort(), ['A', 'B'], q)
  assert.equal(result.data.length, kpi.persistentAssets, q)
}

const plan3 = await createQueryPlanFromGreenNode('tài sản nào rủi ro 3 kỳ liên tiếp', dataset, { defaultPeriod: '2026-08-31' })
const result3 = runPlan(plan3, dataset)
assert.deepEqual(result3.data.map((x) => x.maTsDg), ['A'])
assert.match(formatQueryAnswer(plan3, result3), /Có 1 tài sản phát sinh rủi ro từ 3 kỳ liên tiếp/)

// 3) Structured action answer remains in the agreed management format.
const riskContext = buildRiskContext('Dựa trên dữ liệu hiện tại, tôi nên ưu tiên kiểm tra những gì?', dataset, { defaultPeriod: '2026-08-31' })
const structured = formatRiskAnalysis(riskContext).text
for (const heading of ['KẾT LUẬN', 'CĂN CỨ CHÍNH', 'XU HƯỚNG', 'ƯU TIÊN KIỂM TRA']) {
  assert.match(structured, new RegExp(heading))
}
assert.match(structured, /Rủi ro kéo dài/)

// 4) Static UI guards: alert red only when active, risk rows/badges, left-aligned AI, mobile 2-column KPI.
const appSource = fs.readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../../App.css', import.meta.url), 'utf8')
assert.match(appSource, /persistentRiskSummary\.persistentAssets > 0 \? 'has-alert' : 'is-clear'/)
assert.match(appSource, /risk-table-row/)
assert.match(appSource, /persistent-risk-badge/)
assert.match(css, /\.kpi-card-risk-persistent\.has-alert[\s\S]*?#dc2626/)
assert.match(css, /\.risk-asset-code[\s\S]*?color:\s*#dc2626/)
assert.match(css, /\.ai-result-card,[\s\S]*?text-align:\s*left/)
assert.match(css, /@media \(max-width: 760px\)[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)

console.log('V2.6.7 Persistent KPI + UI flow: PASS 16/16')
