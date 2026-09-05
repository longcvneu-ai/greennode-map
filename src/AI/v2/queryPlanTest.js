import {
  QUERY_PLAN_ACTIONS,
  QUERY_PLAN_OPERATORS,
  QUERY_PLAN_SORT_ORDERS,
  QUERY_PLAN_METRICS,
  QUERY_PLAN_GROUP_FIELDS,
  createEmptyQueryPlan,
} from './queryPlanContract'

import {
  validateQueryPlan,
} from './queryPlanValidator.js'


// TEST V2-1: Plan hợp lệ
const validPlan = createEmptyQueryPlan()

validPlan.timeContext.period = '2026-08-31'

validPlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.FILTER,
    field: 'province',
    operator: QUERY_PLAN_OPERATORS.EQ,
    value: 'Hà Nội',
  },
  {
    action: QUERY_PLAN_ACTIONS.GROUP_BY,
    field: QUERY_PLAN_GROUP_FIELDS.ASSET_GROUP,
  },
  {
    action: QUERY_PLAN_ACTIONS.AGGREGATE,
    metric: QUERY_PLAN_METRICS.TOTAL_DEBT,
  },
  {
    action: QUERY_PLAN_ACTIONS.SORT,
    by: QUERY_PLAN_METRICS.TOTAL_DEBT,
    order: QUERY_PLAN_SORT_ORDERS.DESC,
  },
  {
    action: QUERY_PLAN_ACTIONS.LIMIT,
    value: 5,
  },
]

console.log(
  'QUERY PLAN V2 TEST 1 - VALID:',
  validateQueryPlan(validPlan)
)


// TEST V2-2: AI bịa action
const invalidActionPlan = createEmptyQueryPlan()

invalidActionPlan.steps = [
  {
    action: 'DELETE_DATABASE',
  },
]

console.log(
  'QUERY PLAN V2 TEST 2 - INVALID ACTION:',
  validateQueryPlan(invalidActionPlan)
)


// TEST V2-3: AI bịa operator
const invalidOperatorPlan = createEmptyQueryPlan()

invalidOperatorPlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.FILTER,
    field: 'province',
    operator: 'BANANA',
    value: 'Hà Nội',
  },
]

console.log(
  'QUERY PLAN V2 TEST 3 - INVALID OPERATOR:',
  validateQueryPlan(invalidOperatorPlan)
)

import {
  executeQueryPlan,
} from './queryPlanExecutor.js'


// TEST V2-4: Executor FILTER Hà Nội
const filterHaNoiPlan = createEmptyQueryPlan()

filterHaNoiPlan.timeContext.period = '2026-08-31'

filterHaNoiPlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.FILTER,
    field: 'province',
    operator: QUERY_PLAN_OPERATORS.EQ,
    value: 'Hà Nội',
  },
]

console.log(
  'QUERY PLAN V2 TEST 4 - FILTER HA NOI:',
  executeQueryPlan(filterHaNoiPlan)
)

// TEST V2-5: Executor GROUP_BY tỉnh/thành phố
const groupByProvincePlan = createEmptyQueryPlan()

groupByProvincePlan.timeContext.period =
  '2026-08-31'

groupByProvincePlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.GROUP_BY,
    field: QUERY_PLAN_GROUP_FIELDS.PROVINCE,
  },
]

console.log(
  'QUERY PLAN V2 TEST 5 - GROUP BY PROVINCE:',
  executeQueryPlan(groupByProvincePlan)
)

// TEST V2-6: GROUP_BY + AGGREGATE COUNT
const countByProvincePlan = createEmptyQueryPlan()

countByProvincePlan.timeContext.period =
  '2026-08-31'

countByProvincePlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.GROUP_BY,
    field: QUERY_PLAN_GROUP_FIELDS.PROVINCE,
  },
  {
    action: QUERY_PLAN_ACTIONS.AGGREGATE,
    metric: QUERY_PLAN_METRICS.COUNT,
  },
]

console.log(
  'QUERY PLAN V2 TEST 6 - COUNT BY PROVINCE:',
  executeQueryPlan(countByProvincePlan)
)

// TEST V2-7: GROUP_BY + TOTAL_VALUATION
const valuationByProvincePlan =
  createEmptyQueryPlan()

valuationByProvincePlan.timeContext.period =
  '2026-08-31'

valuationByProvincePlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.GROUP_BY,
    field: QUERY_PLAN_GROUP_FIELDS.PROVINCE,
  },
  {
    action: QUERY_PLAN_ACTIONS.AGGREGATE,
    metric:
      QUERY_PLAN_METRICS.TOTAL_VALUATION,
  },
]

console.log(
  'QUERY PLAN V2 TEST 7 - TOTAL VALUATION BY PROVINCE:',
  executeQueryPlan(valuationByProvincePlan)
)

// TEST V2-8: FILTER HA NOI + TOTAL_DEBT
const debtHaNoiPlan =
  createEmptyQueryPlan()

debtHaNoiPlan.timeContext.period =
  '2026-08-31'

debtHaNoiPlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.FILTER,
    field: 'province',
    operator: QUERY_PLAN_OPERATORS.EQ,
    value: 'Hà Nội',
  },
  {
    action: QUERY_PLAN_ACTIONS.AGGREGATE,
    metric:
      QUERY_PLAN_METRICS.TOTAL_DEBT,
  },
]

console.log(
  'QUERY PLAN V2 TEST 8 - TOTAL DEBT HA NOI:',
  executeQueryPlan(debtHaNoiPlan)
)


// TEST V2-9: GROUP_BY + TOTAL_DEBT
const debtByProvincePlan =
  createEmptyQueryPlan()

debtByProvincePlan.timeContext.period =
  '2026-08-31'

debtByProvincePlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.GROUP_BY,
    field: QUERY_PLAN_GROUP_FIELDS.PROVINCE,
  },
  {
    action: QUERY_PLAN_ACTIONS.AGGREGATE,
    metric: QUERY_PLAN_METRICS.TOTAL_DEBT,
  },
]

console.log(
  'QUERY PLAN V2 TEST 9 - TOTAL DEBT BY PROVINCE:',
  executeQueryPlan(debtByProvincePlan)
)

// TEST V2-10:
// GROUP_BY + TOTAL_DEBT + SORT DESC

const debtRankingPlan =
  createEmptyQueryPlan()

debtRankingPlan.timeContext.period =
  '2026-08-31'

debtRankingPlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.GROUP_BY,
    field:
      QUERY_PLAN_GROUP_FIELDS.PROVINCE,
  },
  {
    action:
      QUERY_PLAN_ACTIONS.AGGREGATE,
    metric:
      QUERY_PLAN_METRICS.TOTAL_DEBT,
  },
  {
    action: QUERY_PLAN_ACTIONS.SORT,
    by: QUERY_PLAN_METRICS.TOTAL_DEBT,
    order:
      QUERY_PLAN_SORT_ORDERS.DESC,
  },
]

console.log(
  'QUERY PLAN V2 TEST 10 - DEBT RANKING:',
  executeQueryPlan(debtRankingPlan)
)

// TEST V2-11:
// GROUP_BY + TOTAL_DEBT + SORT + LIMIT

const topDebtProvincePlan =
  createEmptyQueryPlan()

topDebtProvincePlan.timeContext.period =
  '2026-08-31'

topDebtProvincePlan.steps = [
  {
    action: QUERY_PLAN_ACTIONS.GROUP_BY,
    field:
      QUERY_PLAN_GROUP_FIELDS.PROVINCE,
  },
  {
    action:
      QUERY_PLAN_ACTIONS.AGGREGATE,
    metric:
      QUERY_PLAN_METRICS.TOTAL_DEBT,
  },
  {
    action:
      QUERY_PLAN_ACTIONS.SORT,
    by:
      QUERY_PLAN_METRICS.TOTAL_DEBT,
    order:
      QUERY_PLAN_SORT_ORDERS.DESC,
  },
  {
    action:
      QUERY_PLAN_ACTIONS.LIMIT,
    value: 1,
  },
]

console.log(
  'QUERY PLAN V2 TEST 11 - TOP DEBT PROVINCE:',
  executeQueryPlan(topDebtProvincePlan)
)