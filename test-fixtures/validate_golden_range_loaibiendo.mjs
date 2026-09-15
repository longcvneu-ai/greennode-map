/*
  GOLDEN RANGE VALIDATION — Loại biến động Khoảng thời gian 2026-06-30 → 2026-08-31
  TEST DATA ONLY. Chỉ đọc golden Excel + chạy ĐÚNG rangeComparisonService hiện tại.
  KHÔNG sửa source production.
*/
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  extractExcelData,
  buildCanonicalExcelData,
} from '../src/services/excelImportService.js'
import {
  getAssetsByReportingPeriod,
  getReportingPeriods,
} from '../src/services/assetService.js'
import {
  buildComparisonAssets,
  filterComparisonAssets,
} from '../src/services/rangeComparisonService.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, 'greennode_golden_10000_assets_3periods.xlsx')
const FROM = '2026-06-30'
const TO = '2026-08-31'

const CHANGETYPE_OPTIONS = [
  'Tất cả',
  'Phát sinh mới',
  'Tăng GT định giá',
  'Giảm GT định giá',
  'Dư nợ tăng',
  'Dư nợ giảm',
  'Giải chấp',
  'Không còn xuất hiện trong nguồn',
  'Phát sinh rủi ro mới',
  'Phát sinh rủi ro trong khoảng',
]

const workbook = XLSX.readFile(FILE)
const dataset = buildCanonicalExcelData(extractExcelData(workbook))

const fromAssets = getAssetsByReportingPeriod(FROM, dataset)
const toAssets = getAssetsByReportingPeriod(TO, dataset)

// Wiring giống hệt App.jsx: assetsByPeriodInRange = mọi kỳ trong khoảng [from,to]
const assetsByPeriodInRange = getReportingPeriods(dataset)
  .filter((p) => p >= FROM && p <= TO)
  .map((p) => ({ period: p, assets: getAssetsByReportingPeriod(p, dataset) }))

const comparison = buildComparisonAssets({
  fromAssets,
  toAssets,
  assetsByPeriodInRange,
  fromPeriod: FROM,
  toPeriod: TO,
  dataset,
})

const countWith = (changeType) =>
  filterComparisonAssets(comparison, { changeType, valuationRisk: 'Tất cả' }).length

console.log('GOLDEN RANGE VALIDATION')
console.log(`Range: ${FROM} -> ${TO} | union items = ${comparison.length}`)
console.log('')

let fail = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) fail += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: got=${got} want=${want}`)
}

console.log('[Expected counts — Loại biến động]')
const counts = {}
for (const option of CHANGETYPE_OPTIONS) {
  counts[option] = countWith(option)
}
for (const option of CHANGETYPE_OPTIONS) {
  console.log(`    ${option.padEnd(32)} = ${counts[option]}`)
}
console.log('')

console.log('[Validation 1.600 — option nào?]')
check('Phát sinh rủi ro trong khoảng', counts['Phát sinh rủi ro trong khoảng'], 1600)
check('Phát sinh rủi ro mới', counts['Phát sinh rủi ro mới'], 1200)
check('Tăng GT định giá', counts['Tăng GT định giá'], 8000)
check('Dư nợ tăng', counts['Dư nợ tăng'], 8000)
check('Giảm GT định giá', counts['Giảm GT định giá'], 0)
check('Dư nợ giảm', counts['Dư nợ giảm'], 0)
check('Phát sinh mới', counts['Phát sinh mới'], 0)
check('Giải chấp', counts['Giải chấp'], 0)
check('Không còn xuất hiện trong nguồn', counts['Không còn xuất hiện trong nguồn'], 0)
console.log('')

const inRangeItems = filterComparisonAssets(comparison, {
  changeType: 'Phát sinh rủi ro trong khoảng',
  valuationRisk: 'Tất cả',
})
const newRiskItems = filterComparisonAssets(comparison, {
  changeType: 'Phát sinh rủi ro mới',
  valuationRisk: 'Tất cả',
})

const group = (items) => {
  const out = {}
  for (const it of items) {
    const i = Number(it.maTsDg.replace('DG', ''))
    let g
    if (i <= 100) g = '[1..100]'
    else if (i <= 300) g = '[101..300]'
    else if (i <= 600) g = '[301..600]'
    else if (i <= 1000) g = '[601..1000]'
    else if (i <= 1200) g = '[1001..1200]'
    else if (i <= 1900) g = '[1201..1900]'
    else g = '[1901..10000]'
    out[g] = (out[g] || 0) + 1
  }
  return out
}

const flatInInRange = inRangeItems.filter((it) => { const i = Number(it.maTsDg.replace('DG', '')); return i % 5 === 0 }).length
check('risk-in-range gồm các nhóm DG theo phân bổ risk thiết kế',
  (() => {
    const g = group(inRangeItems)
    return g['[1..100]'] === 100 && g['[101..300]'] === 200 &&
      g['[301..600]'] === undefined && g['[601..1000]'] === 400 &&
      g['[1001..1200]'] === 200 && g['[1201..1900]'] === 700
  })(), true)
check('tài sản phẳng GT (i%5=0) có trong 1600', flatInInRange, 320)

console.log('')
console.log('[Bằng chứng deterministic — 1600 = risk types xuất hiện trong khoảng]')
console.log('  risk-in-range theo nhóm:', JSON.stringify(group(inRangeItems)))
console.log('  new-risk-at-end  theo nhóm:', JSON.stringify(group(newRiskItems)))
console.log('  risk-in-range \u2295 new-risk-at-end (newRisk ⊆ inRange):',
  inRangeItems.filter((it) => newRiskItems.some((n) => n.maTsDg === it.maTsDg)).length)
console.log('')

console.log('[Overlap semantics — không mutually exclusive]')
const valUp = comparison.filter((it) => it.valuationChange > 0).length
const debtUp = comparison.filter((it) => it.debtChange > 0).length
const valFlat = comparison.filter((it) => it.valuationChange === 0).length
const rangeRiskStillValUp = inRangeItems.filter((it) => it.valuationChange > 0).length
console.log('  valuationChange > 0:', valUp, '| == 0:', valFlat, '| < 0:', comparison.filter((it) => it.valuationChange < 0).length)
console.log('  debtChange      > 0:', debtUp, '| == 0:', comparison.filter((it) => it.debtChange === 0).length, '| < 0:', comparison.filter((it) => it.debtChange < 0).length)
console.log('  changeStatus phân bố:', JSON.stringify(comparison.reduce((acc, it) => { acc[it.changeStatus] = (acc[it.changeStatus] || 0) + 1; return acc }, {})))
console.log('  risk-in-range ∩ GT tăng =', rangeRiskStillValUp, '| risk-in-range ∩ GT flat =', flatInInRange)
console.log('  newRisk ⊆ inRange =', inRangeItems.filter((it) => newRiskItems.some((n) => n.maTsDg === it.maTsDg)).length === newRiskItems.length)
console.log('  -> cùng 1 tài sản có thể thoả nhiều option: tổng các count vượt 10.000, KHÔNG cộng dồn.')
console.log('')

console.log('[Kiểm tra riêng từng chiều]')
check('valuation delta: >0', valUp, 8000)
check('valuation delta: <0', comparison.filter((it) => it.valuationChange < 0).length, 0)
check('debt delta: >0', debtUp, 8000)
check('debt delta: <0', comparison.filter((it) => it.debtChange < 0).length, 0)
check('collateral status "Giải chấp"/đã giải chấp', comparison.filter((it) => it.changeStatus === 'Đã giải chấp').length, 0)
check('collateral status "Không còn xuất hiện trong nguồn"', comparison.filter((it) => it.changeStatus === 'Không còn xuất hiện trong nguồn').length, 0)
check('new risk types at end > 0', newRiskItems.length, 1200)
check('risk types occurred in range > 0', inRangeItems.length, 1600)
console.log('')

console.log('[3 UI tests đề xuất]')
console.log('  1. Phát sinh rủi ro trong khoảng — kỳ vọng 1.600 — bao phủ cả 6 nhóm DG, là option có nghĩa "rủi ro xuất hiện bất kỳ đâu trong khoảng" (risk ở 1 kỳ bất kỳ bên trong).')
console.log('  2. Phát sinh rủi ro mới — kỳ vọng 1.200 — "rủi ro MỚI so với kỳ đầu": nhóm [1..100] vẫn có rủi ro 3 kỳ nhưng do loại rủi ro đổi kỳ-đổi-kỳ nên vẫn tính là MỚI — rất tốt để phát hiện regression ở semantic risk-type.')
console.log('  3. Tăng GT định giá — kỳ vọng 8.000 — phần lớn nền 10.000 đều tăng định giá (trừ 2.000 tài sản phẳng), để kiểm tra filter delta dương/dư nợ tăng song song.')
if (fail === 0) {
  console.log('\nGOLDEN RANGE VALIDATION: ALL PASS')
  process.exit(0)
}
console.log(`\nGOLDEN RANGE VALIDATION: ${fail} FAIL`)
process.exit(1)