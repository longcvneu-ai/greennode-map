/*
  Golden Test data generator — GreenNode Map V2.6.7
  TEST DATA ONLY. Không chạm source production.

  Output: greennode_golden_10000_assets_3periods.xlsx
  Schema: khớp 100% excelImportService.js hiện tại (cột như fixture 30.000 cũ).

  Golden cases trên VALUATION_RISK:
    2026-06-30: DG000001 → DG000600                                  (600)
    2026-07-31: DG000001 → DG000300 + DG000601 → DG001200            (900)
    2026-08-31: DG000001 → DG000100 + DG000601 → DG001000
                          + DG001201 → DG001900                      (1200)

  Kết quả golden tại 2026-08-31:
    Current risk          = 1200
    Persistent >= 2 kỳ    = 500   (DG000001-100: 3 kỳ liên tiếp, DG000601-1000: Jul+Aug)
    Persistent >= 3 kỳ    = 100
    Đúng 2 kỳ liên tiếp   = 400
*/
const XLSX = require('xlsx')
const path = require('node:path')

const PERIODS = ['2026-06-30', '2026-07-31', '2026-08-31']
const TOTAL = 10000
const PAD = (n) => String(n).padStart(6, '0')
const pad = PAD

const PROVINCES = [
  { name: 'Hà Nội', lat: 21.0285, lng: 105.8542 },
  { name: 'TP. Hồ Chí Minh', lat: 10.8231, lng: 106.6297 },
  { name: 'Đà Nẵng', lat: 16.0544, lng: 108.2022 },
  { name: 'Hải Phòng', lat: 20.8449, lng: 106.6881 },
  { name: 'Cần Thơ', lat: 10.0452, lng: 105.7469 },
  { name: 'Bắc Ninh', lat: 21.1861, lng: 106.0763 },
  { name: 'Quảng Ninh', lat: 21.0064, lng: 107.2926 },
  { name: 'Bình Dương', lat: 11.0499, lng: 106.6825 },
  { name: 'Đồng Nai', lat: 10.9574, lng: 106.8425 },
  { name: 'Thanh Hóa', lat: 19.8073, lng: 105.7764 },
]

const RISK_TYPES = ['Định giá cao', 'Sai phương pháp', 'Sai thông tin tài sản']
const GROWTH = { '2026-06-30': 0.0, '2026-07-31': 0.045, '2026-08-31': 0.09 }

const riskRangesByPeriod = {
  '2026-06-30': [[1, 600]],
  '2026-07-31': [[1, 300], [601, 1200]],
  '2026-08-31': [[1, 100], [601, 1000], [1201, 1900]],
}

const assetMaster = []
const valuationSnapshots = []
const collateralSnapshots = []
const valuationRisks = []
const customers = []
const collateralCustomers = []
const testExpected = []

function baseValue(i) {
  return 200_000_000 + (i - 1) * 1_754_313
}

function valueAt(i, period) {
  if (i % 5 === 0) return baseValue(i)
  const noise = (((i * 37 + PERIODS.indexOf(period) * 11) % 9) - 4) / 100
  return Math.round(baseValue(i) * (1 + GROWTH[period]) * (1 + noise))
}

let riskCounter = 0
for (let i = 1; i <= TOTAL; i += 1) {
  const idx = i - 1
  const maTsDg = `DG${pad(i)}`
  const maTsbd = `BD${pad(i)}`
  const cif = `CIF${pad(i)}`
  const prov = PROVINCES[idx % PROVINCES.length]
  const jitterLat = ((i * 7) % 19 - 9) / 1000
  const jitterLng = ((i * 13) % 19 - 9) / 1000

  const isBds = idx % 2 === 0
  const nhomTsCap1 = isBds ? 'BĐS' : 'Động sản'
  const loaiTsCap2 = isBds
    ? (i % 4 < 2 ? 'Nhà đất' : 'CHCC')
    : (i % 4 < 2 ? 'Ô tô' : 'Hàng hóa')

  assetMaster.push({
    maTsDg,
    tenTaiSan: `${loaiTsCap2} ${prov.name} ${pad(i)}`,
    nhomTsCap1,
    loaiTsCap2,
    tinhTp: prov.name,
    latitude: +(prov.lat + jitterLat).toFixed(4),
    longitude: +(prov.lng + jitterLng).toFixed(4),
  })

  PERIODS.forEach((period, pIdx) => {
    const gtDinhGia = valueAt(i, period)
    valuationSnapshots.push({
      kyBaoCao: period,
      maTsDg,
      ngayDinhGia: period === '2026-06-30' ? '2026-06-15'
        : period === '2026-07-31' ? '2026-07-15'
        : '2026-08-15',
      gtDinhGia,
      donViDinhGia: i % 3 === 0 ? 'Công ty định giá A'
        : i % 3 === 1 ? 'Nội bộ'
        : 'Công ty định giá B',
    })

    collateralSnapshots.push({
      kyBaoCao: period,
      maTsDg,
      maTsbd,
      gtBaoDam: Math.round(gtDinhGia * 0.62),
      duNoTsbd: Math.round(gtDinhGia * 0.62 * 0.58),
      thanhKhoan: i % 2 === 0 ? 'Khá' : 'Trung bình',
      donViQuanLy: `Đơn vị ${prov.name}`,
    })
  })

  PERIODS.forEach((period) => {
    const incident = riskRangesByPeriod[period].some(([a, b]) => i >= a && i <= b)
    if (!incident) return
    riskCounter += 1
    const loaiRuiRo = RISK_TYPES[(PERIODS.indexOf(period) + idx) % RISK_TYPES.length]
    valuationRisks.push({
      riskId: `RISK_GOLDEN_${pad(riskCounter)}`,
      kyBaoCao: period,
      maTsDg,
      loaiRuiRo,
      trangThaiXuLy: i % 2 === 0 ? 'Đang xử lý' : 'Mới phát hiện',
      moTa: `Golden ${loaiRuiRo} ${period} - ${maTsDg}`,
    })
  })

  customers.push({
    cif,
    tenKhachHang: i % 5 === 0 ? `Doanh nghiệp ${pad(i)}` : `Khách hàng ${pad(i)}`,
    loaiKhachHang: i % 5 === 0 ? 'Doanh nghiệp' : 'Cá nhân',
  })

  collateralCustomers.push({
    maTsbd,
    cif,
    vaiTro: i % 7 === 0 ? 'Bên bảo đảm' : 'Khách hàng vay',
  })
}

testExpected.push(
  {
    STT: 'A',
    Nhom: 'RISK_PERSISTENT',
    CauKiemTra: 'tài sản nào phát sinh rủi ro 2 kỳ liên tiếp',
    TinhTren: '2026-08-31',
    GiaTriKyVong: 500,
    LoaiKyVong: 'So luong tai san',
    MoTa: 'DG000001-100 (3 ky) + DG000601-1000 (Jul+Aug). Persistent >= 2 ky lien tiep.',
  },
  {
    STT: 'B',
    Nhom: 'RISK_PERSISTENT',
    CauKiemTra: 'tài sản nào phát sinh rủi ro 3 kỳ liên tiếp',
    TinhTren: '2026-08-31',
    GiaTriKyVong: 100,
    LoaiKyVong: 'So luong tai san',
    MoTa: 'DG000001-100 co rui ro o Jun, Jul, Aug (3 ky lien tiep).',
  },
  {
    STT: 'C',
    Nhom: 'KPI',
    CauKiemTra: 'Tài sản rủi ro kéo dài',
    TinhTren: '2026-08-31',
    GiaTriKyVong: 500,
    LoaiKyVong: 'KPI',
    MoTa: 'getPersistentRiskSummary({period: 2026-08-31, minConsecutive: 2}).persistentAssets.',
  },
  {
    STT: 'D',
    Nhom: 'CURRENT_RISK',
    CauKiemTra: 'Current risk tại 2026-08-31',
    TinhTren: '2026-08-31',
    GiaTriKyVong: 1200,
    LoaiKyVong: 'So luong tai san',
    MoTa: 'DG000001-100 + DG000601-1000 + DG001201-1900 tai ky 2026-08-31.',
  }
)

const workbook = XLSX.utils.book_new()
const sheetOf = (rows) => XLSX.utils.json_to_sheet(rows)
XLSX.utils.book_append_sheet(workbook, sheetOf(assetMaster), 'ASSET_MASTER')
XLSX.utils.book_append_sheet(workbook, sheetOf(valuationSnapshots), 'VALUATION_SNAPSHOT')
XLSX.utils.book_append_sheet(workbook, sheetOf(collateralSnapshots), 'COLLATERAL_SNAPSHOT')
XLSX.utils.book_append_sheet(workbook, sheetOf(valuationRisks), 'VALUATION_RISK')
XLSX.utils.book_append_sheet(workbook, sheetOf(customers), 'CUSTOMER_MASTER')
XLSX.utils.book_append_sheet(workbook, sheetOf(collateralCustomers), 'COLLATERAL_CUSTOMER')
XLSX.utils.book_append_sheet(workbook, sheetOf(testExpected), 'TEST_EXPECTED')

const outPath = path.join(__dirname, 'greennode_golden_10000_assets_3periods.xlsx')
XLSX.writeFile(workbook, outPath)

console.log(`Wrote ${outPath}`)
console.log(`ASSET_MASTER rows        : ${assetMaster.length}`)
console.log(`VALUATION_SNAPSHOT rows  : ${valuationSnapshots.length}`)
console.log(`COLLATERAL_SNAPSHOT rows : ${collateralSnapshots.length}`)
console.log(`VALUATION_RISK rows      : ${valuationRisks.length}`)
console.log(`CUSTOMER_MASTER rows     : ${customers.length}`)
console.log(`COLLATERAL_CUSTOMER rows : ${collateralCustomers.length}`)
console.log(`TEST_EXPECTED rows       : ${testExpected.length}`)
console.log(`sheets                   : ${workbook.SheetNames.join(', ')}`)