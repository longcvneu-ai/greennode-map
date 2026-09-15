/*
 * RANGE COMPARISON SERVICE (V2.6.7 GUARDRAIL MIRROR)
 * =====================================================
 * MIRROR của engine so sánh "Khoảng thời gian" hiện đang nằm trong
 * src/App.jsx (dòng ~456-687 cho buildComparisonAssets, ~689-818 cho
 * filterComparisonAssets, TABLE_RENDER_LIMIT/sliceForTable từ ~387-389).
 *
 * CHƯA được import bởi App.jsx. Mục đích:
 *   1. Cho guardrail test (src/services/rangeGuardrailTest.js) đo/khóa
 *      đúng ngữ nghĩa và hiệu năng của code hiện tại.
 *   2. Là nơi duy nhất sẽ được tối ưu (index Map / memo) SAU khi guardrail
 *      đỏ -> xanh, sau đó App.jsx chỉ cần wire vào đây (behavior-identical).
 *
 * QUY TẮC: ngữ nghĩa phải TRÙNG KHỚP 100% App.jsx. Không sửa logic ở đây
 * khi chưa hoàn tất bước guardrail.
 */

export const TABLE_RENDER_LIMIT = 500

const EMPTY_SET = new Set()

/*
 * Index helpers — dựng Map/Set MỘT lần, lookup O(1), thay cho
 * .find()/.filter() quét toàn mảng nhiều lần (O(n²) → O(n)).
 *
 * - indexById: giữ phần tử ĐẦU TIÊN với cùng maTsDg (first-wins),
 *   trùng đúng ngữ nghĩa `.find()`.
 * - getCollateralIndex: cache theo dataset (WeakMap) để không dựng lại
 *   khi re-render; giữ first-wins, khớp `.find(maTsDg + kyBaoCao)`.
 */

function indexById(assets) {
  const map = new Map()
  for (const asset of assets) {
    if (!map.has(asset.maTsDg)) {
      map.set(asset.maTsDg, asset)
    }
  }
  return map
}

function collateralKey(maTsDg, kyBaoCao) {
  return `${maTsDg}|${kyBaoCao}`
}

const collateralIndexCache = new WeakMap()

function getCollateralIndex(dataset) {
  const cached = collateralIndexCache.get(dataset)
  if (cached) {
    return cached
  }

  const index = new Map()
  const collateralSnapshots = dataset?.collateralSnapshots ?? []
  for (const item of collateralSnapshots) {
    const key = collateralKey(item?.maTsDg, item?.kyBaoCao)
    if (!index.has(key)) {
      index.set(key, item)
    }
  }
  collateralIndexCache.set(dataset, index)
  return index
}

function unionIds(fromAssets, toAssets) {
  return [
    ...new Set([
      ...fromAssets.map((asset) => asset.maTsDg),
      ...toAssets.map((asset) => asset.maTsDg),
    ]),
  ]
}

function buildComparisonItem(
  maTsDg,
  fromAsset,
  toAsset,
  collateralIndex,
  fromPeriod,
  toPeriod
) {
  const fromCollateralSnapshot =
    collateralIndex.get(collateralKey(maTsDg, fromPeriod)) ?? null
  const toCollateralSnapshot =
    collateralIndex.get(collateralKey(maTsDg, toPeriod)) ?? null

  const fromValuation = fromAsset?.gtDinhGia ?? 0
  const toValuation = toAsset?.gtDinhGia ?? 0
  const valuationChange = toValuation - fromValuation

  const fromDebt = fromCollateralSnapshot?.duNoTsbd ?? fromAsset?.duNoTsbd ?? 0
  const toDebt = toCollateralSnapshot?.duNoTsbd ?? toAsset?.duNoTsbd ?? 0
  const debtChange = toDebt - fromDebt

  const fromRiskTypes = new Set((fromAsset?.risks ?? []).map((risk) => risk.loaiRuiRo))
  const toRiskTypes = new Set((toAsset?.risks ?? []).map((risk) => risk.loaiRuiRo))

  const newRiskTypesAtEnd = [...toRiskTypes].filter(
    (riskType) => !fromRiskTypes.has(riskType)
  )

  let changeStatus = 'Không thay đổi'

  const fromCollateralActive =
    fromCollateralSnapshot?.trangThaiTsbd === 'Đang bảo đảm'
  const toCollateralActive =
    toCollateralSnapshot?.trangThaiTsbd === 'Đang bảo đảm'
  const toCollateralReleased =
    toCollateralSnapshot?.trangThaiTsbd === 'Đã giải chấp' &&
    Boolean(toCollateralSnapshot?.ngayGiaiChap)

  if (fromCollateralActive && toCollateralReleased) {
    changeStatus = 'Đã giải chấp'
  } else if (fromCollateralActive && !toCollateralSnapshot) {
    changeStatus = 'Không còn xuất hiện trong nguồn'
  } else if (!fromCollateralSnapshot && toCollateralActive) {
    changeStatus = 'Phát sinh TSBĐ'
  } else if (!fromAsset && toAsset && !fromCollateralSnapshot) {
    changeStatus = 'Phát sinh mới'
  } else if (fromAsset && !toAsset && !toCollateralSnapshot) {
    changeStatus = 'Không còn cuối kỳ'
  } else if (valuationChange > 0) {
    changeStatus = 'Tăng GT định giá'
  } else if (valuationChange < 0) {
    changeStatus = 'Giảm GT định giá'
  }

  return {
    maTsDg,
    fromAsset,
    toAsset,
    fromCollateralSnapshot,
    toCollateralSnapshot,
    fromValuation,
    toValuation,
    valuationChange,
    fromDebt,
    toDebt,
    debtChange,
    newRiskTypesAtEnd,
    riskTypesOccurredInRange: [],
    changeStatus,
  }
}

export function buildComparisonAssets({
  fromAssets,
  toAssets,
  assetsByPeriodInRange,
  fromPeriod,
  toPeriod,
  dataset,
}) {
  const collateralIndex = getCollateralIndex(dataset)

  /*
    FAST PATH — FromPeriod === ToPeriod.

    Với từ/to cùng 1 kỳ, tài sản đầu = cuối (cùng projection cached),
    mọi delta = 0, status quy về 'Không thay đổi' (cây điều kiện với
    cùng snapshot/asset 2 lần luôn kết thúc ở đó), rủi ro trong khoảng
    = [] (vòng lặp 1 kỳ không chạy). KHÔNG cần vòng so sánh liên kỳ.
  */
  if (fromPeriod === toPeriod && assetsByPeriodInRange.length <= 1) {
    const fromById = indexById(fromAssets)
    const toById = indexById(toAssets)
    return unionIds(fromAssets, toAssets).map((maTsDg) =>
      buildComparisonItem(maTsDg, fromById.get(maTsDg), toById.get(maTsDg), collateralIndex, fromPeriod, toPeriod)
    )
  }

  const fromById = indexById(fromAssets)
  const toById = indexById(toAssets)

  /*
    Index từng kỳ một lần (mỗi kỳ: byId + riskSets), thay cho .find()
    trong vòng lặp liên kỳ từng tài sản.
  */
  const periodIndexes = assetsByPeriodInRange.map((periodEntry) => {
    const byId = indexById(periodEntry.assets)
    const riskSets = new Map(
      periodEntry.assets.map((asset) => [
        asset.maTsDg,
        new Set((asset.risks ?? []).map((risk) => risk.loaiRuiRo)),
      ])
    )
    return { period: periodEntry.period, byId, riskSets }
  })

  return unionIds(fromAssets, toAssets).map((maTsDg) => {
    const item = buildComparisonItem(
      maTsDg,
      fromById.get(maTsDg),
      toById.get(maTsDg),
      collateralIndex,
      fromPeriod,
      toPeriod
    )

    const riskTypesOccurredInRange = new Set()
    for (let index = 1; index < periodIndexes.length; index += 1) {
      const previousRiskTypes = periodIndexes[index - 1].riskSets.get(maTsDg) ?? EMPTY_SET
      const currentRiskTypes = periodIndexes[index].riskSets.get(maTsDg) ?? EMPTY_SET
      for (const riskType of currentRiskTypes) {
        if (!previousRiskTypes.has(riskType)) {
          riskTypesOccurredInRange.add(riskType)
        }
      }
    }
    item.riskTypesOccurredInRange = [...riskTypesOccurredInRange]
    return item
  })
}

export function matchesRiskFilter(asset, valuationRisk) {
  if (valuationRisk === 'Tất cả') return true
  if (valuationRisk === 'Không phát hiện') return (asset.risks ?? []).length === 0
  return (asset.risks ?? []).some((risk) => risk.loaiRuiRo === valuationRisk)
}

export function filterComparisonAssets(items, { changeType, valuationRisk }) {
  return items.filter((item) => {
    if (changeType === 'Phát sinh rủi ro mới') {
      if (valuationRisk === 'Tất cả') return item.newRiskTypesAtEnd.length > 0
      if (valuationRisk === 'Không phát hiện') return false
      return item.newRiskTypesAtEnd.includes(valuationRisk)
    }

    if (changeType === 'Phát sinh rủi ro trong khoảng') {
      if (valuationRisk === 'Tất cả') return item.riskTypesOccurredInRange.length > 0
      if (valuationRisk === 'Không phát hiện') return false
      return item.riskTypesOccurredInRange.includes(valuationRisk)
    }

    if (valuationRisk !== 'Tất cả') {
      if (!item.toAsset) return false
      if (!matchesRiskFilter(item.toAsset, valuationRisk)) return false
    }

    if (changeType === 'Tất cả') return true

    if (changeType === 'Phát sinh mới') return item.changeStatus === 'Phát sinh mới'
    if (changeType === 'Tăng GT định giá') return item.valuationChange > 0
    if (changeType === 'Giảm GT định giá') return item.valuationChange < 0
    if (changeType === 'Dư nợ tăng') return item.debtChange > 0
    if (changeType === 'Dư nợ giảm') return item.debtChange < 0
    if (changeType === 'Giải chấp') {
      return item.fromAsset?.isActiveCollateral && item.toAsset?.trangThaiTsbd === 'Đã giải chấp'
    }
    if (changeType === 'Không còn xuất hiện trong nguồn') {
      return item.changeStatus === 'Không còn xuất hiện trong nguồn'
    }

    return true
  })
}

export function sliceForTable(rows, limit = TABLE_RENDER_LIMIT) {
  return rows.slice(0, limit)
}