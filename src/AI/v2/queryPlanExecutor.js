// src/AI/v2/queryPlanExecutor.js

import {
  QUERY_PLAN_ACTIONS,
  QUERY_PLAN_OPERATORS,
} from './queryPlanContract.js'

import {
  validateQueryPlan,
} from './queryPlanValidator.js'

import {
  getAssetsByReportingPeriod,
} from '../../services/assetService.js'


function compareValue(actualValue, operator, expectedValue) {
  switch (operator) {
    case QUERY_PLAN_OPERATORS.EQ:
      return actualValue === expectedValue

    case QUERY_PLAN_OPERATORS.NEQ:
      return actualValue !== expectedValue

    case QUERY_PLAN_OPERATORS.GT:
      return actualValue > expectedValue

    case QUERY_PLAN_OPERATORS.GTE:
      return actualValue >= expectedValue

    case QUERY_PLAN_OPERATORS.LT:
      return actualValue < expectedValue

    case QUERY_PLAN_OPERATORS.LTE:
      return actualValue <= expectedValue

    case QUERY_PLAN_OPERATORS.IN:
      return (
        Array.isArray(expectedValue) &&
        expectedValue.includes(actualValue)
      )

    default:
      return false
  }
}


function getFieldValue(item, field) {
  switch (field) {
    case 'province':
      return item.tinhTp

    case 'assetGroup':
      return item.nhomTsCap1

    case 'valuationUnit':
      return item.donViDinhGia

    case 'valuationRisk':
      return item.ruiRoDinhGia

    default:
      return item[field]
  }
}

function groupData(data, field) {
  const groups = new Map()

  data.forEach((item) => {
    const key = getFieldValue(item, field)

    if (!groups.has(key)) {
      groups.set(key, [])
    }

    groups.get(key).push(item)
  })

  return Array.from(groups.entries()).map(
    ([key, items]) => ({
      key,
      items,
      recordCount: items.length,
    })
  )
}

function aggregateData(data, metric) {
  const isGrouped =
    Array.isArray(data) &&
    data.length > 0 &&
    Array.isArray(data[0]?.items)

  if (metric === 'COUNT') {
    if (isGrouped) {
      return data.map((group) => ({
        key: group.key,
        value: group.items.length,
        recordCount: group.items.length,
      }))
    }

    return {
      value: data.length,
      recordCount: data.length,
    }
  }

  if (metric === 'TOTAL_VALUATION') {
    if (isGrouped) {
      return data.map((group) => ({
        key: group.key,

        value: group.items.reduce(
          (sum, item) =>
            sum + (Number(item.gtDinhGia) || 0),
          0
        ),

        recordCount: group.items.length,
      }))
    }

    return {
      value: data.reduce(
        (sum, item) =>
          sum + (Number(item.gtDinhGia) || 0),
        0
      ),

      recordCount: data.length,
    }
  }

  if (metric === 'TOTAL_DEBT') {
    if (isGrouped) {
      return data.map((group) => {
        const activeCollateralItems =
          group.items.filter(
            (item) =>
              item.isActiveCollateral === true
          )

        return {
          key: group.key,

          value:
            activeCollateralItems.reduce(
              (sum, item) =>
                sum +
                (Number(item.duNoTsbd) || 0),
              0
            ),

          recordCount:
            activeCollateralItems.length,
        }
      })
    }

    const activeCollateralItems =
      data.filter(
        (item) =>
          item.isActiveCollateral === true
      )

    return {
      value:
        activeCollateralItems.reduce(
          (sum, item) =>
            sum +
            (Number(item.duNoTsbd) || 0),
          0
        ),

      recordCount:
        activeCollateralItems.length,
    }
  }

  return data
}

export function executeQueryPlan(plan) {
  const validation = validateQueryPlan(plan)

  if (!validation.valid) {
    return {
      success: false,
      data: [],
      errors: validation.errors,
    }
  }

  const period = plan.timeContext?.period

  if (!period) {
    return {
      success: false,
      data: [],
      errors: ['Query Plan chưa có period.'],
    }
  }

  let data = getAssetsByReportingPeriod(period)

  let recordCount = data.length
let groupCount = null

for (const step of plan.steps) {
  if (
    step.action === QUERY_PLAN_ACTIONS.FILTER
  ) {
    data = data.filter((item) => {
      const actualValue = getFieldValue(
        item,
        step.field
      )

      return compareValue(
        actualValue,
        step.operator,
        step.value
      )
    })

    recordCount = data.length
  }

  if (
    step.action === QUERY_PLAN_ACTIONS.GROUP_BY
  ) {
    recordCount = data.length

    data = groupData(
      data,
      step.field
    )

    groupCount = data.length
  }

  if (
    step.action === QUERY_PLAN_ACTIONS.AGGREGATE
  ) {
    data = aggregateData(
      data,
      step.metric
    )

    if (Array.isArray(data)) {
      recordCount = data.reduce(
        (sum, item) =>
          sum + (item.recordCount || 0),
        0
      )
    } else {
      recordCount =
        data.recordCount ?? recordCount
    }
  }

  if (
    step.action === QUERY_PLAN_ACTIONS.SORT
  ) {
    if (Array.isArray(data)) {
      const direction =
        step.order === 'DESC'
          ? -1
          : 1

      data = [...data].sort(
        (a, b) => {
          const aValue =
            Number(a.value) || 0

          const bValue =
            Number(b.value) || 0

          return (
            (aValue - bValue) *
            direction
          )
        }
      )
    }
  }

  if (
    step.action === QUERY_PLAN_ACTIONS.LIMIT
  ) {
    if (Array.isArray(data)) {
      data = data.slice(
        0,
        step.value
      )
    }
  }
}

  return {
  success: true,
  period,
  data,
  recordCount,
  groupCount,
  errors: [],
}
}