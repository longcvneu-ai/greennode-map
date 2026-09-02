const GENERATED_ASSET_COUNT = 95

function padNumber(number, length = 3) {
  return String(number).padStart(length, '0')
}

function getLocation(index) {
  if (index % 2 === 0) {
    return {
      tinhTp: 'Hà Nội',
      latitude: 21.0285 + (index % 10) * 0.003,
      longitude: 105.8542 + (index % 10) * 0.003,
    }
  }

  return {
    tinhTp: 'TP. Hồ Chí Minh',
    latitude: 10.7769 + (index % 10) * 0.003,
    longitude: 106.7009 + (index % 10) * 0.003,
  }
}

function getAssetType(index) {
  // Khoảng 70% BĐS, 30% Động sản
  if (index % 10 < 7) {
    const isApartment = index % 3 === 0

    return {
      nhomTsCap1: 'BĐS',
      loaiTsCap2: isApartment
        ? 'Căn hộ chung cư'
        : 'Nhà đất',
    }
  }

  const isCar = index % 2 === 0

  return {
    nhomTsCap1: 'Động sản',
    loaiTsCap2: isCar
      ? 'Ô tô'
      : 'Hàng hóa',
  }
}

function createValuationAsset(index) {
  const number = index + 5
  const code = padNumber(number)

  const location = getLocation(number)
  const assetType = getAssetType(number)

  return {
    recordId: `VAL_REC_${code}`,
    assetLinkId: null,

    maTsDg: `DG${code}`,
    tenTaiSan:
      `${assetType.loaiTsCap2} ${location.tinhTp} ${code}`,

    nhomTsCap1: assetType.nhomTsCap1,
    loaiTsCap2: assetType.loaiTsCap2,

    moTaTs:
      `Tài sản giả lập ${code} phục vụ kiểm thử GreenNode Map`,

    tinhTp: location.tinhTp,

    quanHuyenCu: 'Quận/Huyện giả lập',
    xaPhuongCu: 'Phường/Xã giả lập',
    xaPhuongMoi: 'Phường/Xã giả lập',

    diaChiChiTiet:
      `Địa chỉ giả lập ${code}, ${location.tinhTp}`,

    latitude: location.latitude,
    longitude: location.longitude,

    doChinhXacViTri: 'Giả lập',
  }
}

export function generateValuationAssets() {
  return Array.from(
    { length: GENERATED_ASSET_COUNT },
    (_, index) => createValuationAsset(index + 1)
  )
}
function getStartPeriod(number) {
  if (number <= 70) {
    return '2026-06-30'
  }

  if (number <= 85) {
    return '2026-07-31'
  }

  return '2026-08-31'
}

function getBaseValuation(number) {
  // Giá trị giả lập từ khoảng 2 đến 20 tỷ
  return (
    2000000000 +
    (number % 19) * 1000000000
  )
}

function getValuationByPeriod(
  baseValue,
  number,
  periodIndex
) {
  // Nhóm 1: GTĐG tăng
  if (number % 10 < 3) {
    return (
      baseValue +
      periodIndex * 500000000
    )
  }

  // Nhóm 2: GTĐG giảm
  if (number % 10 < 5) {
    return Math.max(
      baseValue -
        periodIndex * 500000000,
      500000000
    )
  }

  // Nhóm còn lại: không đổi
  return baseValue
}

function getValuationUnit(number, period) {
  // Một số tài sản đổi đơn vị định giá ở kỳ 08
  if (
    number % 10 === 0 &&
    period === '2026-08-31'
  ) {
    return 'Công ty định giá B'
  }

  if (number % 4 === 0) {
    return 'Công ty định giá A'
  }

  return 'Nội bộ'
}

export function generateValuationSnapshots() {
  const periods = [
    '2026-06-30',
    '2026-07-31',
    '2026-08-31',
  ]

  const snapshots = []

  for (let number = 6; number <= 100; number += 1) {
    const code = padNumber(number)
    const startPeriod = getStartPeriod(number)
    const baseValue = getBaseValuation(number)

    periods.forEach((period, periodIndex) => {
      if (period < startPeriod) {
        return
      }

      snapshots.push({
        kyBaoCao: period,
        valuationRecordId:
          `VAL_REC_${code}`,
        maTsDg: `DG${code}`,

        ngayDinhGia:
          period === '2026-06-30'
            ? `2026-06-${String(
                10 + (number % 18)
              ).padStart(2, '0')}`
            : period === '2026-07-31'
              ? `2026-07-${String(
                  10 + (number % 18)
                ).padStart(2, '0')}`
              : `2026-08-${String(
                  10 + (number % 18)
                ).padStart(2, '0')}`,

        gtDinhGia:
          getValuationByPeriod(
            baseValue,
            number,
            periodIndex
          ),

        donViDinhGia:
          getValuationUnit(
            number,
            period
          ),
      })
    })
  }

  return snapshots
}
function shouldCreateCollateral(number) {
  // DG001-DG005 đang được giữ nguyên làm bộ test gốc.
  // Với DG006-DG100, chọn cố định 76 tài sản làm TSBĐ.
  //
  // DG006-DG081 = 76 TSBĐ mới.
  // DG082-DG100 = chỉ là tài sản định giá.
  return number >= 6 && number <= 81
}

function getCollateralLiquidity(number) {
  if (number % 3 === 0) {
    return 'Trung bình'
  }

  return 'Khá'
}

function getManagementUnit(number) {
  return number % 2 === 0
    ? 'Đơn vị Hà Nội'
    : 'Đơn vị TP.HCM'
}

function createCollateralAsset(number) {
  const code = padNumber(number)

  const valuationValue = getBaseValuation(number)

  // GT bảo đảm giả lập bằng khoảng 80% GT định giá gốc.
  const collateralValue = Math.round(
    valuationValue * 0.8
  )

  // Dư nợ hiện tại giả lập bằng khoảng 60% GT bảo đảm.
  const outstanding = Math.round(
    collateralValue * 0.6
  )

  return {
    recordId: `COL_REC_${code}`,
    assetLinkId: null,

    valuationRecordId: `VAL_REC_${code}`,

    maTsDg: `DG${code}`,
    maTsbd: `BD${code}`,

    ngayNhanTsbd:
      number <= 70
        ? '2026-06-01'
        : '2026-07-01',

    gtBaoDam: collateralValue,
    duNoTsbd: outstanding,

    thanhKhoan:
      getCollateralLiquidity(number),

    trangThaiTsbd: 'Đang bảo đảm',

    ngayGiaiChap: null,

    donViQuanLy:
      getManagementUnit(number),
  }
}

export function generateCollateralAssets() {
  const collateralAssets = []

  for (
    let number = 6;
    number <= 100;
    number += 1
  ) {
    if (!shouldCreateCollateral(number)) {
      continue
    }

    collateralAssets.push(
      createCollateralAsset(number)
    )
  }

  return collateralAssets
}
function getCollateralStartPeriod(number) {
  // TSBĐ gắn với tài sản có từ kỳ 06
  if (number <= 70) {
    return '2026-06-30'
  }

  // Nhóm còn lại bắt đầu từ kỳ 07
  return '2026-07-31'
}

function getOutstandingByPeriod(
  collateralValue,
  number,
  periodIndex
) {
  const baseOutstanding =
    collateralValue * 0.6

  // Nhóm dư nợ tăng
  if (number % 10 < 3) {
    return Math.round(
      baseOutstanding +
        periodIndex * 200000000
    )
  }

  // Nhóm dư nợ giảm
  if (number % 10 < 6) {
    return Math.max(
      Math.round(
        baseOutstanding -
          periodIndex * 200000000
      ),
      0
    )
  }

  // Nhóm dư nợ ổn định
  return Math.round(baseOutstanding)
}

function getSnapshotLiquidity(
  number,
  period
) {
  // Một số TSBĐ thay đổi thanh khoản tại kỳ 08
  if (
    number % 12 === 0 &&
    period === '2026-08-31'
  ) {
    return 'Khá'
  }

  return getCollateralLiquidity(number)
}

function getSnapshotManagementUnit(
  number,
  period
) {
  // Một số TSBĐ đổi đơn vị quản lý tại kỳ 08
  if (
    number % 15 === 0 &&
    period === '2026-08-31'
  ) {
    return 'Đơn vị TP.HCM'
  }

  return getManagementUnit(number)
}

function isConfirmedRelease(number, period) {
  // Có căn cứ xác nhận đã giải chấp tại kỳ 08
  if (period !== '2026-08-31') {
    return false
  }

  return [20, 30, 40, 50, 60].includes(number)
}

function getConfirmedReleaseDate(number) {
  const releaseDates = {
    20: '2026-08-05',
    30: '2026-08-10',
    40: '2026-08-15',
    50: '2026-08-20',
    60: '2026-08-25',
  }

  return releaseDates[number] ?? null
}

function isMissingFromSource(number, period) {
  // Kỳ trước có nhưng kỳ 08 không còn xuất hiện.
  // Không tự kết luận là giải chấp.
  if (period !== '2026-08-31') {
    return false
  }

  return [71, 72, 73].includes(number)
}

export function generateCollateralSnapshots() {
  const periods = [
    '2026-06-30',
    '2026-07-31',
    '2026-08-31',
  ]

  const snapshots = []

  for (
    let number = 6;
    number <= 81;
    number += 1
  ) {
    const code = padNumber(number)

    const startPeriod =
      getCollateralStartPeriod(number)

    const valuationValue =
      getBaseValuation(number)

    const collateralValue =
      Math.round(valuationValue * 0.8)

    periods.forEach((period, periodIndex) => {
      if (period < startPeriod) {
        return
      }

      // Có ở kỳ trước nhưng kỳ này không còn trong nguồn.
      // Không tạo snapshot và không kết luận giải chấp.
      if (isMissingFromSource(number, period)) {
        return
      }

      const confirmedRelease =
        isConfirmedRelease(number, period)

      snapshots.push({
        kyBaoCao: period,

        collateralRecordId:
          `COL_REC_${code}`,

        valuationRecordId:
          `VAL_REC_${code}`,

        maTsbd: `BD${code}`,
        maTsDg: `DG${code}`,

        gtBaoDam: confirmedRelease
          ? 0
          : collateralValue,

        duNoTsbd: confirmedRelease
          ? 0
          : getOutstandingByPeriod(
              collateralValue,
              number,
              periodIndex
            ),

        thanhKhoan: confirmedRelease
          ? null
          : getSnapshotLiquidity(
              number,
              period
            ),

        trangThaiTsbd: confirmedRelease
          ? 'Đã giải chấp'
          : 'Đang bảo đảm',

        ngayGiaiChap: confirmedRelease
          ? getConfirmedReleaseDate(number)
          : null,

        donViQuanLy:
          getSnapshotManagementUnit(
            number,
            period
          ),
      })
    })
  }

  return snapshots
}