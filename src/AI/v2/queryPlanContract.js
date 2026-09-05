// src/ai/v2/queryPlanContract.js

export const QUERY_PLAN_ACTIONS = {
  FILTER: 'FILTER',
  LOOKUP: 'LOOKUP',
  COMPARE: 'COMPARE',
  GROUP_BY: 'GROUP_BY',
  AGGREGATE: 'AGGREGATE',
  SORT: 'SORT',
  LIMIT: 'LIMIT',
}

export const QUERY_PLAN_OPERATORS = {
  EQ: 'EQ',
  NEQ: 'NEQ',
  GT: 'GT',
  GTE: 'GTE',
  LT: 'LT',
  LTE: 'LTE',
  IN: 'IN',
}

export const QUERY_PLAN_SORT_ORDERS = {
  ASC: 'ASC',
  DESC: 'DESC',
}

export const QUERY_PLAN_METRICS = {
  COUNT: 'COUNT',
  TOTAL_VALUATION: 'TOTAL_VALUATION',
  TOTAL_COLLATERAL: 'TOTAL_COLLATERAL',
  TOTAL_DEBT: 'TOTAL_DEBT',
}

export const QUERY_PLAN_GROUP_FIELDS = {
  ASSET_GROUP: 'assetGroup',
  PROVINCE: 'province',
  VALUATION_UNIT: 'valuationUnit',
  VALUATION_RISK: 'valuationRisk',
}

export function createEmptyQueryPlan() {
  return {
    version: '2.0',

    timeContext: {
      mode: 'SINGLE_PERIOD',
      period: null,
      fromPeriod: null,
      toPeriod: null,
    },

    steps: [],
  }
}