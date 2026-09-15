// src/AI/v2/riskContextEngine.js
// V2.6.7 Risk Intelligence - deterministic evidence builder.
//
// Analytical questions ("phân tích", "đề xuất", ...) must NOT leave the numeric
// facts to the LLM. This engine lowers an analytical question into a structured,
// fully-computed RiskContext (the single source of truth) that the LLM may later
// interpret as an enrichment layer.

import {
  getAssetsByReportingPeriod,
  getCurrentAssets,
  getReportingPeriods,
} from '../../services/assetService.js'

import {
  normalize,
  extractPeriods,
  extractProvince,
  detectRiskType,
  detectAssetType,
  detectAssetGroupFilter,
} from './riskIntentPlanner.js'
import { getPersistentRiskSummary } from '../../services/persistentRiskService.js'

export const RISK_CONTEXT_VERSION = '2.7'

function round1(value) {
  return Math.round(value * 10) / 10
}

function round2(value) {
  return Math.round(value * 100) / 100
}

/*
  Period resolution (V2.6.7 fix).

  The period is derived ONLY from the current question + active dataset, never
  from any caller-supplied default (App passes {@code defaultPeriod = its global
  reportingPeriod} state, which is stale state from the previous question and
  caused "hiện tại" questions to inherit 8/2026). Each independent question
  therefore starts from a clean slate.

  Resolution statuses:
    EXPLICIT_PERIOD        - user named a period that exists in the dataset.
    NO_DATASET_PERIOD      - user named a period absent from the dataset.
    LATEST_AVAILABLE_PERIOD- no period in the question; dataset has periods,
                             so the latest available period is analyzed.
    CURRENT_DATASET        - no period in the question AND the active dataset
                             has no period dimension: analyze it as-is.
*/
function resolvePeriodResolution(requestedPeriods, dataset) {
  const normalizedRequested = (requestedPeriods || [])
    .filter(Boolean)
    .sort()

  if (normalizedRequested.length > 0) {
    const period = normalizedRequested[normalizedRequested.length - 1]
    const periods = getReportingPeriods(dataset).slice().sort()
    const index = periods.indexOf(period)
    if (index === -1) {
      return { resolution: 'NO_DATASET_PERIOD', period, priorPeriod: null }
    }
    return {
      resolution: 'EXPLICIT_PERIOD',
      period,
      priorPeriod: index > 0 ? periods[index - 1] : null,
    }
  }

  const periods = getReportingPeriods(dataset).slice().sort()

  if (periods.length === 0) {
    return { resolution: 'CURRENT_DATASET', period: null, priorPeriod: null }
  }

  return {
    resolution: 'LATEST_AVAILABLE_PERIOD',
    period: periods[periods.length - 1],
    priorPeriod: periods.length > 1 ? periods[periods.length - 2] : null,
  }
}


function isUnsupportedConclusionRequest(q) {
  const phrases = [
    'no xau',
    'mat von',
    'vo no',
    'kha nang tra no',
    'mat kha nang thanh toan',
    'gian lan',
    'gia mao',
    'khoi kien',
    'to tung',
    'hinh su',
    'xep hang tin nhiem',
    'thiet hai tin dung',
  ]
  return phrases.some((phrase) => q.includes(phrase))
}

function hasDatasetRows(dataset) {
  return Boolean(
    (dataset.valuationAssets && dataset.valuationAssets.length) ||
      (dataset.valuationSnapshots && dataset.valuationSnapshots.length) ||
      (dataset.valuationRisks && dataset.valuationRisks.length)
  )
}

function matchesScope(asset, scope) {
  if (scope.province && asset.tinhTp !== scope.province) return false
  if (scope.assetGroup && asset.nhomTsCap1 !== scope.assetGroup) return false
  if (scope.assetType && asset.loaiTsCap2 !== scope.assetType) return false
  return true
}

function riskRecordsOf(asset, riskType) {
  if (!Array.isArray(asset.risks)) return []
  if (!riskType) return asset.risks
  return asset.risks.filter((risk) => risk.loaiRuiRo === riskType)
}


function buildRanking(rows = [], valueField = 'cases') {
  const normalized = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (normalized.length === 0) {
    return { leaders: [], value: null, isTie: false, leaderCount: 0 }
  }
  const maxValue = Number(normalized[0]?.[valueField])
  const leaders = normalized.filter((row) => Number(row?.[valueField]) === maxValue)
  return {
    leaders: leaders.map((row) => row.key),
    value: Number.isFinite(maxValue) ? maxValue : null,
    isTie: leaders.length > 1,
    leaderCount: leaders.length,
  }
}

function buildGroupDistribution(riskAssets, riskType) {
  const casesByType = new Map()

  for (const asset of riskAssets) {
    for (const risk of riskRecordsOf(asset, riskType)) {
      const key = risk.loaiRuiRo
      if (!casesByType.has(key)) casesByType.set(key, 0)
      casesByType.set(key, casesByType.get(key) + 1)
    }
  }

  const totalCases = [...casesByType.values()].reduce((sum, value) => sum + value, 0)

  return {
    rows: [...casesByType.entries()]
      .map(([key, cases]) => ({
        key,
        cases,
        assets: riskAssets.filter((asset) =>
          riskRecordsOf(asset, riskType).some((risk) => risk.loaiRuiRo === key)
        ).length,
        sharePct: totalCases > 0 ? round1((cases / totalCases) * 100) : 0,
      }))
      .sort((a, b) => b.cases - a.cases || a.key.localeCompare(b.key)),
    totalCases,
  }
}

export function buildRiskContext(question, dataset = {}, planningContext = {}) {
  if (typeof question !== 'string') return null

  const q = normalize(question)
  if (!q) return null

  const requestedPeriods = extractPeriods(question)
  const { resolution, period, priorPeriod } = resolvePeriodResolution(requestedPeriods, dataset)

  const unsupportedConclusion = isUnsupportedConclusionRequest(q)

  const scope = {
    period,
    priorPeriod,
    requestedPeriods,
    periodResolution: resolution,
    province: planningContext?.detectedProvince || extractProvince(q),
    riskType:
      detectRiskType(q) ||
      planningContext?.detectedRiskType ||
      planningContext?.defaultRiskType ||
      null,
    assetType: detectAssetType(q),
    assetGroup: detectAssetGroupFilter(q),
  }

  if (unsupportedConclusion) {
    return {
      engine: 'RISK_CONTEXT',
      status: 'INSUFFICIENT_EVIDENCE',
      periodResolution: resolution,
      riskContext: {
        version: RISK_CONTEXT_VERSION,
        scope,
      },
    }
  }

  if (resolution === 'NO_DATASET_PERIOD') {
    return {
      engine: 'RISK_CONTEXT',
      status: 'NO_DATASET_PERIOD',
      periodResolution: resolution,
      riskContext: {
        version: RISK_CONTEXT_VERSION,
        scope,
        snapshot: { totalAssets: 0, riskAssets: 0, riskCases: 0 },
      },
    }
  }

  if (resolution === 'CURRENT_DATASET' && !hasDatasetRows(dataset)) {
    return {
      engine: 'RISK_CONTEXT',
      status: 'NO_SCOPE',
      periodResolution: resolution,
      riskContext: {
        version: RISK_CONTEXT_VERSION,
        scope,
      },
    }
  }

  const assets =
    resolution === 'CURRENT_DATASET'
      ? getCurrentAssets(dataset)
      : getAssetsByReportingPeriod(period, dataset)

  if (assets.length === 0) {
    return {
      engine: 'RISK_CONTEXT',
      status: 'NO_DATASET_PERIOD',
      periodResolution: resolution,
      riskContext: {
        version: RISK_CONTEXT_VERSION,
        scope,
        snapshot: { totalAssets: 0, riskAssets: 0, riskCases: 0 },
      },
    }
  }

  const scoped = assets.filter((asset) => matchesScope(asset, scope))
  const totalAssets = scoped.length

  const riskAssets = scoped.filter((asset) =>
    riskRecordsOf(asset, scope.riskType).length > 0
  )

  const riskCases = riskAssets.reduce(
    (sum, asset) => sum + riskRecordsOf(asset, scope.riskType).length,
    0
  )

  if (riskAssets.length === 0) {
    return {
      engine: 'RISK_CONTEXT',
      status: 'ZERO_RISK',
      periodResolution: resolution,
      riskContext: {
        version: RISK_CONTEXT_VERSION,
        scope,
        snapshot: {
          totalAssets,
          riskAssets: 0,
          riskCases: 0,
          riskRatePct: 0,
        },
      },
    }
  }

  const byRiskType = buildGroupDistribution(riskAssets, scope.riskType)

  const casesByProvince = new Map()
  for (const asset of riskAssets) {
    const province = asset.tinhTp || 'Chưa rõ địa bàn'
    const cases = riskRecordsOf(asset, scope.riskType).length
    casesByProvince.set(province, (casesByProvince.get(province) || 0) + cases)
  }

  const byProvince = [...casesByProvince.entries()]
    .map(([key, cases]) => ({
      key,
      cases,
      sharePct: round1((cases / riskCases) * 100),
    }))
    .sort((a, b) => b.cases - a.cases || a.key.localeCompare(b.key))

  const provinceRanking = buildRanking(byProvince, 'cases')
  const riskTypeRanking = buildRanking(byRiskType.rows, 'cases')
  const topProvince = byProvince[0] || null
  const top3SharePct = round2(
    (byProvince.slice(0, 3).reduce((sum, row) => sum + row.cases, 0) / riskCases) * 100
  )

  const totalValuation = riskAssets.reduce((sum, item) => sum + (Number(item.gtDinhGia) || 0), 0)
  const avgValuation = totalValuation / riskAssets.length

  const activeRiskAssets = riskAssets.filter(
    (item) => item.isActiveCollateral === true && Number(item.duNoTsbd) > 0
  )
  const totalDebt = activeRiskAssets.reduce((sum, item) => sum + (Number(item.duNoTsbd) || 0), 0)

  const ltvValues = riskAssets
    .map((item) => Number(item.ltv))
    .filter((value) => Number.isFinite(value) && value !== null)
  const avgLtv = ltvValues.length > 0 ? round2(ltvValues.reduce((sum, value) => sum + value, 0) / ltvValues.length) : null

  // --- MoM delta (evidence-grounded, computed) ---
  let priorAssets = []
  if (priorPeriod) {
    priorAssets = getAssetsByReportingPeriod(priorPeriod, dataset)
  }

  const priorScoped = priorAssets.filter((asset) => matchesScope(asset, scope))
  const priorRiskAssets = priorScoped.filter((asset) =>
    riskRecordsOf(asset, scope.riskType).length > 0
  )
  const priorRiskCases = priorRiskAssets.reduce(
    (sum, asset) => sum + riskRecordsOf(asset, scope.riskType).length,
    0
  )

  const currentByMaTsDg = new Map(riskAssets.map((item) => [item.maTsDg, item]))
  const priorRiskByMaTsDg = new Map(priorRiskAssets.map((item) => [item.maTsDg, item]))

  const emergingRiskAssets = riskAssets.filter((item) => {
    const prior = priorRiskByMaTsDg.get(item.maTsDg)
    if (!prior) return true
    return riskRecordsOf(prior, scope.riskType).length === 0
  }).length

  const closedRiskAssets = priorRiskAssets.filter((item) => {
    const current = currentByMaTsDg.get(item.maTsDg)
    if (!current) return true
    return riskRecordsOf(current, scope.riskType).length === 0
  }).length

  const riskDeltaMoM = riskCases - priorRiskCases

  const priorTotalValuation = priorRiskAssets.reduce(
    (sum, item) => sum + (Number(item.gtDinhGia) || 0),
    0
  )
  const valuationDeltaPct =
    priorTotalValuation > 0 && priorPeriod
      ? round2(((totalValuation - priorTotalValuation) / priorTotalValuation) * 100)
      : null

  const riskCasesSample = [...riskAssets]
    .sort((a, b) => (Number(b.gtDinhGia) || 0) - (Number(a.gtDinhGia) || 0))
    .slice(0, 5)
    .map((item) => ({
      maTsDg: item.maTsDg,
      tenTaiSan: item.tenTaiSan || item.maTsDg,
      riskType: (riskRecordsOf(item, scope.riskType)[0] || {}).loaiRuiRo || null,
      status: (riskRecordsOf(item, scope.riskType)[0] || {}).trangThaiXuLy || null,
      valuation: Number(item.gtDinhGia) || null,
      ltv: item.ltv === null || item.ltv === undefined ? null : Number(item.ltv),
      province: item.tinhTp || null,
    }))

  const persistentRisk = period
    ? getPersistentRiskSummary({
        period,
        dataset,
        assetIds: scoped.map((item) => item.maTsDg),
        riskType: scope.riskType || null,
      })
    : { available: false, period: null, persistentAssets: 0, threePlusAssets: 0, maxConsecutive: 0, items: [] }

  const riskContext = {
    version: RISK_CONTEXT_VERSION,
    scope,
    snapshot: {
      totalAssets,
      riskAssets: riskAssets.length,
      riskCases,
      riskRatePct: round1((riskAssets.length / totalAssets) * 100),
    },
    byRiskType: byRiskType.rows,
    byProvince,
    ranking: {
      province: provinceRanking,
      riskType: riskTypeRanking,
    },
    concentration: {
      topProvince: topProvince ? topProvince.key : null,
      topProvinceCases: topProvince ? topProvince.cases : null,
      topProvinceSharePct: topProvince ? topProvince.sharePct : null,
      topProvinces: provinceRanking.leaders,
      topProvinceTie: provinceRanking.isTie,
      topProvinceLeaderCount: provinceRanking.leaderCount,
      top3SharePct,
    },
    valuation: {
      totalValuation,
      avgValuation: round2(avgValuation),
      totalDebt,
      activeCollateralAssets: activeRiskAssets.length,
      avgLtv,
      valuationDeltaPct,
    },
    persistentRisk,
    delta: {
      priorPeriod,
      priorRiskCases: priorPeriod ? priorRiskCases : 0,
      riskDeltaMoM: priorPeriod ? riskDeltaMoM : null,
      emergingRiskAssets: priorPeriod ? emergingRiskAssets : null,
      closedRiskAssets: priorPeriod ? closedRiskAssets : null,
    },
    riskCasesSample,
  }

  return {
    engine: 'RISK_CONTEXT',
    status: 'OK',
    periodResolution: resolution,
    riskContext,
  }
}

export function isRiskContextResult(result) {
  return Boolean(result && result.engine === 'RISK_CONTEXT')
}