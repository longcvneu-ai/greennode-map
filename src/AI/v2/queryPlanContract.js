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
  EMPTY: 'EMPTY',
  NOT_EMPTY: 'NOT_EMPTY',
}
export const QUERY_PLAN_SORT_ORDERS = {
  ASC: 'ASC',
  DESC: 'DESC',
}

export const QUERY_PLAN_METRICS = {
  COUNT: 'COUNT',
  RISK_CASE_COUNT: 'RISK_CASE_COUNT',
  TOTAL_VALUATION: 'TOTAL_VALUATION',
  TOTAL_COLLATERAL: 'TOTAL_COLLATERAL',
  TOTAL_DEBT: 'TOTAL_DEBT',
  AVG_VALUATION: 'AVG_VALUATION',
  MAX_VALUATION: 'MAX_VALUATION',
  MIN_VALUATION: 'MIN_VALUATION',
  AVG_DEBT: 'AVG_DEBT',
  MAX_DEBT: 'MAX_DEBT',
  MIN_DEBT: 'MIN_DEBT',
  AVG_COLLATERAL_VALUE: 'AVG_COLLATERAL_VALUE',
  TOTAL_COLLATERAL_VALUE: 'TOTAL_COLLATERAL_VALUE',
  MAX_COLLATERAL_VALUE: 'MAX_COLLATERAL_VALUE',
  MIN_COLLATERAL_VALUE: 'MIN_COLLATERAL_VALUE',
  AVG_LTV: 'AVG_LTV',
  MAX_LTV: 'MAX_LTV',
  MIN_LTV: 'MIN_LTV',
}

export const QUERY_PLAN_GROUP_FIELDS = {
  ASSET_GROUP: 'assetGroup',
  ASSET_TYPE: 'assetType',
  PROVINCE: 'province',
  VALUATION_UNIT: 'valuationUnit',
  VALUATION_RISK: 'valuationRisk',
  REPORTING_PERIOD: 'queryPeriod',
}

export const QUERY_PLAN_LOOKUP_FIELDS = {
  VALUATION_CODE: 'maTsDg',
  COLLATERAL_CODE: 'maTsbd',
  CUSTOMER_CIF: 'cif',
}

export const QUERY_PLAN_COMPARE_FIELDS = {
  VALUATION: 'gtDinhGia',
  COLLATERAL_VALUE: 'gtBaoDam',
  DEBT: 'duNoTsbd',
  LTV: 'ltv',
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