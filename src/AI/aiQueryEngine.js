// src/ai/aiQueryEngine.js

import {
  getAssetsByReportingPeriod,
} from '../services/assetService'

import {
  AI_QUERY_INTENTS,
} from './aiQueryContract'

import {
  validateAIQuery,
} from './aiQueryValidator'


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