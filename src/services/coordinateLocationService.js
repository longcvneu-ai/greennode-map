/*
 * GREENNODE — EXACT CO-LOCATION GROUP (map presentation layer)
 * ============================================================
 * Phát hiện tài sản có CÙNG CHÍNH XÁC latitude + longitude hợp lệ
 * (co-located siblings) để popup bản đồ liệt kê/truy cập nhanh, KHÔNG
 * jitter, KHÔNG bịa tọa độ, KHÔNG sửa dữ liệu gốc.
 *
 * Ràng buộc kiến trúc:
 *  - pure, O(n), không vòng lặp lồng nhau
 *  - không mutate asset / dataset / business / KPI / AI
 *  - key nhóm = đẳng thức số học chính xác của latitude & longitude
 *  - định nghĩa rủi ro ĐỒNG BỘ với logic render marker trong AssetMap
 *    (Array.isArray(asset.risks) && asset.risks.length > 0)
 */

import { hasValidCoordinate } from './coordinateProvenanceService.js'

export function coordinateKey(latitude, longitude) {
  return `${Number(latitude)},${Number(longitude)}`
}

export function hasRisk(asset) {
  return Boolean(asset) &&
    Array.isArray(asset.risks) &&
    asset.risks.length > 0
}

/*
  O(n): nhóm tài sản có tọa độ hợp lệ theo đẳng thức chính xác.
  Trả về Map<coordKey, Asset[]>.
  Assets thiếu tọa độ hợp lệ bị bỏ qua (không thuộc nhóm nào).
*/
export function buildCoordinateGroups(assets = []) {
  const groups = new Map()
  for (const asset of assets) {
    if (!hasValidCoordinate(asset)) {
      continue
    }
    const key = coordinateKey(asset.latitude, asset.longitude)
    const list = groups.get(key)
    if (list) {
      list.push(asset)
    } else {
      groups.set(key, [asset])
    }
  }
  return groups
}

/*
  O(n) chỉ trên 1 nhóm: số tài sản có rủi ro trong nhóm cùng tọa độ.
*/
export function coordinateGroupRiskCount(group = []) {
  let count = 0
  for (const asset of group) {
    if (hasRisk(asset)) {
      count += 1
    }
  }
  return count
}