// src/ai/aiQueryEngine.js

import {
  getAssetsByReportingPeriod,
  getCollateralSnapshotByPeriodAndAsset,
} from '../services/assetService.js'

import {
  AI_QUERY_INTENTS,
  AI_CHANGE_TYPES,
} from './aiQueryContract.js'

import {
  validateAIQuery,
} from './aiQueryValidator.js'


function applyFilters(assets, filters = {}) {
  return assets.filter((asset) => {
    if (
      filters.province &&
      asset.tinhTp !== filters.province
    ) {
      return false
    }

    if (
      filters.assetGroup &&
      asset.nhomTsCap1 !== filters.assetGroup
    ) {
      return false
    }

    if (
      filters.valuationUnit &&
      asset.donViDinhGia !== filters.valuationUnit
    ) {
      return false
    }

    if (
      filters.valuationRisk &&
      asset.loaiRuiRo !== filters.valuationRisk
    ) {
      return false
    }

    if (
      filters.objectType === 'ACTIVE_COLLATERAL' &&
      !asset.isActiveCollateral
    ) {
      return false
    }

    return true
  })
}


export function executeAIQuery(
  query,
  dataset = undefined
) {
  const validation = validateAIQuery(query)

  if (!validation.valid) {
    return {
      success: false,
      intent: query?.intent || null,
      errors: validation.errors,
      data: [],
    }
  }

  if (query.intent === AI_QUERY_INTENTS.LOOKUP) {
  if (!query.period) {
    return {
      success: false,
      intent: query.intent,
      errors: [
        'LOOKUP phải có period.',
      ],
      data: [],
    }
  }

  const assets = getAssetsByReportingPeriod(
    query.period,
    dataset
  )

  const matchedAssets = assets.filter((asset) => {
    if (
      query.lookup?.maTsDg &&
      asset.maTsDg === query.lookup.maTsDg
    ) {
      return true
    }

    if (
      query.lookup?.maTsbd &&
      asset.maTsbd === query.lookup.maTsbd
    ) {
      return true
    }

    if (
      query.lookup?.cif &&
      asset.customers?.some(
        (customer) =>
          customer.cif === query.lookup.cif
      )
    ) {
      return true
    }

    return false
  })

  return {
    success: true,
    intent: query.intent,
    period: query.period,
    data: matchedAssets,
    result: {
      recordCount: matchedAssets.length,
    },
    errors: [],
  }
}

if (query.intent === AI_QUERY_INTENTS.AGGREGATE) {
  if (!query.period) {
    return {
      success: false,
      intent: query.intent,
      errors: [
        'AGGREGATE phải có period.',
      ],
      data: [],
    }
  }

  const assets = getAssetsByReportingPeriod(
    query.period,
    dataset
  )

  const filteredAssets = applyFilters(
    assets,
    query.filters
  )

  const collateralSnapshots = filteredAssets
  .map((asset) =>
    getCollateralSnapshotByPeriodAndAsset(
      asset.maTsDg,
      query.period,
      dataset
    )
  )
  .filter(Boolean)

  if (query.metric === 'TOTAL_COLLATERAL') {
  const activeCollateralSnapshots =
    collateralSnapshots.filter(
      (snapshot) =>
        snapshot.trangThaiTsbd === 'Đang bảo đảm'
    )

  return {
    success: true,
    intent: query.intent,
    period: query.period,
    data: activeCollateralSnapshots,
    result: {
      metric: query.metric,
      value: activeCollateralSnapshots.length,
      recordCount: activeCollateralSnapshots.length,
    },
    errors: [],
  }
}



if (query.metric === 'TOTAL_DEBT') {
  const activeCollateralSnapshots =
    collateralSnapshots.filter(
      (snapshot) =>
        snapshot.trangThaiTsbd === 'Đang bảo đảm'
    )

  const totalDebt = activeCollateralSnapshots.reduce(
    (sum, snapshot) =>
      sum + (Number(snapshot.duNoTsbd) || 0),
    0
  )

  return {
    success: true,
    intent: query.intent,
    period: query.period,
    data: activeCollateralSnapshots,
    result: {
      metric: query.metric,
      value: totalDebt,
      recordCount: activeCollateralSnapshots.length,
    },
    errors: [],
  }
}

  if (query.metric === 'TOTAL_ASSETS') {
  return {
    success: true,
    intent: query.intent,
    period: query.period,
    data: filteredAssets,
    result: {
      metric: query.metric,
      value: filteredAssets.length,
      recordCount: filteredAssets.length,
    },
    errors: [],
  }
}

  if (query.metric === 'TOTAL_VALUATION') {
    const totalValue = filteredAssets.reduce(
      (sum, asset) =>
        sum + (Number(asset.gtDinhGia) || 0),
      0
    )

    return {
      success: true,
      intent: query.intent,
      period: query.period,
      data: filteredAssets,
      result: {
        metric: query.metric,
        value: totalValue,
        recordCount: filteredAssets.length,
      },
      errors: [],
    }
  }

  return {
    success: false,
    intent: query.intent,
    errors: [
      `Metric ${query.metric} chưa được hỗ trợ trong Query Engine V1.`,
    ],
    data: [],
  }
}
if (query.intent === AI_QUERY_INTENTS.COMPARE) {
  const fromAssets = getAssetsByReportingPeriod(
    query.fromPeriod,
    dataset
  )

  const toAssets = getAssetsByReportingPeriod(
    query.toPeriod,
    dataset
  )

  const assetMap = new Map()

  fromAssets.forEach((asset) => {
    assetMap.set(asset.maTsDg, {
      maTsDg: asset.maTsDg,
      fromAsset: asset,
      toAsset: null,
    })
  })

  toAssets.forEach((asset) => {
    const existing = assetMap.get(asset.maTsDg)

    if (existing) {
      existing.toAsset = asset
    } else {
      assetMap.set(asset.maTsDg, {
        maTsDg: asset.maTsDg,
        fromAsset: null,
        toAsset: asset,
      })
    }
  })

  const comparisonItems = Array.from(
    assetMap.values()
  ).map((item) => {
    const fromCollateralSnapshot =
      getCollateralSnapshotByPeriodAndAsset(
        item.maTsDg,
        query.fromPeriod,
        dataset
      )

    const toCollateralSnapshot =
      getCollateralSnapshotByPeriodAndAsset(
        item.maTsDg,
        query.toPeriod,
        dataset
      )

    return {
      ...item,
      fromCollateralSnapshot,
      toCollateralSnapshot,
    }
  })

  if (
    query.filters?.changeType ===
    AI_CHANGE_TYPES.RELEASED
  ) {
    const releasedItems = comparisonItems.filter(
      (item) =>
        item.fromCollateralSnapshot
          ?.trangThaiTsbd === 'Đang bảo đảm' &&
        item.toCollateralSnapshot
          ?.trangThaiTsbd === 'Đã giải chấp' &&
        Boolean(
          item.toCollateralSnapshot
            ?.ngayGiaiChap
        )
    )

    return {
      success: true,
      intent: query.intent,
      fromPeriod: query.fromPeriod,
      toPeriod: query.toPeriod,
      data: releasedItems,
      result: {
        changeType:
          AI_CHANGE_TYPES.RELEASED,
        recordCount: releasedItems.length,
      },
      errors: [],
    }
  }

if (
  query.filters?.changeType ===
  AI_CHANGE_TYPES.MISSING_SOURCE
) {
  const missingSourceItems =
    comparisonItems.filter(
      (item) =>
        Boolean(item.fromCollateralSnapshot) &&
        !item.toCollateralSnapshot
    )

  return {
    success: true,
    intent: query.intent,
    fromPeriod: query.fromPeriod,
    toPeriod: query.toPeriod,
    data: missingSourceItems,
    result: {
      changeType:
        AI_CHANGE_TYPES.MISSING_SOURCE,
      recordCount: missingSourceItems.length,
    },
    errors: [],
  }
}

if (
  query.filters?.changeType ===
  AI_CHANGE_TYPES.VALUATION_INCREASE
) {
  const increasedItems =
    comparisonItems.filter((item) => {
      const fromValue =
        item.fromAsset?.gtDinhGia

      const toValue =
        item.toAsset?.gtDinhGia

      return (
        fromValue != null &&
        toValue != null &&
        toValue > fromValue
      )
    })

  return {
    success: true,
    intent: query.intent,
    fromPeriod: query.fromPeriod,
    toPeriod: query.toPeriod,
    data: increasedItems,
    result: {
      changeType:
        AI_CHANGE_TYPES.VALUATION_INCREASE,
      recordCount: increasedItems.length,
    },
    errors: [],
  }
}

if (
  query.filters?.changeType ===
  AI_CHANGE_TYPES.VALUATION_DECREASE
) {
  const decreasedItems =
    comparisonItems.filter((item) => {
      const fromValue =
        item.fromAsset?.gtDinhGia

      const toValue =
        item.toAsset?.gtDinhGia

      return (
        fromValue != null &&
        toValue != null &&
        toValue < fromValue
      )
    })

  return {
    success: true,
    intent: query.intent,
    fromPeriod: query.fromPeriod,
    toPeriod: query.toPeriod,
    data: decreasedItems,
    result: {
      changeType:
        AI_CHANGE_TYPES.VALUATION_DECREASE,
      recordCount: decreasedItems.length,
    },
    errors: [],
  }
}

if (
  query.filters?.changeType ===
  AI_CHANGE_TYPES.NEW
) {
  const newItems =
    comparisonItems.filter(
      (item) =>
        !item.fromAsset &&
        Boolean(item.toAsset)
    )

  return {
    success: true,
    intent: query.intent,
    fromPeriod: query.fromPeriod,
    toPeriod: query.toPeriod,
    data: newItems,
    result: {
      changeType: AI_CHANGE_TYPES.NEW,
      recordCount: newItems.length,
    },
    errors: [],
  }
}
  return {
    success: false,
    intent: query.intent,
    errors: [
      `Change type ${query.filters?.changeType} chưa được hỗ trợ trong COMPARE V1.`,
    ],
    data: [],
  }
}

if (query.intent !== AI_QUERY_INTENTS.FILTER) {
  return {
    success: false,
    intent: query.intent,
    errors: [
      `Intent ${query.intent} chưa được hỗ trợ trong Query Engine V1.`,
    ],
    data: [],
  }
}

  if (!query.period) {
    return {
      success: false,
      intent: query.intent,
      errors: [
        'FILTER theo một kỳ phải có period.',
      ],
      data: [],
    }
  }

  const assets = getAssetsByReportingPeriod(
    query.period,
    dataset
  )

  const filteredAssets = applyFilters(
    assets,
    query.filters
  )

  return {
    success: true,
    intent: query.intent,
    period: query.period,
    data: filteredAssets,
    result: {
      recordCount: filteredAssets.length,
    },
    errors: [],
  }
}