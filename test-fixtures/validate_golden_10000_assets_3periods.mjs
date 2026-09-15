/*
  Golden Test validation — dùng ĐÚNG importer + service của project.
  TEST DATA ONLY. Không sửa source production.

  Chạy: node test-fixtures/validate_golden_10000_assets_3periods.mjs
*/
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validateWorkbookStructure,
  validateWorkbookColumns,
  extractExcelData,
  buildCanonicalExcelData,
} from '../src/services/excelImportService.js'
import {
  getAssets,
  getReportingPeriods,
  getAssetsByReportingPeriod,
} from '../src/services/assetService.js'
import { getPersistentRiskSummary } from '../src/services/persistentRiskService.js'
import { buildComparisonAssets } from '../src/services/rangeComparisonService.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, 'greennode_golden_10000_assets_3periods.xlsx')
const AUGUST = '2026-08-31'
const PROVINCE_HOSTS = 10

let exitCode = 0
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  if (!ok) exitCode = 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const workbook = XLSX.readFile(FILE)

const structure = validateWorkbookStructure(workbook)
check('validateWorkbookStructure.canImport', structure.canImport,
  `${structure.results.length} kết quả, error=${structure.errorCount}`)

const columns = validateWorkbookColumns(workbook)
check('validateWorkbookColumns.canImport', columns.canImport,
  `${columns.results.length} kết quả, error=${columns.errorCount}`)

const extracted = extractExcelData(workbook)
const dataset = buildCanonicalExcelData(extracted)

// 1. Unique assets = 10.000
const allAssets = getAssets(dataset)
const uniqueIds = new Set(allAssets.map((a) => a.maTsDg))
check('Unique assets = 10000', uniqueIds.size === 10000 && allAssets.length === 10000,
  `getAssets=${allAssets.length}, unique=${uniqueIds.size}`)

// 2. Periods = 3
const periods = getReportingPeriods(dataset)
check('Periods = 3 (Jun/Jul/Aug)', periods.length === 3 &&
  JSON.stringify(periods) === JSON.stringify(['2026-06-30', '2026-07-31', '2026-08-31']),
  JSON.stringify(periods))

// 3. Current risk Aug = 1.200
const augAssets = getAssetsByReportingPeriod(AUGUST, dataset)
const currentRiskAug = augAssets.filter((a) => a.coRuiRoDinhGia).length
check('Current risk 2026-08-31 = 1200', currentRiskAug === 1200,
  `measured=${currentRiskAug}`)

// 4. Persistent >= 2 = 500
const p2 = getPersistentRiskSummary({ period: AUGUST, dataset, minConsecutive: 2 })
check('Persistent risk >= 2 ky = 500', p2.persistentAssets === 500,
  `measured=${p2.persistentAssets}`)

// 5. Persistent >= 3 = 100
check('Persistent risk >= 3 ky = 100',
  p2.threePlusAssets === 100 && p2.maxConsecutive === 3,
  `threePlusAssets=${p2.threePlusAssets}, maxConsecutive=${p2.maxConsecutive}`)

const p3 = getPersistentRiskSummary({ period: AUGUST, dataset, minConsecutive: 3 })
check('getPersistentRiskSummary(minConsecutive=3).persistentAssets = 100',
  p3.persistentAssets === 100, `measured=${p3.persistentAssets}`)

// Golden bổ trợ: risk đúng 2 kỳ liên tiếp = 400
const exactlyTwo = p2.items.filter((it) => it.consecutivePeriods === 2).length
check('Risk dung 2 ky lien tiep = 400', exactlyTwo === 400, `measured=${exactlyTwo}`)

// Risk types: dùng đủ ít nhất các loại yêu cầu
const riskTypesUsed = new Set(
  (dataset.valuationRisks || []).map((r) => r.loaiRuiRo)
)
check('Risk types >= [Định giá cao, Sai phương pháp, Sai thông tin tài sản]',
  ['Định giá cao', 'Sai phương pháp', 'Sai thông tin tài sản'].every((t) => riskTypesUsed.has(t)),
  JSON.stringify([...riskTypesUsed]))

// TSBĐ/collateral: đủ cho KPI, Map, TSBĐ, Range comparison
const withCollateral = allAssets.filter((a) => a.maTsbd).length
check('Collateral: 10000 assets co maTsbd', withCollateral === 10000, `measured=${withCollateral}`)

const withCustomer = allAssets.filter((a) => Array.isArray(a.customers) && a.customers.length > 0).length
check('Collateral khach hang: 10000 assets co customer', withCustomer === 10000,
  `measured=${withCustomer}`)

const provCount = new Set(allAssets.map((a) => a.tinhTp)).size
check('Province distribution >= 10', provCount >= PROVINCE_HOSTS, `measured=${provCount}`)

// Range comparison (Jun -> Aug) chạy được trên dataset này
const fromPeriod = '2026-06-30'
const fromAssets = getAssetsByReportingPeriod(fromPeriod, dataset)
const toAssets = getAssetsByReportingPeriod(AUGUST, dataset)
const comparison = buildComparisonAssets({
  fromAssets,
  toAssets,
  assetsByPeriodInRange: [],
  fromPeriod,
  toPeriod: AUGUST,
  dataset,
})
const withDelta = comparison.filter((c) => c.valuationChange !== 0).length
check('Range comparison Jun->Aug: 10000 items, co delta', 
  comparison.length === 10000 && withDelta > 0 && withDelta < 10000,
  `items=${comparison.length}, withValuationDelta=${withDelta}`)

console.log(`\nView by Nhom-VALIDATION: ${results.filter((r) => r.ok).length}/${results.length} PASS`)
if (exitCode === 0) {
  console.log('GOLDEN VALIDATION: ALL PASS')
} else {
  console.log('GOLDEN VALIDATION: HAS FAIL')
}
process.exit(exitCode)