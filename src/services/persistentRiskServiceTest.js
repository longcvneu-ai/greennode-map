import assert from 'node:assert/strict'
import { getPersistentRiskSummary } from './persistentRiskService.js'
import { buildRiskContext } from '../AI/v2/riskContextEngine.js'
import { formatRiskAnalysis } from '../AI/v2/riskAnalysisFormatter.js'

const periods = ['2026-06-30', '2026-07-31', '2026-08-31']
const ids = ['A', 'B', 'C', 'D']
const valuationAssets = ids.map((id) => ({ recordId: `REC_${id}`, maTsDg: id, tenTaiSan: `TS ${id}`, nhomTsCap1: 'BĐS', loaiTsCap2: 'Nhà đất', tinhTp: id === 'A' ? 'Nghệ An' : 'Hà Nội', gtDinhGia: 1_000_000_000 }))
const valuationSnapshots = periods.flatMap((kyBaoCao) => ids.map((id) => ({ kyBaoCao, valuationRecordId: `REC_${id}`, maTsDg: id, gtDinhGia: 1_000_000_000 })))
const riskRows = [
  ['2026-06-30','A'], ['2026-07-31','A'], ['2026-08-31','A'],
  ['2026-07-31','B'], ['2026-08-31','B'],
  ['2026-06-30','C'], ['2026-08-31','C'],
  ['2026-08-31','D'],
]
const valuationRisks = riskRows.map(([kyBaoCao, id], i) => ({ kyBaoCao, valuationRecordId: `REC_${id}`, maTsDg: id, maRuiRo: `R${i}`, loaiRuiRo: 'Định giá cao' }))
const dataset = { valuationAssets, valuationSnapshots, valuationRisks, collateralAssets: [], collateralSnapshots: [], collateralCustomers: [], customers: [] }

const aug = getPersistentRiskSummary({ period: '2026-08-31', dataset })
assert.equal(aug.available, true)
assert.equal(aug.persistentAssets, 2, 'A and B must be persistent; C gap and D new must not count')
assert.equal(aug.threePlusAssets, 1, 'Only A has 3 consecutive periods')
assert.equal(aug.maxConsecutive, 3)
assert.deepEqual(aug.items.map((x) => [x.maTsDg, x.consecutivePeriods]), [['A',3],['B',2]])

const jul = getPersistentRiskSummary({ period: '2026-07-31', dataset })
assert.equal(jul.persistentAssets, 1, 'At July only A is persistent')
assert.equal(jul.threePlusAssets, 0)

const filtered = getPersistentRiskSummary({ period: '2026-08-31', dataset, assetIds: ['B','C','D'] })
assert.equal(filtered.persistentAssets, 1, 'Scope filter must keep only B among persistent assets')
assert.equal(filtered.items[0].maTsDg, 'B')

const onePeriodDataset = { ...dataset, valuationSnapshots: valuationSnapshots.filter((r) => r.kyBaoCao === '2026-08-31'), valuationRisks: valuationRisks.filter((r) => r.kyBaoCao === '2026-08-31') }
const one = getPersistentRiskSummary({ period: '2026-08-31', dataset: onePeriodDataset })
assert.equal(one.available, false)
assert.equal(one.persistentAssets, 0)

const contextResult = buildRiskContext('Phân tích tình hình rủi ro hiện tại và đề xuất việc cần ưu tiên kiểm tra.', dataset)
assert.equal(contextResult.riskContext.persistentRisk.persistentAssets, 2)
assert.equal(contextResult.riskContext.persistentRisk.threePlusAssets, 1)
const answer = formatRiskAnalysis(contextResult).text
assert.match(answer, /Rủi ro kéo dài – 2 tài sản ≥ 2 kỳ liên tiếp/)
assert.match(answer, /1 tài sản ≥ 3 kỳ/)
assert.match(answer, /KẾT LUẬN/)
assert.match(answer, /CĂN CỨ CHÍNH/)
assert.match(answer, /XU HƯỚNG/)
assert.match(answer, /ƯU TIÊN KIỂM TRA/)

console.log('Persistent Risk KPI + AI integration: PASS 18/18')
