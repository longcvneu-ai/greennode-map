// src/ai/aiQueryContract.js

export const AI_QUERY_INTENTS = {
  FILTER: 'FILTER',
  LOOKUP: 'LOOKUP',
  AGGREGATE: 'AGGREGATE',
  COMPARE: 'COMPARE',
}

export const AI_TIME_MODES = {
  SINGLE_PERIOD: 'SINGLE_PERIOD',
  RANGE: 'RANGE',
}

export const AI_METRICS = {
  TOTAL_ASSETS: 'TOTAL_ASSETS',
  TOTAL_VALUATION: 'TOTAL_VALUATION',
  TOTAL_COLLATERAL: 'TOTAL_COLLATERAL',
  TOTAL_DEBT: 'TOTAL_DEBT',
}

export const AI_CHANGE_TYPES = {
  NEW: 'NEW',
  RELEASED: 'RELEASED',
  MISSING_SOURCE: 'MISSING_SOURCE',
  VALUATION_INCREASE: 'VALUATION_INCREASE',
  VALUATION_DECREASE: 'VALUATION_DECREASE',
}

export function createEmptyAIQuery() {
  return {
    intent: AI_QUERY_INTENTS.FILTER,

    timeMode: AI_TIME_MODES.SINGLE_PERIOD,
    period: null,
    fromPeriod: null,
    toPeriod: null,

    filters: {
      objectType: null,
      assetGroup: null,
      province: null,
      valuationUnit: null,
      valuationRisk: null,
      changeType: null,
    },

    lookup: {
      maTsDg: null,
      maTsbd: null,
      cif: null,
    },

    metric: null,
  }
}