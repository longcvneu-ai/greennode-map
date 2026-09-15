/*
 * RANGE COMPARISON GUARDRAIL TEST (V2.6.7)
 * ==========================================
 * Khóa ngữ nghĩa + hiệu năng của engine so sánh "Khoảng thời gian"
 * (src/App.jsx -> mirror tại src/services/rangeComparisonService.js).
 *
 * - SEMANTICS  : phải PASS trước VÀ sau khi tối ưu (bảo vệ nghiệp vụ:
 *                COUNT/RANK/tie/TSBĐ/period resolution/persistent risk).
 * - PERFORMANCE: HARD THRESHOLD — hiện đang ĐỎ (chứng minh freeze),
 *                phải XANH sau khi áp dụng index Map / memo.
 * - WIRING     : App.jsx phải dùng rangeComparisonService + sliceForTable
 *                cho bảng range. Hiện ĐỎ (chưa wire) -> XANH sau refactor.
 *
 * Chạy: npm run test:guardrail
 * Reporting only: RANGE_GUARDRAIL=report npm run test:guardrail
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { buildCanonicalExcelData } from './excelImportService.js'
import { getAssetsByReportingPeriod } from './assetService.js'
import {
  buildComparisonAssets,
  filterComparisonAssets,
  sliceForTable,
  TABLE_RENDER_LIMIT,
} from './rangeComparisonService.js'

const PERIODS = ['2026-06-30', '2026-07-31', '2026-08-31']
const FROM_PERIOD = PERIODS[0]
const TO_PERIOD = PERIODS[2]

const failures = []
const passes = []

function check(label, condition, detail = '') {
  if (condition) {
    passes.push(label)
    console.log(`  PASS ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ===================================================================
   1. FIXTURE — 8 kịch bản nghiệp vụ (canonical data thật)
   =================================================================== */

function buildScenarioDataset() {
  const assetMaster = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'].map((code, i) => {
    const n = String(i + 1).padStart(6, '0')
    return {
      maTsDg: `DG${n}`,
      tenTaiSan: `TS ${code}`,
      nhomTsCap1: 'BĐS',
      loaiTsCap2: 'Nhà đất',
      tinhTp: 'Hà Nội',
      latitude: 21.0285 + i * 0.001,
      longitude: 105.8542 + i * 0.001,
    }
  })
  const valuationSnapshots = [
    // A1: tăng GT, rủi ro & collateral active cả 3 kỳ
    { maTsDg: 'DG000001', kyBaoCao: PERIODS[0], gtDinhGia: 100 },
    { maTsDg: 'DG000001', kyBaoCao: PERIODS[1], gtDinhGia: 110 },
    { maTsDg: 'DG000001', kyBaoCao: PERIODS[2], gtDinhGia: 120 },
    // A2: giảm GT, rủi ro trùng ở đầu, hết rủi ro cuối kỳ
    { maTsDg: 'DG000002', kyBaoCao: PERIODS[0], gtDinhGia: 130 },
    { maTsDg: 'DG000002', kyBaoCao: PERIODS[1], gtDinhGia: 120 },
    { maTsDg: 'DG000002', kyBaoCao: PERIODS[2], gtDinhGia: 100 },
    // A3: không đổi, rủi ro chỉ xuất hiện ở kỳ giữa
    { maTsDg: 'DG000003', kyBaoCao: PERIODS[0], gtDinhGia: 200 },
    { maTsDg: 'DG000003', kyBaoCao: PERIODS[1], gtDinhGia: 200 },
    { maTsDg: 'DG000003', kyBaoCao: PERIODS[2], gtDinhGia: 200 },
    // A4: giải chấp ở kỳ cuối
    { maTsDg: 'DG000004', kyBaoCao: PERIODS[0], gtDinhGia: 300 },
    { maTsDg: 'DG000004', kyBaoCao: PERIODS[1], gtDinhGia: 300 },
    { maTsDg: 'DG000004', kyBaoCao: PERIODS[2], gtDinhGia: 300 },
    // A5: TSBĐ biến mất khỏi nguồn cuối kỳ
    { maTsDg: 'DG000005', kyBaoCao: PERIODS[0], gtDinhGia: 400 },
    { maTsDg: 'DG000005', kyBaoCao: PERIODS[1], gtDinhGia: 410 },
    { maTsDg: 'DG000005', kyBaoCao: PERIODS[2], gtDinhGia: 420 },
    // A6: TSBĐ phát sinh ở cuối kỳ
    { maTsDg: 'DG000006', kyBaoCao: PERIODS[0], gtDinhGia: 500 },
    { maTsDg: 'DG000006', kyBaoCao: PERIODS[1], gtDinhGia: 500 },
    { maTsDg: 'DG000006', kyBaoCao: PERIODS[2], gtDinhGia: 500 },
    // A7: phát sinh mới (không ở đầu kỳ, không TSBĐ)
    { maTsDg: 'DG000007', kyBaoCao: PERIODS[1], gtDinhGia: 700 },
    { maTsDg: 'DG000007', kyBaoCao: PERIODS[2], gtDinhGia: 700 },
    // A8: không còn cuối kỳ
    { maTsDg: 'DG000008', kyBaoCao: PERIODS[0], gtDinhGia: 800 },
  ]
  const collateralSnapshots = [
    { maTsbd: 'BD1', maTsDg: 'DG000001', kyBaoCao: PERIODS[0], gtBaoDam: 100, duNoTsbd: 10, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD1', maTsDg: 'DG000001', kyBaoCao: PERIODS[1], gtBaoDam: 110, duNoTsbd: 12, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD1', maTsDg: 'DG000001', kyBaoCao: PERIODS[2], gtBaoDam: 120, duNoTsbd: 15, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD2', maTsDg: 'DG000002', kyBaoCao: PERIODS[0], gtBaoDam: 130, duNoTsbd: 20, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD2', maTsDg: 'DG000002', kyBaoCao: PERIODS[1], gtBaoDam: 120, duNoTsbd: 20, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD2', maTsDg: 'DG000002', kyBaoCao: PERIODS[2], gtBaoDam: 100, duNoTsbd: 20, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD3', maTsDg: 'DG000003', kyBaoCao: PERIODS[0], gtBaoDam: 200, duNoTsbd: 0, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD3', maTsDg: 'DG000003', kyBaoCao: PERIODS[1], gtBaoDam: 200, duNoTsbd: 0, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD3', maTsDg: 'DG000003', kyBaoCao: PERIODS[2], gtBaoDam: 200, duNoTsbd: 0, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD4', maTsDg: 'DG000004', kyBaoCao: PERIODS[0], gtBaoDam: 300, duNoTsbd: 30, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD4', maTsDg: 'DG000004', kyBaoCao: PERIODS[1], gtBaoDam: 300, duNoTsbd: 30, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD4', maTsDg: 'DG000004', kyBaoCao: PERIODS[2], gtBaoDam: 300, duNoTsbd: 30, trangThaiTsbd: 'Đã giải chấp', ngayGiaiChap: '2026-08-15' },
    { maTsbd: 'BD5', maTsDg: 'DG000005', kyBaoCao: PERIODS[0], gtBaoDam: 400, duNoTsbd: 40, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD5', maTsDg: 'DG000005', kyBaoCao: PERIODS[1], gtBaoDam: 410, duNoTsbd: 40, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD6', maTsDg: 'DG000006', kyBaoCao: PERIODS[1], gtBaoDam: 500, duNoTsbd: 60, trangThaiTsbd: 'Đang bảo đảm' },
    { maTsbd: 'BD6', maTsDg: 'DG000006', kyBaoCao: PERIODS[2], gtBaoDam: 500, duNoTsbd: 60, trangThaiTsbd: 'Đang bảo đảm' },
  ]
  const valuationRisks = [
    { maTsDg: 'DG000001', kyBaoCao: PERIODS[2], loaiRuiRo: 'Định giá cao' },
    { maTsDg: 'DG000002', kyBaoCao: PERIODS[0], loaiRuiRo: 'Định giá cao' },
    { maTsDg: 'DG000002', kyBaoCao: PERIODS[1], loaiRuiRo: 'Định giá cao' },
    { maTsDg: 'DG000003', kyBaoCao: PERIODS[1], loaiRuiRo: 'Định giá cao' },
    { maTsDg: 'DG000004', kyBaoCao: PERIODS[0], loaiRuiRo: 'Định giá cao' },
  ]

  return buildCanonicalExcelData({ assetMaster, valuationSnapshots, collateralSnapshots, valuationRisks, customers: [], collateralCustomers: [] })
}

function runScenarioChecks(dataset) {
  const fromAssets = getAssetsByReportingPeriod(FROM_PERIOD, dataset)
  const toAssets = getAssetsByReportingPeriod(TO_PERIOD, dataset)
  const assetsByPeriodInRange = PERIODS.map((period) => ({ period, assets: getAssetsByReportingPeriod(period, dataset) }))

  const items = buildComparisonAssets({
    fromAssets,
    toAssets,
    assetsByPeriodInRange,
    fromPeriod: FROM_PERIOD,
    toPeriod: TO_PERIOD,
    dataset,
  })

  const byId = new Map(items.map((item) => [item.maTsDg, item]))
  const id = (n) => `DG${String(n).padStart(6, '0')}`
  const riskOnlyIn = (keys, risk) => keys.every((m) => m.riskTypesOccurredInRange.includes(risk))

  console.log('\n[SEMANTICS] buildComparisonAssets (range 3 kỳ)')
  check('union = 8 tài sản (A7 chỉ cuối, A8 chỉ đầu)', items.length === 8, `got ${items.length}`)

  check('A1: valuationChange +20', byId.get(id(1)).valuationChange === 20)
  check('A1: debtChange +5 (snapshot)', byId.get(id(1)).debtChange === 5)
  check('A1: status Tăng GT định giá', byId.get(id(1)).changeStatus === 'Tăng GT định giá')
  check('A1: newRiskTypesAtEnd = [Định giá cao]', JSON.stringify(byId.get(id(1)).newRiskTypesAtEnd) === JSON.stringify(['Định giá cao']))
  check('A1: riskTypesOccurredInRange chỉ 1 loại', riskOnlyIn([byId.get(id(1))], 'Định giá cao') && byId.get(id(1)).riskTypesOccurredInRange.length === 1)

  check('A2: valuationChange -30', byId.get(id(2)).valuationChange === -30)
  check('A2: status Giảm GT định giá', byId.get(id(2)).changeStatus === 'Giảm GT định giá')
  check('A2: newRiskTypesAtEnd rỗng (rủi ro trùng đầu kỳ)', byId.get(id(2)).newRiskTypesAtEnd.length === 0)
  check('A2: riskTypesOccurredInRange rỗng (cùng loại >1 kỳ không đếm lại)', byId.get(id(2)).riskTypesOccurredInRange.length === 0)

  check('A3: status Không thay đổi', byId.get(id(3)).changeStatus === 'Không thay đổi')
  check('A3: risk phát sinh ở kỳ giữa vẫn ghi nhận trong khoảng', byId.get(id(3)).riskTypesOccurredInRange.length === 1 && riskOnlyIn([byId.get(id(3))], 'Định giá cao'))

  check('A4: status Đã giải chấp', byId.get(id(4)).changeStatus === 'Đã giải chấp')
  check('A4: toDebt lấy từ snapshot giải chấp (30)', byId.get(id(4)).toDebt === 30)

  check('A5: status Không còn xuất hiện trong nguồn', byId.get(id(5)).changeStatus === 'Không còn xuất hiện trong nguồn')
  check('A5: toDebt fallback về asset (0)', byId.get(id(5)).toDebt === 0)
  check('A5: debtChange -40', byId.get(id(5)).debtChange === -40)

  check('A6: status Phát sinh TSBĐ', byId.get(id(6)).changeStatus === 'Phát sinh TSBĐ')
  check('A6: toDebt 60 từ snapshot phát sinh', byId.get(id(6)).toDebt === 60)

  check('A7: fromAsset undefined (không ở đầu kỳ)', byId.get(id(7)).fromAsset === undefined)
  check('A7: status Phát sinh mới', byId.get(id(7)).changeStatus === 'Phát sinh mới')
  check('A7: fromValuation 0', byId.get(id(7)).fromValuation === 0)

  check('A8: toAsset undefined (không ở cuối kỳ)', byId.get(id(8)).toAsset === undefined)
  check('A8: status Không còn cuối kỳ', byId.get(id(8)).changeStatus === 'Không còn cuối kỳ')
  check('A8: valuationChange -800', byId.get(id(8)).valuationChange === -800)

  console.log('\n[SEMANTICS] filterComparisonAssets')

  const filter = (changeType, valuationRisk = 'Tất cả') =>
    filterComparisonAssets(items, { changeType, valuationRisk }).map((item) => item.maTsDg)

  check('Phát sinh rủi ro mới / Tất cả = [A1]', JSON.stringify(filter('Phát sinh rủi ro mới')) === JSON.stringify([id(1)]))
  check('Phát sinh rủi ro trong khoảng / Định giá cao = [A1, A3]', JSON.stringify(filter('Phát sinh rủi ro trong khoảng', 'Định giá cao')) === JSON.stringify([id(1), id(3)]))
  check('Giải chấp = [A4]', JSON.stringify(filter('Giải chấp')) === JSON.stringify([id(4)]))
  check('Không còn xuất hiện trong nguồn = [A5]', JSON.stringify(filter('Không còn xuất hiện trong nguồn')) === JSON.stringify([id(5)]))
  check('Phát sinh mới = [A7]', JSON.stringify(filter('Phát sinh mới')) === JSON.stringify([id(7)]))
  check('Tăng GT định giá = [A1, A5, A7] (A5 cũng +20)', JSON.stringify(filter('Tăng GT định giá')) === JSON.stringify([id(1), id(5), id(7)]))
  check('Giảm GT định giá = [A2, A8]', JSON.stringify(filter('Giảm GT định giá')) === JSON.stringify([id(2), id(8)]))
  check('Dư nợ tăng = [A1, A6]', JSON.stringify(filter('Dư nợ tăng')) === JSON.stringify([id(1), id(6)]))
  check('Dư nợ giảm = [A5]', JSON.stringify(filter('Dư nợ giảm')) === JSON.stringify([id(5)]))
  check('Tất cả / Không phát hiện: giữ 6 (loại A1 rủi ro + A8 không toAsset)', filter('Tất cả', 'Không phát hiện').length === 6)
  check('Tất cả / Định giá cao: chỉ A1 (rủi ro cuối kỳ)', JSON.stringify(filter('Tất cả', 'Định giá cao')) === JSON.stringify([id(1)]))
  check('Không còn cuối kỳ (không có nhánh riêng) → tất cả', filter('Không còn cuối kỳ').length === 8)

  console.log('\n[SEMANTICS] Fast path From===To (from===to → single-period identical)')
  const sameP = FROM_PERIOD
  const sameAssetsFrom = getAssetsByReportingPeriod(sameP, dataset)
  const sameItems = buildComparisonAssets({
    fromAssets: sameAssetsFrom,
    toAssets: sameAssetsFrom,
    assetsByPeriodInRange: [{ period: sameP, assets: sameAssetsFrom }],
    fromPeriod: sameP,
    toPeriod: sameP,
    dataset,
  })
  const sameById = new Map(sameItems.map((item) => [item.maTsDg, item]))
  check('fast path length = union of P1 assets (7 — A7 only exists from P2)', sameItems.length === 7)
  check('fast path all changeStatus = Không thay đổi', sameItems.every((item) => item.changeStatus === 'Không thay đổi'))
  check('fast path all valuationChange = 0', sameItems.every((item) => item.valuationChange === 0))
  check('fast path all debtChange = 0', sameItems.every((item) => item.debtChange === 0))
  check('fast path all newRiskTypesAtEnd = []', sameItems.every((item) => item.newRiskTypesAtEnd.length === 0))
  check('fast path all riskTypesOccurredInRange = []', sameItems.every((item) => item.riskTypesOccurredInRange.length === 0))
  check('fast path: A1 fromAsset === toAsset (same ref)', sameById.get(id(1)).fromAsset === sameById.get(id(1)).toAsset)

  console.log('\n[SEMANTICS] sliceForTable (bảng range phải giới hạn như Một kỳ)')
  const big = Array.from({ length: 600 }, (_, i) => ({ maTsDg: `R${i + 1}` }))
  const sliced = sliceForTable(big)
  check(`sliceForTable cắt còn ${TABLE_RENDER_LIMIT} dòng`, sliced.length === TABLE_RENDER_LIMIT)
  check('sliceForTable giữ thứ tự', sliced[0].maTsDg === 'R1' && sliced[TABLE_RENDER_LIMIT - 1].maTsDg === `R${TABLE_RENDER_LIMIT}`)
}

/* ===================================================================
   2. PERFORMANCE — dữ liệu sinh quy mô (20k assets × 3 kỳ traffic)
   =================================================================== */

const provinces = ['Hà Nội', 'TP. Hồ Chí Minh', 'Hải Phòng', 'Đà Nẵng', 'Cần Thơ', 'Huế', 'Nghệ An', 'Quảng Ninh']
const coords = [[21.0285, 105.8542], [10.7769, 106.7009], [20.8449, 106.6881], [16.0544, 108.2022], [10.0452, 105.7469], [16.4637, 107.5909], [18.6796, 105.6813], [20.9510, 107.0800]]

function makeLargeDataset(N) {
  const extractedData = { assetMaster: [], valuationSnapshots: [], collateralSnapshots: [], valuationRisks: [], customers: [], collateralCustomers: [] }
  for (let i = 1; i <= N; i += 1) {
    const code = String(i).padStart(6, '0')
    const maTsDg = `DG${code}`
    const p = (i - 1) % provinces.length
    const [lat0, lon0] = coords[p]
    extractedData.assetMaster.push({ maTsDg, tenTaiSan: `TS ${code}`, nhomTsCap1: i % 20 < 13 ? 'BĐS' : 'Động sản', loaiTsCap2: 'Nhà đất', tinhTp: provinces[p], latitude: lat0, longitude: lon0 })
    PERIODS.forEach((period, periodIndex) => {
      const gt = 800_000_000 + ((i * 7_919_117) % 49_200_000_000) + periodIndex
      extractedData.valuationSnapshots.push({ kyBaoCao: period, maTsDg, gtDinhGia: gt })
      if (i % 5 !== 0) extractedData.collateralSnapshots.push({ kyBaoCao: period, maTsDg, maTsbd: `BD${code}`, gtBaoDam: gt * 0.7, duNoTsbd: gt * 0.4, trangThaiTsbd: 'Đang bảo đảm' })
      if (((i * 37 + periodIndex * 19) % 100) < 4) extractedData.valuationRisks.push({ kyBaoCao: period, maTsDg, loaiRuiRo: 'Định giá cao' })
    })
  }
  return buildCanonicalExcelData(extractedData)
}

function measureComparison(N) {
  const dataset = makeLargeDataset(N)
  const fromAssets = getAssetsByReportingPeriod(FROM_PERIOD, dataset)
  const toAssets = getAssetsByReportingPeriod(TO_PERIOD, dataset)
  const assetsByPeriodInRange = PERIODS.map((period) => ({ period, assets: getAssetsByReportingPeriod(period, dataset) }))
  const t0 = performance.now()
  const result = buildComparisonAssets({
    fromAssets,
    toAssets,
    assetsByPeriodInRange,
    fromPeriod: FROM_PERIOD,
    toPeriod: TO_PERIOD,
    dataset,
  })
  return { ms: performance.now() - t0, unionSize: result.length }
}

/* ===================================================================
   3. WIRING — App.jsx phải dùng service + slice cho bảng range
   =================================================================== */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.join(__dirname, '..', 'App.jsx'), 'utf8')
const wiredService = appSource.includes('rangeComparisonService')
const tableSlicesRange = appSource.includes('sliceForTable(')

/* ===================================================================
   RUN
   =================================================================== */

console.log('RANGE COMPARISON GUARDRAIL — V2.6.7')

runScenarioChecks(buildScenarioDataset())

console.log('\n[PERFORMANCE] buildComparisonAssets (1 pass, kỹ thuật hiện tại)')
const perf1000 = measureComparison(1000)
const perf2000 = measureComparison(2000)
const perf4000 = measureComparison(4000)
const ratio = perf4000.ms / perf2000.ms
console.log(`  N=1000  -> ${perf1000.ms.toFixed(1)}ms (union ${perf1000.unionSize})`)
console.log(`  N=2000  -> ${perf2000.ms.toFixed(1)}ms (union ${perf2000.unionSize})`)
console.log(`  N=4000  -> ${perf4000.ms.toFixed(1)}ms (union ${perf4000.unionSize})`)
console.log(`  ratio 4000/2000 = ${ratio.toFixed(2)}`)

console.log('\n[PERFORMANCE] HARD THRESHOLDS (đang ĐỎ → phải XANH sau tối ưu)')
check('N=4000 1 pass < 1000ms', perf4000.ms < 1000, `got ${perf4000.ms.toFixed(1)}ms (dự kiến ~2s trước tối ưu, ~10ms sau index Map)`)
console.log(`  (info) ratio 4000/2000 = ${ratio.toFixed(2)} — chỉ báo @n², không phải hard gate (nhạy nhiễu máy)`)

console.log('\n[WIRING] App.jsx dùng rangeComparisonService + sliceForTable cho bảng range')
check('App.jsx import rangeComparisonService', wiredService, 'chưa wire — refactor sau khi guardrail xanh')
check('bảng range dùng sliceForTable(', tableSlicesRange, 'hiện render toàn bộ filteredComparisonAssets (~30k row)')

console.log(`\nRANGE GUARDRAIL: ${passes.length} PASS, ${failures.length} FAIL`)
const reportOnly = process.env.RANGE_GUARDRAIL === 'report'
if (failures.length > 0 && !reportOnly) {
  console.log('→ GUARDRAIL ĐỎ (dự kiến trước khi tối ưu). Dùng RANGE_GUARDRAIL=report để chỉ báo cáo.')
  process.exit(1)
}
if (failures.length > 0) {
  console.log('→ report-only: failures được phép, exit 0.')
}