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
  getReportingPeriods,
} from '../../services/assetService.js'


function compareValue(
  actualValue,
  operator,
  expectedValue
) {
  /*
   * Field nhiều giá trị.
   *
   * Ví dụ:
   * valuationRisk:
   * ['Định giá cao', 'Sai phương pháp']
   *
   * cif:
   * ['CIF001', 'CIF005']
   */
  if (Array.isArray(actualValue)) {
    switch (operator) {
      case QUERY_PLAN_OPERATORS.EQ:
        return actualValue.includes(
          expectedValue
        )

      case QUERY_PLAN_OPERATORS.NEQ:
        return !actualValue.includes(
          expectedValue
        )

      case QUERY_PLAN_OPERATORS.IN:
        return (
          Array.isArray(expectedValue) &&
          actualValue.some(
            (value) =>
              expectedValue.includes(
                value
              )
          )
        )

      case QUERY_PLAN_OPERATORS.EMPTY:
        return actualValue.length === 0

      case QUERY_PLAN_OPERATORS.NOT_EMPTY:
        return actualValue.length > 0

      default:
        return false
    }
  }

  /*
   * Field giá trị đơn.
   */
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
        expectedValue.includes(
          actualValue
        )
      )

    case QUERY_PLAN_OPERATORS.EMPTY:
      return (
        actualValue === undefined ||
        actualValue === null ||
        actualValue === ''
      )

    case QUERY_PLAN_OPERATORS.NOT_EMPTY:
      return (
        actualValue !== undefined &&
        actualValue !== null &&
        actualValue !== ''
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

    case 'assetType':
      return item.loaiTsCap2

    case 'valuationUnit':
      return item.donViDinhGia

    case 'valuationRisk':
  return Array.isArray(item.risks)
    ? item.risks
        .map(
          (risk) =>
            risk.loaiRuiRo
        )
        .filter(Boolean)
    : []

    case 'cif':
      return item.cifs

    case 'queryPeriod':
      return item.queryPeriod

    default:
      return item[field]
  }
}

function groupData(data, field) {
  const groups = new Map()

  data.forEach((item) => {
    const rawKey = getFieldValue(item, field)
    const keys = Array.isArray(rawKey) ? rawKey : [rawKey]

    keys.filter((key) => key !== undefined && key !== null && key !== '').forEach((key) => {
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(item)
    })
  })

  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    items,
    recordCount: items.length,
  }))
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

  if (metric === 'RISK_CASE_COUNT') {
    const countRiskCases = (items) =>
      items.reduce(
        (sum, item) =>
          sum + (Array.isArray(item.risks) ? item.risks.length : 0),
        0
      )

    if (isGrouped) {
      return data.map((group) => ({
        key: group.key,
        value: countRiskCases(group.items),
        recordCount: group.items.length,
      }))
    }

    return {
      value: countRiskCases(data),
      recordCount: data.length,
    }
  }

  const numericAggregate = (items, field, mode) => {
    const values = items
      .map((item) => getFieldValue(item, field))
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))

    if (values.length === 0) return { value: null, recordCount: 0 }

    let value
    if (mode === 'AVG') value = values.reduce((sum, item) => sum + item, 0) / values.length
    if (mode === 'SUM') value = values.reduce((sum, item) => sum + item, 0)
    if (mode === 'MAX') value = Math.max(...values)
    if (mode === 'MIN') value = Math.min(...values)

    return { value, recordCount: values.length }
  }

  const numericMetricConfig = {
    AVG_VALUATION: ['gtDinhGia', 'AVG'],
    MAX_VALUATION: ['gtDinhGia', 'MAX'],
    MIN_VALUATION: ['gtDinhGia', 'MIN'],
    AVG_DEBT: ['duNoTsbd', 'AVG'],
    MAX_DEBT: ['duNoTsbd', 'MAX'],
    MIN_DEBT: ['duNoTsbd', 'MIN'],
    AVG_COLLATERAL_VALUE: ['gtBaoDam', 'AVG'],
    TOTAL_COLLATERAL_VALUE: ['gtBaoDam', 'SUM'],
    MAX_COLLATERAL_VALUE: ['gtBaoDam', 'MAX'],
    MIN_COLLATERAL_VALUE: ['gtBaoDam', 'MIN'],
    AVG_LTV: ['ltv', 'AVG'],
    MAX_LTV: ['ltv', 'MAX'],
    MIN_LTV: ['ltv', 'MIN'],
  }

  if (numericMetricConfig[metric]) {
    const [field, mode] = numericMetricConfig[metric]
    if (isGrouped) {
      return data.map((group) => ({
        key: group.key,
        ...numericAggregate(group.items, field, mode),
      }))
    }
    return numericAggregate(data, field, mode)
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

  if (metric === 'TOTAL_COLLATERAL') {
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
          activeCollateralItems.length,
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
      activeCollateralItems.length,
    recordCount:
      activeCollateralItems.length,
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

function compareFieldBetweenPeriods(
  field,
  fromData,
  toData
) {
  const fromItem =
    Array.isArray(fromData)
      ? fromData[0] || null
      : fromData || null

  const toItem =
    Array.isArray(toData)
      ? toData[0] || null
      : toData || null

  if (!fromItem || !toItem) {
    return {
      field,

      fromValue: fromItem
        ? Number(
            getFieldValue(
              fromItem,
              field
            )
          ) || 0
        : null,

      toValue: toItem
        ? Number(
            getFieldValue(
              toItem,
              field
            )
          ) || 0
        : null,

      difference: null,
      direction: 'UNKNOWN',

      comparisonStatus:
        !fromItem && !toItem
          ? 'MISSING_BOTH_PERIODS'
          : !fromItem
            ? 'MISSING_FROM_PERIOD'
            : 'MISSING_TO_PERIOD',
    }
  }

  const fromValue =
    Number(
      getFieldValue(
        fromItem,
        field
      )
    ) || 0

  const toValue =
    Number(
      getFieldValue(
        toItem,
        field
      )
    ) || 0

  const difference =
    toValue - fromValue

  let direction = 'UNCHANGED'

  if (difference > 0) {
    direction = 'INCREASE'
  }

  if (difference < 0) {
    direction = 'DECREASE'
  }

  return {
    field,
    fromValue,
    toValue,
    difference,
    direction,
    comparisonStatus: 'COMPARABLE',
  }
}

export function executeQueryPlan(
  plan,
  dataset
) {
  const validation = validateQueryPlan(plan)

  if (!validation.valid) {
    return {
      success: false,
      data: [],
      metadata: null,
      errors: validation.errors,
    }
  }

  const timeContext = plan.timeContext || {}

const isRange =
  timeContext.mode === 'RANGE'

const isAllPeriods =
  timeContext.mode === 'ALL_PERIODS'

const period =
  timeContext.period

const fromPeriod =
  timeContext.fromPeriod

const toPeriod =
  timeContext.toPeriod

if (
  !isRange &&
  !isAllPeriods &&
  !period
) {
  return {
    success: false,
    data: [],
    metadata: null,
    errors: ['Query Plan chưa có period.'],
  }
}

if (
  isRange &&
  (!fromPeriod || !toPeriod)
) {
  return {
    success: false,
    data: [],
    metadata: null,
    errors: [
      'Query Plan RANGE phải có fromPeriod và toPeriod.',
    ],
  }
}

let data

if (isAllPeriods) {
  // Newest period first so LIMIT naturally means the latest matching cases.
  const periods = getReportingPeriods(dataset).slice().sort().reverse()

  data = periods.flatMap((queryPeriod) =>
    getAssetsByReportingPeriod(queryPeriod, dataset).map((item) => ({
      ...item,
      queryPeriod,
    }))
  )
} else {
  data = isRange
    ? getAssetsByReportingPeriod(
        toPeriod,
        dataset
      )
    : getAssetsByReportingPeriod(
        period,
        dataset
      )
}

  // Số bản ghi ban đầu của kỳ báo cáo,
  // trước khi thực hiện bất kỳ bước nào.
  const sourceRecordCount = data.length

  // Số bản ghi thực sự tham gia vào kết quả.
  // Giá trị này sẽ thay đổi sau FILTER / AGGREGATE.
  let matchedRecordCount = data.length

  // Số nhóm được tạo ra trước SORT / LIMIT.
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

      matchedRecordCount = data.length
    }

    if (
  step.action === QUERY_PLAN_ACTIONS.LOOKUP
) {
  data = data.filter((item) => {
    const actualValue = getFieldValue(
      item,
      step.field
    )

    return Array.isArray(actualValue)
  ? actualValue.includes(step.value)
  : actualValue === step.value
  })

  matchedRecordCount = data.length
}

if (
  step.action === QUERY_PLAN_ACTIONS.COMPARE
) {
     const fromData =
  getAssetsByReportingPeriod(
    fromPeriod,
    dataset
  )

  let matchedFromData = fromData

  const lookupStep =
    plan.steps.find(
      (item) =>
        item.action ===
        QUERY_PLAN_ACTIONS.LOOKUP
    )

  if (lookupStep) {
    matchedFromData =
      fromData.filter((item) => {
        const actualValue =
          getFieldValue(
            item,
            lookupStep.field
          )

        return Array.isArray(actualValue)
          ? actualValue.includes(
              lookupStep.value
            )
          : actualValue ===
              lookupStep.value
      })
  }

  const matchedToData = data

data = compareFieldBetweenPeriods(
  step.field,
  matchedFromData,
  matchedToData
)

matchedRecordCount =
  Math.max(
    matchedFromData.length,
    matchedToData.length
  )
}

    if (
      step.action === QUERY_PLAN_ACTIONS.GROUP_BY
    ) {
      matchedRecordCount = data.length

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
        matchedRecordCount = data.reduce(
          (sum, item) =>
            sum + (item.recordCount || 0),
          0
        )
      } else {
        matchedRecordCount =
          data.recordCount ??
          matchedRecordCount
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
        const limitValue = Math.max(0, Number(step.value) || 0)
        const isRanking =
          plan?.answerContext?.intent === 'RANK_DIMENSION' ||
          plan?.answerContext?.intent === 'RANK'

        // Ranking must not arbitrarily discard ties at the cutoff. If several
        // provinces/types/units share the same maximum, return all co-leaders.
        if (isRanking && limitValue > 0 && data.length > limitValue) {
          const cutoff = Number(data[limitValue - 1]?.value)
          data = data.filter((item, index) =>
            index < limitValue || Number(item?.value) === cutoff
          )
        } else {
          data = data.slice(0, limitValue)
        }
      }
    }
  }

  const resultCount =
    Array.isArray(data)
      ? data.length
      : data
        ? 1
        : 0

  return {
  success: true,

  timeContext: isRange
    ? {
        mode: 'RANGE',
        fromPeriod,
        toPeriod,
      }
    : isAllPeriods
      ? {
          mode: 'ALL_PERIODS',
          period: null,
        }
      : {
          mode: 'SINGLE_PERIOD',
          period,
        },

  data,

  metadata: {
    sourceRecordCount,
    matchedRecordCount,
    groupCount,
    resultCount,
  },

  errors: [],
}
}