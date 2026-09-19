/*
 * GREENNODE V2.6.7 — COORDINATE PROVENANCE MODEL
 * ==============================================
 * PROTECTED PRODUCT REQUIREMENT (map coordinate integrity + performance).
 *
 * Nguyên tắc:
 *  - EXACT : tài sản CÓ tọa độ thực hợp lệ (finite lat/lng) → luôn giữ nguyên,
 *            không bao giờ thay bằng tọa độ tỉnh.
 *  - PROVINCE : tài sản KHÔNG có tọa độ hợp lệ nhưng có tinhTp
 *            → fallback về tọa độ đại diện tỉnh (chỉ để hiển thị cấp tỉnh).
 *  - NONE : không có cả tọa độ lẫn tinhTp → loại khỏi bản đồ (hành vi cũ).
 *
 * KHÔNG đổi schema Excel, KHÔNG đổi business/KPI/risk/AI.
 * Mọi thao tác đều O(n) — không có vòng lặp lồng nhau / includes() trong vòng lặp.
 */

export const PROVINCE_CENTERS = [
  { name: 'Hà Nội', lat: 21.0285, lng: 105.8542 },
  { name: 'TP. Hồ Chí Minh', lat: 10.7769, lng: 106.7009 },
  { name: 'Hải Phòng', lat: 20.8449, lng: 106.6881 },
  { name: 'Huế', lat: 16.4637, lng: 107.5909 },
  { name: 'Đà Nẵng', lat: 16.0544, lng: 108.2022 },
  { name: 'Cần Thơ', lat: 10.0452, lng: 105.7469 },
  { name: 'Lai Châu', lat: 22.3864, lng: 103.4703 },
  { name: 'Điện Biên', lat: 21.3860, lng: 103.0230 },
  { name: 'Sơn La', lat: 21.3270, lng: 103.9141 },
  { name: 'Lào Cai', lat: 22.4809, lng: 103.9755 },
  { name: 'Tuyên Quang', lat: 21.8233, lng: 105.2140 },
  { name: 'Cao Bằng', lat: 22.6666, lng: 106.2630 },
  { name: 'Lạng Sơn', lat: 21.8537, lng: 106.7615 },
  { name: 'Thái Nguyên', lat: 21.5942, lng: 105.8482 },
  { name: 'Phú Thọ', lat: 21.2684, lng: 105.2046 },
  { name: 'Bắc Ninh', lat: 21.1861, lng: 106.0763 },
  { name: 'Hưng Yên', lat: 20.6464, lng: 106.0511 },
  { name: 'Ninh Bình', lat: 20.2506, lng: 105.9745 },
  { name: 'Quảng Ninh', lat: 20.9510, lng: 107.0800 },
  { name: 'Thanh Hóa', lat: 19.8067, lng: 105.7852 },
  { name: 'Nghệ An', lat: 18.6796, lng: 105.6813 },
  { name: 'Hà Tĩnh', lat: 18.3559, lng: 105.8877 },
  { name: 'Quảng Trị', lat: 16.8163, lng: 107.1003 },
  { name: 'Quảng Ngãi', lat: 15.1205, lng: 108.7923 },
  { name: 'Gia Lai', lat: 13.9718, lng: 108.0151 },
  { name: 'Đắk Lắk', lat: 12.6662, lng: 108.0382 },
  { name: 'Khánh Hòa', lat: 12.2388, lng: 109.1967 },
  { name: 'Lâm Đồng', lat: 11.9404, lng: 108.4583 },
  { name: 'Đồng Nai', lat: 10.9453, lng: 106.8240 },
  { name: 'Tây Ninh', lat: 11.3352, lng: 106.1099 },
  { name: 'Vĩnh Long', lat: 10.2537, lng: 105.9722 },
  { name: 'Đồng Tháp', lat: 10.4938, lng: 105.6882 },
  { name: 'An Giang', lat: 10.5216, lng: 105.1259 },
  { name: 'Cà Mau', lat: 9.1769, lng: 105.1524 },
]

const CENTER_BY_PROVINCE = new Map(
  PROVINCE_CENTERS.map((item) => [item.name, item])
)

export function getProvinceCenter(province) {
  const center = CENTER_BY_PROVINCE.get(province)
  return center ? { latitude: center.lat, longitude: center.lng } : null
}

export function hasValidCoordinate(asset) {
  if (!asset) return false
  const { latitude, longitude } = asset
  if (
    latitude === null ||
    latitude === undefined ||
    latitude === '' ||
    longitude === null ||
    longitude === undefined ||
    longitude === ''
  ) {
    return false
  }
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  )
}

export function resolveCoordinateSource(asset) {
  if (hasValidCoordinate(asset)) return 'EXACT'
  if (asset && asset.tinhTp) return 'PROVINCE'
  return 'NONE'
}

/*
  Một lượt O(n): tách tài sản theo provenance.
*/
export function classifyAssets(assets = []) {
  const exactAssets = []
  const provinceAssets = []
  const noneAssets = []
  for (const asset of assets) {
    const source = resolveCoordinateSource(asset)
    if (source === 'EXACT') exactAssets.push(asset)
    else if (source === 'PROVINCE') provinceAssets.push(asset)
    else noneAssets.push(asset)
  }
  return { exactAssets, provinceAssets, noneAssets }
}

/*
  O(n): gán tọa độ tỉnh đại diện cho các tài sản PROVINCE (chỉ khi không có tọa độ hợp lệ).
  Tài sản không tìm được tâm tỉnh sẽ bị đưa vào unreachable (không vẽ, không bịa tọa độ).
*/
export function assignProvinceFallback(provinceAssets = []) {
  const fallbackByMaTsDg = new Map()
  const unreachable = []
  for (const asset of provinceAssets) {
    const center = getProvinceCenter(asset.tinhTp)
    if (!center) {
      unreachable.push(asset)
      continue
    }
    fallbackByMaTsDg.set(asset.maTsDg, {
      latitude: center.latitude,
      longitude: center.longitude,
    })
  }
  return { fallbackByMaTsDg, unreachable }
}

const coordKey = (latitude, longitude) =>
  `${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`

/*
  Chuẩn bị dữ liệu map O(n):
  - phân loại EXACT / PROVINCE / NONE
  - gán fallback tỉnh (chỉ cho PROVINCE)
  - nhóm theo tỉnh để render marker tỉnh + danh sách tài sản
  - đếm số tọa độ riêng biệt (đảm bảo không bị nén về tâm tỉnh)
*/
export function prepareMapData(assets = []) {
  const { exactAssets, provinceAssets, noneAssets } =
    classifyAssets(assets)

  const { fallbackByMaTsDg, unreachable } =
    assignProvinceFallback(provinceAssets)

  const provinceAssetsMap = new Map()
  const entryByProvince = new Map()

  for (const asset of provinceAssets) {
    const fallback = fallbackByMaTsDg.get(asset.maTsDg)
    if (!fallback) continue

    const province = asset.tinhTp
    if (!provinceAssetsMap.has(province)) {
      provinceAssetsMap.set(province, [])
    }
    provinceAssetsMap.get(province).push(asset)

    const entry = entryByProvince.get(province) || {
      province,
      total: 0,
      risk: 0,
      latitude: fallback.latitude,
      longitude: fallback.longitude,
    }
    entry.total += 1
    if (
      Array.isArray(asset.risks) &&
      asset.risks.length > 0
    ) {
      entry.risk += 1
    }
    entryByProvince.set(province, entry)
  }

  const provinceEntries = Array.from(entryByProvince.values())

  const distinctCoordinates = new Set()
  for (const asset of exactAssets) {
    distinctCoordinates.add(
      coordKey(asset.latitude, asset.longitude)
    )
  }
  for (const entry of provinceEntries) {
    distinctCoordinates.add(coordKey(entry.latitude, entry.longitude))
  }

  const exactIdSet = new Set(
    exactAssets.map((asset) => asset.maTsDg)
  )

  return {
    exactAssets,
    provinceAssets,
    noneAssets: [
      ...noneAssets,
      ...unreachable,
    ],
    provinceEntries,
    provinceAssetsMap,
    exactIdSet,
    counts: {
      exact: exactAssets.length,
      province: provinceAssets.length,
      none: noneAssets.length,
      unreachable: unreachable.length,
    },
    distinctCoordinateCount: distinctCoordinates.size,
  }
}