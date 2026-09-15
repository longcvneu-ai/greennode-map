
export function getPersistentRiskSummary({
  period,
  dataset = {},
  assetIds = null,
  riskType = null,
  minConsecutive = 2,
} = {}) {
  /*
   * Persistent risk chỉ được xác định từ chuỗi VALUATION_SNAPSHOT.
   * Không dùng kỳ chỉ xuất hiện ở collateral/risk để tránh kết luận sai rằng
   * dataset có đủ lịch sử định giá.
   */
  const periods = [
    ...new Set(
      (dataset.valuationSnapshots || [])
        .map((item) => item?.kyBaoCao)
        .filter(Boolean)
    ),
  ]
    .filter((item) => !period || item <= period)
    .sort()

  if (!period || periods.length < minConsecutive) {
    return {
      available: false,
      period: period || null,
      requiredPeriods: minConsecutive,
      availablePeriods: periods.length,
      persistentAssets: 0,
      threePlusAssets: 0,
      maxConsecutive: 0,
      items: [],
    }
  }

  const targetIndex = periods.indexOf(period)
  if (targetIndex < 0) {
    return {
      available: false,
      period,
      requiredPeriods: minConsecutive,
      availablePeriods: periods.length,
      persistentAssets: 0,
      threePlusAssets: 0,
      maxConsecutive: 0,
      items: [],
    }
  }

  const allowedIds = assetIds ? new Set(assetIds) : null
  const riskKeysByPeriod = new Map(periods.map((p) => [p, new Set()]))
  for (const risk of dataset.valuationRisks || []) {
    if (!risk?.kyBaoCao || !risk?.maTsDg) continue
    if (!riskKeysByPeriod.has(risk.kyBaoCao)) continue
    if (riskType && risk.loaiRuiRo !== riskType) continue
    riskKeysByPeriod.get(risk.kyBaoCao).add(risk.maTsDg)
  }

  // Chỉ các tài sản thực sự tồn tại trong snapshot của kỳ đích mới là ứng viên.
  const targetAssetIds = new Set(
    (dataset.valuationSnapshots || [])
      .filter((item) => item?.kyBaoCao === period && item?.maTsDg)
      .map((item) => item.maTsDg)
  )
  const assetById = new Map(
    (dataset.valuationAssets || [])
      .filter((asset) => asset?.maTsDg)
      .map((asset) => [asset.maTsDg, asset])
  )

  const currentRiskIds = riskKeysByPeriod.get(period) || new Set()
  const candidateIds = []
  for (const id of currentRiskIds) {
    if (!targetAssetIds.has(id)) continue
    if (allowedIds && !allowedIds.has(id)) continue
    candidateIds.push(id)
  }

  const items = []
  for (const maTsDg of candidateIds) {
    let consecutive = 0
    for (let i = targetIndex; i >= 0; i -= 1) {
      const p = periods[i]
      if (!riskKeysByPeriod.get(p)?.has(maTsDg)) break
      consecutive += 1
    }

    if (consecutive >= minConsecutive) {
      const asset = assetById.get(maTsDg)
      items.push({
        maTsDg,
        tenTaiSan: asset?.tenTaiSan || maTsDg,
        province: asset?.tinhTp || null,
        consecutivePeriods: consecutive,
      })
    }
  }

  items.sort(
    (a, b) =>
      b.consecutivePeriods - a.consecutivePeriods ||
      String(a.maTsDg).localeCompare(String(b.maTsDg))
  )

  return {
    available: true,
    period,
    requiredPeriods: minConsecutive,
    availablePeriods: periods.length,
    persistentAssets: items.length,
    threePlusAssets: items.filter((item) => item.consecutivePeriods >= 3).length,
    maxConsecutive: items.reduce(
      (max, item) => Math.max(max, item.consecutivePeriods),
      0
    ),
    items,
  }
}
