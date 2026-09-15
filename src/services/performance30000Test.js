import { performance } from 'node:perf_hooks'
import { buildCanonicalExcelData } from './excelImportService.js'
import { getAssetsByReportingPeriod } from './assetService.js'

const N = 30000
const PERIOD = '2026-08-31'
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

for (let i = 1; i <= N; i += 1) {
  const code = String(i).padStart(6, '0')
  const maTsDg = `DG${code}`
  const p = (i - 1) % provinces.length
  const [lat0, lon0] = coords[p]
  const mod = i % 20
  const nhomTsCap1 = mod < 13 ? 'BĐS' : 'Động sản'
  const loaiTsCap2 = mod < 9 ? 'Nhà đất' : mod < 13 ? 'CHCC' : mod < 17 ? 'Ô tô' : 'Hàng hóa'
  const gtDinhGia = 800_000_000 + ((i * 7_919_117) % 49_200_000_000)

  extractedData.assetMaster.push({
    maTsDg,
    tenTaiSan: `${loaiTsCap2} ${provinces[p]} ${code}`,
    nhomTsCap1,
    loaiTsCap2,
    tinhTp: provinces[p],
    latitude: lat0 + (((i % 127) - 63) * 0.00045),
    longitude: lon0 + ((((i * 3) % 131) - 65) * 0.00045),
  })
  extractedData.valuationSnapshots.push({
    kyBaoCao: PERIOD,
    maTsDg,
    ngayDinhGia: `2026-08-${String(10 + (i % 18)).padStart(2, '0')}`,
    gtDinhGia,
    donViDinhGia: `ĐV định giá ${(i % 4) + 1}`,
  })

  if (i % 5 !== 0) {
    const gtBaoDam = Math.round(gtDinhGia * (0.76 + (i % 7) * 0.02))
    const duNoTsbd = Math.round(gtBaoDam * (0.48 + (i % 8) * 0.035))
    extractedData.collateralSnapshots.push({
      kyBaoCao: PERIOD,
      maTsDg,
      maTsbd: `BD${code}`,
      gtBaoDam,
      duNoTsbd,
      thanhKhoan: i % 3 ? 'Khá' : 'Trung bình',
      trangThaiTsbd: 'Đang bảo đảm',
      donViQuanLy: `Đơn vị quản lý ${(i % 12) + 1}`,
    })
  }

  if (((i * 37 + Math.floor(i / 34)) % 100) < 4) {
    extractedData.valuationRisks.push({
      riskId: `RISK_${String(extractedData.valuationRisks.length + 1).padStart(7, '0')}`,
      kyBaoCao: PERIOD,
      maTsDg,
      loaiRuiRo: ['Định giá cao','Sai phương pháp','Sai thông tin tài sản'][i % 3],
      trangThaiXuLy: i % 2 ? 'Mới phát hiện' : 'Đang xử lý',
    })
  }
}

const mem0 = process.memoryUsage().heapUsed
const t0 = performance.now()
const canonical = buildCanonicalExcelData(extractedData)
const t1 = performance.now()
const periodAssets = getAssetsByReportingPeriod(PERIOD, canonical)
const t2 = performance.now()
const mem1 = process.memoryUsage().heapUsed

const provinceSet = new Set(periodAssets.map((a) => a.tinhTp))
const riskCount = periodAssets.filter((a) => a.coRuiRoDinhGia).length
const located = periodAssets.filter((a) => a.latitude && a.longitude).length

console.log(JSON.stringify({
  assets: periodAssets.length,
  provinces: provinceSet.size,
  located,
  collateralSnapshots: canonical.collateralSnapshots.length,
  riskRecords: canonical.valuationRisks.length,
  riskAssets: riskCount,
  canonicalMs: Math.round((t1 - t0) * 10) / 10,
  periodBuildMs: Math.round((t2 - t1) * 10) / 10,
  totalMs: Math.round((t2 - t0) * 10) / 10,
  heapDeltaMB: Math.round(((mem1 - mem0) / 1024 / 1024) * 10) / 10,
}, null, 2))

const queryModuleStart = performance.now()
const { createRiskIntentPlan } = await import('../AI/v2/riskIntentPlanner.js')
const { executeQueryPlan } = await import('../AI/v2/queryPlanExecutor.js')
const { formatQueryAnswer } = await import('../AI/v2/queryAnswerFormatter.js')
const queryModuleEnd = performance.now()

const questions = [
  'Tài sản định giá rủi ro tập trung ở đâu trong tháng 8/2026?',
  'Có bao nhiêu tài sản rủi ro tháng 8/2026?',
  'giá trị định giá bình quân tài sản rủi ro tháng 8/2026',
  'ô tô có phải tài sản rủi ro trong tháng 08/2026 không',
  'Đơn vị nào có nhiều case sai nhất?',
]

const queryTimes = []
for (const question of questions) {
  const q0 = performance.now()
  const plan = createRiskIntentPlan(question, { defaultPeriod: PERIOD })
  const result = executeQueryPlan(plan, canonical)
  const answer = formatQueryAnswer(plan, result)
  const q1 = performance.now()
  queryTimes.push({
    question,
    ms: Math.round((q1 - q0) * 10) / 10,
    ok: result.success,
    preview: answer.slice(0, 120),
  })
}
console.log(JSON.stringify({
  aiModuleLoadMs: Math.round((queryModuleEnd - queryModuleStart) * 10) / 10,
  queryTimes,
  avgQueryMs: Math.round((queryTimes.reduce((s,x)=>s+x.ms,0)/queryTimes.length)*10)/10,
}, null, 2))
