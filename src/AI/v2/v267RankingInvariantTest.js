import assert from 'node:assert/strict'
import { buildRiskContext } from './riskContextEngine.js'
import { formatRiskAnalysis, composeRiskAnswer } from './riskAnalysisFormatter.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

const PERIOD = '2026-08-31'
const provinces = ['Bắc Ninh', 'Đà Nẵng', 'Đồng Nai', 'Thanh Hóa']
const riskTypes = ['Định giá cao', 'Sai phương pháp', 'Sai thông tin tài sản']

const valuationAssets = []
const valuationSnapshots = []
const valuationRisks = []

for (let i = 0; i < 12; i += 1) {
  const maTsDg = `DG${String(i + 1).padStart(6, '0')}`
  const recordId = `REC_${i + 1}`
  valuationAssets.push({
    recordId,
    maTsDg,
    tenTaiSan: `Tài sản ${i + 1}`,
    nhomTsCap1: 'BĐS',
    loaiTsCap2: 'Nhà đất',
    tinhTp: provinces[Math.floor(i / 3)],
  })
  valuationSnapshots.push({
    kyBaoCao: PERIOD,
    valuationRecordId: recordId,
    maTsDg,
    gtDinhGia: 1_000_000_000,
    donViDinhGia: 'ĐV1',
  })
  valuationRisks.push({
    kyBaoCao: PERIOD,
    valuationRecordId: recordId,
    maTsDg,
    maRuiRo: `R${i + 1}`,
    loaiRuiRo: riskTypes[i % 3],
    trangThaiXuLy: i % 2 ? 'Đang xử lý' : 'Mới phát hiện',
  })
}

const dataset = {
  valuationAssets,
  valuationSnapshots,
  valuationRisks,
  collateralAssets: [],
  collateralSnapshots: [],
  collateralCustomers: [],
  customers: [],
}

const result = buildRiskContext('Dựa trên dữ liệu hiện tại, tôi nên ưu tiên kiểm tra những gì?', dataset)
assert.equal(result.status, 'OK')
assert.equal(result.riskContext.ranking.province.isTie, true)
assert.deepEqual(new Set(result.riskContext.ranking.province.leaders), new Set(provinces))
assert.equal(result.riskContext.ranking.province.value, 3)
assert.equal(result.riskContext.ranking.riskType.isTie, true)
assert.deepEqual(new Set(result.riskContext.ranking.riskType.leaders), new Set(riskTypes))
assert.equal(result.riskContext.ranking.riskType.value, 4)

const formatted = formatRiskAnalysis(result).text
for (const province of provinces) assert.match(formatted, new RegExp(province))
for (const riskType of riskTypes) assert.match(formatted, new RegExp(riskType))
assert.match(formatted, /đồng mức cao nhất|đồng hạng/)
assert.doesNotMatch(formatted, /Bắc Ninh có 3 case, cao nhất/)
assert.doesNotMatch(formatted, /tập trung vào nhóm “Định giá cao”/)

const composedWithBadEnrichment = composeRiskAnswer(
  { text: 'OK', riskContext: result.riskContext },
  { analysis: 'Chỉ nên ưu tiên Bắc Ninh vì đây là địa bàn cao nhất.' }
)
assert.doesNotMatch(composedWithBadEnrichment, /AI BỔ SUNG/)

const tiePlan = {
  timeContext: { mode: 'SINGLE', from: PERIOD, to: PERIOD },
  steps: [
    { action: 'GROUP_BY', field: 'province' },
    { action: 'AGGREGATE', metric: 'COUNT' },
    { action: 'SORT', by: 'value', order: 'DESC' },
    { action: 'LIMIT', value: 1 },
  ],
}
const tieResult = {
  success: true,
  timeContext: { period: PERIOD },
  data: [
    { key: 'Bắc Ninh', value: 300 },
    { key: 'Đà Nẵng', value: 300 },
  ],
}
const tieText = formatQueryAnswer(tiePlan, tieResult)
assert.match(tieText, /Bắc Ninh, Đà Nẵng đồng hạng số lượng tài sản cao nhất/)

console.log('V2.6.7 RANKING INVARIANT: PASS')
