import { performance } from 'node:perf_hooks'
import { getAssetsByReportingPeriod } from './assetService.js'
import { createRiskIntentPlan } from '../AI/v2/riskIntentPlanner.js'
import { executeQueryPlan } from '../AI/v2/queryPlanExecutor.js'
import { formatQueryAnswer } from '../AI/v2/queryAnswerFormatter.js'

const ASSETS_PER_PERIOD = 20000
const PERIODS = ['2026-06-30', '2026-07-31', '2026-08-31']
const provinces = [
  'Hà Nội','TP. Hồ Chí Minh','Hải Phòng','Huế','Đà Nẵng','Cần Thơ',
  'Lai Châu','Điện Biên','Sơn La','Lào Cai','Tuyên Quang','Cao Bằng',
  'Lạng Sơn','Thái Nguyên','Phú Thọ','Bắc Ninh','Hưng Yên','Ninh Bình',
  'Quảng Ninh','Thanh Hóa','Nghệ An','Hà Tĩnh','Quảng Trị','Quảng Ngãi',
  'Gia Lai','Đắk Lắk','Khánh Hòa','Lâm Đồng','Đồng Nai','Tây Ninh',
  'Vĩnh Long','Đồng Tháp','An Giang','Cà Mau'
]
const coords = [
  [21.0285,105.8542],[10.7769,106.7009],[20.8449,106.6881],[16.4637,107.5909],
  [16.0544,108.2022],[10.0452,105.7469],[22.3864,103.4703],[21.3860,103.0230],
  [21.3270,103.9141],[22.4809,103.9755],[21.8233,105.2140],[22.6666,106.2630],
  [21.8537,106.7615],[21.5942,105.8482],[21.2684,105.2046],[21.1861,106.0763],
  [20.6464,106.0511],[20.2506,105.9745],[20.9510,107.0800],[19.8067,105.7852],
  [18.6796,105.6813],[18.3559,105.8877],[16.8163,107.1003],[15.1205,108.7923],
  [13.9718,108.0151],[12.6662,108.0382],[12.2388,109.1967],[11.9404,108.4583],
  [10.9453,106.8240],[11.3352,106.1099],[10.2537,105.9722],[10.4938,105.6882],
  [10.5216,105.1259],[9.1769,105.1524]
]

const extractedData = {
  assetMaster: [],
  valuationSnapshots: [],
  collateralSnapshots: [],
  valuationRisks: [],
  customers: [],
  collateralCustomers: [],
}

// Master: 20k tài sản, được snapshot ở cả 3 kỳ => 60k valuation snapshot records.
for (let i = 1; i <= ASSETS_PER_PERIOD; i += 1) {
  const code = String(i).padStart(6, '0')
  const maTsDg = `DG${code}`
  const p = (i - 1) % provinces.length
  const [lat0, lon0] = coords[p]
  const mod = i % 20
  const nhomTsCap1 = mod < 13 ? 'BĐS' : 'Động sản'
  const loaiTsCap2 = mod < 9 ? 'Nhà đất' : mod < 13 ? 'CHCC' : mod < 17 ? 'Ô tô' : 'Hàng hóa'

  extractedData.assetMaster.push({
    maTsDg,
    tenTaiSan: `${loaiTsCap2} ${provinces[p]} ${code}`,
    nhomTsCap1,
    loaiTsCap2,
    tinhTp: provinces[p],
    latitude: lat0 + (((i % 127) - 63) * 0.00045),
    longitude: lon0 + ((((i * 3) % 131) - 65) * 0.00045),
  })

  PERIODS.forEach((period, periodIndex) => {
    const baseValuation = 800_000_000 + ((i * 7_919_117) % 49_200_000_000)
    const gtDinhGia = Math.round(baseValuation * (1 + periodIndex * 0.01 + ((i % 7) - 3) * 0.002))
    const month = 6 + periodIndex

    extractedData.valuationSnapshots.push({
      kyBaoCao: period,
      maTsDg,
      ngayDinhGia: `2026-${String(month).padStart(2, '0')}-${String(10 + (i % 18)).padStart(2, '0')}`,
      gtDinhGia,
      donViDinhGia: `ĐV định giá ${(i % 4) + 1}`,
    })

    if (i % 5 !== 0) {
      const gtBaoDam = Math.round(gtDinhGia * (0.76 + (i % 7) * 0.02))
      const duNoTsbd = Math.round(gtBaoDam * (0.48 + (i % 8) * 0.035 + periodIndex * 0.005))
      extractedData.collateralSnapshots.push({
        kyBaoCao: period,
        maTsDg,
        maTsbd: `BD${code}`,
        gtBaoDam,
        duNoTsbd,
        thanhKhoan: i % 3 ? 'Khá' : 'Trung bình',
        trangThaiTsbd: (periodIndex === 2 && i % 997 === 0) ? 'Đã giải chấp' : 'Đang bảo đảm',
        donViQuanLy: `Đơn vị quản lý ${(i % 12) + 1}`,
      })
    }

    // Khoảng 4%, nhưng thay đổi theo từng kỳ để test cross-period.
    if (((i * 37 + periodIndex * 19 + Math.floor(i / 34)) % 100) < 4) {
      extractedData.valuationRisks.push({
        riskId: `RISK_${periodIndex + 1}_${String(extractedData.valuationRisks.length + 1).padStart(7, '0')}`,
        kyBaoCao: period,
        maTsDg,
        loaiRuiRo: ['Định giá cao','Sai phương pháp','Sai thông tin tài sản'][(i + periodIndex) % 3],
        trangThaiXuLy: i % 2 ? 'Mới phát hiện' : 'Đang xử lý',
      })
    }
  })
}

const mem0 = process.memoryUsage().heapUsed
const t0 = performance.now()

// Canonical hóa tương đương Import Service nhưng không phụ thuộc thư viện XLSX,
// để benchmark thuần data layer / query executor trong Node.
const valuationAssets = extractedData.assetMaster.map((row, index) => ({
  recordId: `VAL_TEST_${String(index + 1).padStart(6, '0')}`,
  ...row,
}))
const valuationRecordIdByMaTsDg = new Map(valuationAssets.map((a) => [a.maTsDg, a.recordId]))
const valuationSnapshots = extractedData.valuationSnapshots.map((row) => ({
  ...row,
  valuationRecordId: valuationRecordIdByMaTsDg.get(row.maTsDg),
}))

const collateralFirstByMaTsbd = new Map()
for (const row of extractedData.collateralSnapshots) {
  if (!collateralFirstByMaTsbd.has(row.maTsbd)) collateralFirstByMaTsbd.set(row.maTsbd, row)
}
const collateralRecordIdByMaTsbd = new Map(
  [...collateralFirstByMaTsbd.keys()].map((maTsbd, index) => [maTsbd, `COL_TEST_${String(index + 1).padStart(6, '0')}`])
)
const collateralAssets = [...collateralFirstByMaTsbd.entries()].map(([maTsbd, row]) => ({
  recordId: collateralRecordIdByMaTsbd.get(maTsbd),
  valuationRecordId: valuationRecordIdByMaTsDg.get(row.maTsDg),
  maTsDg: row.maTsDg,
  maTsbd,
  ngayNhanTsbd: null,
  ngayGiaiChap: null,
}))
const collateralSnapshots = extractedData.collateralSnapshots.map((row) => ({
  ...row,
  collateralRecordId: collateralRecordIdByMaTsbd.get(row.maTsbd),
  valuationRecordId: valuationRecordIdByMaTsDg.get(row.maTsDg),
}))
const valuationRisks = extractedData.valuationRisks.map((row) => ({
  ...row,
  valuationRecordId: valuationRecordIdByMaTsDg.get(row.maTsDg),
}))
const canonical = {
  valuationAssets,
  valuationSnapshots,
  collateralAssets,
  collateralSnapshots,
  valuationRisks,
  customers: [],
  collateralCustomers: [],
}
const t1 = performance.now()
const snapshots = Object.fromEntries(PERIODS.map((p) => [p, getAssetsByReportingPeriod(p, canonical)]))
const t2 = performance.now()
const mem1 = process.memoryUsage().heapUsed

const expected = {}
for (const period of PERIODS) {
  const assets = snapshots[period]
  expected[period] = {
    assets: assets.length,
    provinces: new Set(assets.map((a) => a.tinhTp)).size,
    riskAssets: assets.filter((a) => a.coRuiRoDinhGia).length,
  }
}

function timeFilter(label, fn) {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  return { label, ms: +(end - start).toFixed(2), count: Array.isArray(result) ? result.length : result }
}

const august = snapshots['2026-08-31']
const filterBench = [
  timeFilter('province=Hà Nội', () => august.filter((a) => a.tinhTp === 'Hà Nội')),
  timeFilter('assetType=Ô tô', () => august.filter((a) => a.loaiTsCap2 === 'Ô tô')),
  timeFilter('risk=true', () => august.filter((a) => a.coRuiRoDinhGia)),
  timeFilter('province+risk+type', () => august.filter((a) => a.tinhTp === 'Hà Nội' && a.coRuiRoDinhGia && a.loaiTsCap2 === 'Nhà đất')),
]

const queryCases = [
  ['Có bao nhiêu tài sản rủi ro tháng 6/2026?', '2026-06-30'],
  ['Có bao nhiêu tài sản rủi ro tháng 7/2026?', '2026-07-31'],
  ['Có bao nhiêu tài sản rủi ro tháng 8/2026?', '2026-08-31'],
  ['Tài sản định giá rủi ro tập trung ở đâu trong tháng 8/2026?', '2026-08-31'],
  ['giá trị định giá bình quân tài sản rủi ro tháng 8/2026', '2026-08-31'],
  ['ô tô có phải tài sản rủi ro trong tháng 08/2026 không', '2026-08-31'],
  ['giá trị bình quân tài sản rủi ro tháng 6/2026, 07.2026', '2026-08-31'],
  ['Đơn vị nào có nhiều case sai nhất?', '2026-08-31'],
]

const queryResults = []
for (const [question, defaultPeriod] of queryCases) {
  const q0 = performance.now()
  const plan = createRiskIntentPlan(question, { defaultPeriod })
  const result = executeQueryPlan(plan, canonical)
  const answer = formatQueryAnswer(plan, result)
  const q1 = performance.now()
  queryResults.push({
    question,
    ms: +(q1 - q0).toFixed(2),
    success: result.success,
    answer: answer.slice(0, 180),
  })
}

const summary = {
  target: '60,000 snapshot records total = 20,000 x 3 periods',
  assetMaster: canonical.valuationAssets.length,
  valuationSnapshots: canonical.valuationSnapshots.length,
  collateralSnapshots: canonical.collateralSnapshots.length,
  riskRecords: canonical.valuationRisks.length,
  periods: expected,
  canonicalMs: +(t1 - t0).toFixed(2),
  build3PeriodsMs: +(t2 - t1).toFixed(2),
  totalDataLayerMs: +(t2 - t0).toFixed(2),
  heapDeltaMB: +((mem1 - mem0) / 1024 / 1024).toFixed(2),
  filters: filterBench,
  queries: queryResults,
  avgQueryMs: +(queryResults.reduce((s, x) => s + x.ms, 0) / queryResults.length).toFixed(2),
  maxQueryMs: +Math.max(...queryResults.map((x) => x.ms)).toFixed(2),
}

const assertions = [
  ['exactly 60k valuation snapshots', canonical.valuationSnapshots.length === 60000],
  ['20k assets each period', PERIODS.every((p) => snapshots[p].length === 20000)],
  ['34 provinces each period', PERIODS.every((p) => expected[p].provinces === 34)],
  ['all filters under 500ms', filterBench.every((x) => x.ms < 500)],
  ['all query execution under 500ms', queryResults.every((x) => x.ms < 500)],
  ['all queries successful', queryResults.every((x) => x.success)],
]

console.log(JSON.stringify(summary, null, 2))
console.log('\nASSERTIONS')
let failed = 0
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`)
  if (!ok) failed += 1
}
if (failed) process.exitCode = 1
