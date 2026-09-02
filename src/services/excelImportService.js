import * as XLSX from 'xlsx'

/*
  Các sheet bắt buộc.

  Nếu thiếu một trong các sheet này
  GreenNode KHÔNG cho Import.
*/
const REQUIRED_SHEETS = [
  'ASSET_MASTER',
  'VALUATION_SNAPSHOT',
]

/*
  Các sheet nghiệp vụ mở rộng.

  Nếu thiếu:
  GreenNode vẫn có thể đọc dữ liệu,
  nhưng phải cảnh báo vì một số chức năng
  sẽ không có đủ thông tin.
*/
const OPTIONAL_SHEETS = [
  'COLLATERAL_SNAPSHOT',
  'VALUATION_RISK',
  'CUSTOMER_MASTER',
  'COLLATERAL_CUSTOMER',
]
const REQUIRED_COLUMNS = {
  ASSET_MASTER: [
    'maTsDg',
    'nhomTsCap1',
    'tinhTp',
  ],

  VALUATION_SNAPSHOT: [
    'kyBaoCao',
    'maTsDg',
    'gtDinhGia',
  ],

  COLLATERAL_SNAPSHOT: [
    'kyBaoCao',
    'maTsDg',
    'maTsbd',
  ],

  VALUATION_RISK: [
    'kyBaoCao',
    'maTsDg',
    'loaiRuiRo',
  ],

  CUSTOMER_MASTER: [
    'cif',
  ],

  COLLATERAL_CUSTOMER: [
    'maTsbd',
    'cif',
  ],
}
export const readExcelWorkbook = async (file) => {
  const arrayBuffer = await file.arrayBuffer()

  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
  })

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    workbook,
  }
}

/*
  Kiểm tra cấu trúc workbook.

  Bước này mới chỉ kiểm tra:
  - Sheet nào có
  - Sheet nào thiếu

  CHƯA kiểm tra cột và dữ liệu bên trong.
*/
export const validateWorkbookStructure = (
  workbook
) => {
  const existingSheets = workbook.SheetNames

  const requiredResults =
    REQUIRED_SHEETS.map((sheetName) => {
      const exists =
        existingSheets.includes(sheetName)

      return {
        sheetName,
        required: true,
        status: exists ? 'PASS' : 'ERROR',
        message: exists
          ? 'Đã tìm thấy sheet bắt buộc.'
          : 'Thiếu sheet bắt buộc.',
      }
    })

  const optionalResults =
    OPTIONAL_SHEETS.map((sheetName) => {
      const exists =
        existingSheets.includes(sheetName)

      return {
        sheetName,
        required: false,
        status: exists ? 'PASS' : 'WARNING',
        message: exists
          ? 'Đã tìm thấy sheet.'
          : 'Không tìm thấy sheet này.',
      }
    })

  const results = [
    ...requiredResults,
    ...optionalResults,
  ]

  const errorCount = results.filter(
    (item) => item.status === 'ERROR'
  ).length

  const warningCount = results.filter(
    (item) => item.status === 'WARNING'
  ).length

  return {
    results,
    errorCount,
    warningCount,

    canImport:
      errorCount === 0,
  }
}
export const validateWorkbookColumns = (
  workbook
) => {
  const results = []

  Object.entries(REQUIRED_COLUMNS).forEach(
    ([sheetName, requiredColumns]) => {
      const worksheet =
        workbook.Sheets[sheetName]

      // Sheet không tồn tại:
      // phần kiểm tra cấu trúc đã xử lý.
      if (!worksheet) {
        return
      }

      const rows = XLSX.utils.sheet_to_json(
        worksheet,
        {
          header: 1,
          defval: '',
        }
      )

      const headers = rows[0] || []

      requiredColumns.forEach(
        (columnName) => {
          const exists =
            headers.includes(columnName)

          results.push({
            sheetName,
            columnName,
            status: exists
              ? 'PASS'
              : 'ERROR',
            message: exists
              ? 'Đã tìm thấy trường.'
              : 'Không tìm thấy trường bắt buộc.',
          })
        }
      )
    }
  )

  const errorCount = results.filter(
    (item) => item.status === 'ERROR'
  ).length

  return {
    results,
    errorCount,
    canImport: errorCount === 0,
  }
}
export const validateValuationSnapshotRows = (
  workbook
) => {
  const worksheet =
    workbook.Sheets['VALUATION_SNAPSHOT']

  if (!worksheet) {
    return {
      results: [],
      errorCount: 0,
      canImport: true,
    }
  }

  const rows = XLSX.utils.sheet_to_json(
    worksheet,
    {
      defval: '',
      raw: true,
    }
  )

  const results = []

  rows.forEach((row, index) => {
    // +2 vì:
    // index bắt đầu từ 0
    // dòng 1 của Excel là tiêu đề
    const excelRow = index + 2

    // E101 - thiếu mã tài sản
    if (
      row.maTsDg === '' ||
      row.maTsDg === null ||
      row.maTsDg === undefined
    ) {
      results.push({
        code: 'E101',
        sheetName: 'VALUATION_SNAPSHOT',
        excelRow,
        columnName: 'maTsDg',
        status: 'ERROR',
        message: 'Mã tài sản không được để trống.',
      })
    }

    // E102 - thiếu kỳ báo cáo
    if (
      row.kyBaoCao === '' ||
      row.kyBaoCao === null ||
      row.kyBaoCao === undefined
    ) {
      results.push({
        code: 'E102',
        sheetName: 'VALUATION_SNAPSHOT',
        excelRow,
        columnName: 'kyBaoCao',
        status: 'ERROR',
        message: 'Kỳ báo cáo không được để trống.',
      })
    }

    // E103 - GT định giá phải có và phải là số
    if (
      row.gtDinhGia === '' ||
      row.gtDinhGia === null ||
      row.gtDinhGia === undefined ||
      typeof row.gtDinhGia !== 'number' ||
      Number.isNaN(row.gtDinhGia)
    ) {
      results.push({
        code: 'E103',
        sheetName: 'VALUATION_SNAPSHOT',
        excelRow,
        columnName: 'gtDinhGia',
        status: 'ERROR',
        message:
          'Giá trị định giá phải là một số hợp lệ.',
      })
    }

    // E104 - GT định giá không được âm
    if (
      typeof row.gtDinhGia === 'number' &&
      row.gtDinhGia < 0
    ) {
      results.push({
        code: 'E104',
        sheetName: 'VALUATION_SNAPSHOT',
        excelRow,
        columnName: 'gtDinhGia',
        status: 'ERROR',
        message:
          'Giá trị định giá không được nhỏ hơn 0.',
      })
    }
  })

  return {
    results,
    errorCount: results.length,
    canImport: results.length === 0,
  }
}
export const extractExcelData = (workbook) => {
  const readSheet = (sheetName) => {
    const worksheet =
      workbook.Sheets[sheetName]

    if (!worksheet) {
      return []
    }

    return XLSX.utils.sheet_to_json(
      worksheet,
      {
        defval: null,
        raw: true,
      }
    )
  }

  return {
    assetMaster:
      readSheet('ASSET_MASTER'),

    valuationSnapshots:
      readSheet('VALUATION_SNAPSHOT'),

    collateralSnapshots:
      readSheet('COLLATERAL_SNAPSHOT'),

    valuationRisks:
      readSheet('VALUATION_RISK'),

    customers:
      readSheet('CUSTOMER_MASTER'),

    collateralCustomers:
      readSheet('COLLATERAL_CUSTOMER'),
  }
}
const normalizeExcelDate = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  /*
    Excel có thể lưu ngày dưới dạng số serial.
  */
  if (typeof value === 'number') {
    const excelEpoch =
      new Date(Date.UTC(1899, 11, 30))

    const date = new Date(
      excelEpoch.getTime() +
        value * 24 * 60 * 60 * 1000
    )

    return date.toISOString().slice(0, 10)
  }

  /*
    Nếu đã là chuỗi yyyy-mm-dd
    thì giữ nguyên.
  */
  const text = String(value).trim()

  const parsedDate = new Date(text)

  if (Number.isNaN(parsedDate.getTime())) {
    return text
  }

  return parsedDate
    .toISOString()
    .slice(0, 10)
}

export const buildCanonicalExcelData = (
  extractedData
) => {
  if (!extractedData) {
    return null
  }

  /*
    1. ASSET MASTER
  */
  const valuationAssets =
    extractedData.assetMaster.map(
      (row, index) => {
        const recordId =
          row.recordId ||
          `VAL_XLSX_${String(
            index + 1
          ).padStart(6, '0')}`

        return {
          recordId,

          assetLinkId:
            row.assetLinkId || null,

          maTsDg:
            row.maTsDg || null,

          tenTaiSan:
            row.tenTaiSan || null,

          nhomTsCap1:
            row.nhomTsCap1 || null,

          loaiTsCap2:
            row.loaiTsCap2 || null,

          moTaTs:
            row.moTaTs || null,

          tinhTp:
            row.tinhTp || null,

          quanHuyenCu:
            row.quanHuyenCu || null,

          xaPhuongCu:
            row.xaPhuongCu || null,

          xaPhuongMoi:
            row.xaPhuongMoi || null,

          diaChiChiTiet:
            row.diaChiChiTiet || null,

          latitude:
            typeof row.latitude === 'number'
              ? row.latitude
              : null,

          longitude:
            typeof row.longitude === 'number'
              ? row.longitude
              : null,

          doChinhXacViTri:
            row.doChinhXacViTri || null,
        }
      }
    )

  /*
    Dùng Mã TS định giá để tìm recordId kỹ thuật.
  */
  const valuationRecordIdByMaTsDg =
    new Map(
      valuationAssets.map(
        (asset) => [
          asset.maTsDg,
          asset.recordId,
        ]
      )
    )

  /*
    2. VALUATION SNAPSHOT
  */
  const valuationSnapshots =
    extractedData.valuationSnapshots.map(
      (row) => ({
        valuationRecordId:
          valuationRecordIdByMaTsDg.get(
            row.maTsDg
          ) || null,

        maTsDg:
          row.maTsDg || null,

        kyBaoCao:
          normalizeExcelDate(
            row.kyBaoCao
          ),

        ngayDinhGia:
          normalizeExcelDate(
            row.ngayDinhGia
          ),

        gtDinhGia:
          typeof row.gtDinhGia === 'number'
            ? row.gtDinhGia
            : null,

        donViDinhGia:
          row.donViDinhGia || null,
      })
    )

  /*
    3. COLLATERAL SNAPSHOT

    V1 tạo recordId kỹ thuật theo maTsbd.
  */
  const collateralRecordIdByMaTsbd =
    new Map()

  extractedData.collateralSnapshots.forEach(
    (row, index) => {
      if (
        row.maTsbd &&
        !collateralRecordIdByMaTsbd.has(
          row.maTsbd
        )
      ) {
        collateralRecordIdByMaTsbd.set(
          row.maTsbd,
          row.recordId ||
            `COL_XLSX_${String(
              index + 1
            ).padStart(6, '0')}`
        )
      }
    }
  )
const collateralAssets =
  Array.from(
    collateralRecordIdByMaTsbd.entries()
  ).map(
    ([maTsbd, recordId]) => {
      const relatedRows =
        extractedData.collateralSnapshots.filter(
          (row) =>
            row.maTsbd === maTsbd
        )

      const firstRow =
        relatedRows[0]

      const rowWithReleaseDate =
        relatedRows.find(
          (row) =>
            row.ngayGiaiChap !== null &&
            row.ngayGiaiChap !== undefined &&
            row.ngayGiaiChap !== ''
        )

      return {
        recordId,

        valuationRecordId:
          valuationRecordIdByMaTsDg.get(
            firstRow?.maTsDg
          ) || null,

        maTsDg:
          firstRow?.maTsDg || null,

        maTsbd,

        ngayNhanTsbd:
          normalizeExcelDate(
            firstRow?.ngayNhanTsbd
          ),

        ngayGiaiChap:
          normalizeExcelDate(
            rowWithReleaseDate?.ngayGiaiChap
          ),
      }
    }
  )
  const collateralSnapshots =
    extractedData.collateralSnapshots.map(
      (row) => ({
        collateralRecordId:
          collateralRecordIdByMaTsbd.get(
            row.maTsbd
          ) || null,

        valuationRecordId:
          valuationRecordIdByMaTsDg.get(
            row.maTsDg
          ) || null,

        maTsDg:
          row.maTsDg || null,

        maTsbd:
          row.maTsbd || null,

        kyBaoCao:
          normalizeExcelDate(
            row.kyBaoCao
          ),

        ngayNhanTsbd:
          normalizeExcelDate(
            row.ngayNhanTsbd
          ),

        gtBaoDam:
          typeof row.gtBaoDam === 'number'
            ? row.gtBaoDam
            : 0,

        duNoTsbd:
          typeof row.duNoTsbd === 'number'
            ? row.duNoTsbd
            : 0,

        thanhKhoan:
          row.thanhKhoan || null,

        trangThaiTsbd:
          row.trangThaiTsbd || null,

        ngayGiaiChap:
          normalizeExcelDate(
            row.ngayGiaiChap
          ),

        donViQuanLy:
          row.donViQuanLy || null,
      })
    )

  /*
    4. RỦI RO
  */
  const valuationRisks =
    extractedData.valuationRisks.map(
      (row) => ({
        riskId:
          row.riskId || null,

        valuationRecordId:
          valuationRecordIdByMaTsDg.get(
            row.maTsDg
          ) || null,

        maTsDg:
          row.maTsDg || null,

        kyBaoCao:
          normalizeExcelDate(
            row.kyBaoCao
          ),

        loaiRuiRo:
          row.loaiRuiRo || null,

        trangThaiXuLy:
          row.trangThaiXuLy || null,

        moTa:
          row.moTa || null,
      })
    )

  /*
    5. KHÁCH HÀNG
  */
  const customers =
    extractedData.customers.map(
      (row) => ({
        cif:
          row.cif || null,

        tenKhachHang:
          row.tenKhachHang || null,

        loaiKhachHang:
          row.loaiKhachHang || null,
      })
    )

  /*
    6. QUAN HỆ TSBĐ - KHÁCH HÀNG
  */
  const collateralCustomers =
    extractedData.collateralCustomers.map(
      (row) => ({
        collateralRecordId:
          collateralRecordIdByMaTsbd.get(
            row.maTsbd
          ) || null,

        maTsbd:
          row.maTsbd || null,

        cif:
          row.cif || null,

        vaiTro:
          row.vaiTro || null,

        tuNgay:
          normalizeExcelDate(
            row.tuNgay
          ),

        denNgay:
          normalizeExcelDate(
            row.denNgay
          ),
      })
    )

  return {
  valuationAssets,
  valuationSnapshots,
  collateralAssets,
  collateralSnapshots,
  valuationRisks,
  customers,
  collateralCustomers,
}
}