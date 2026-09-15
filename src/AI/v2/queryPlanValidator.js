// src/ai/v2/queryPlanValidator.js

import {
  QUERY_PLAN_ACTIONS,
  QUERY_PLAN_OPERATORS,
  QUERY_PLAN_SORT_ORDERS,
  QUERY_PLAN_METRICS,
  QUERY_PLAN_GROUP_FIELDS,
  QUERY_PLAN_LOOKUP_FIELDS,
  QUERY_PLAN_COMPARE_FIELDS,
} from './queryPlanContract.js'


function isAllowedValue(value, allowedObject) {
  return Object.values(allowedObject).includes(value)
}


export function validateQueryPlan(plan) {
  const errors = []

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return {
      valid: false,
      errors: ['Query Plan không phải object hợp lệ.'],
    }
  }

  if (plan.version !== '2.0') {
    errors.push(
      `Version không hợp lệ: ${plan.version}`
    )
  }

  if (!Array.isArray(plan.steps)) {
    errors.push('steps phải là một array.')

    return {
      valid: false,
      errors,
    }
  }

if (plan.steps.length === 0) {
  errors.push(
    'Query Plan phải có ít nhất 1 step.'
  )

  return {
    valid: false,
    errors,
  }
}

  plan.steps.forEach((step, index) => {
    if (!step || typeof step !== 'object') {
      errors.push(
        `Step ${index + 1} không hợp lệ.`
      )
      return
    }

    if (
      !isAllowedValue(
        step.action,
        QUERY_PLAN_ACTIONS
      )
    ) {
      errors.push(
        `Step ${index + 1}: action không hợp lệ: ${step.action}`
      )
      return
    }

    if (
  step.action === QUERY_PLAN_ACTIONS.FILTER
) {
  if (!step.field) {
    errors.push(
      `Step ${index + 1}: FILTER phải có field.`
    )
  }

  if (
    !isAllowedValue(
      step.operator,
      QUERY_PLAN_OPERATORS
    )
  ) {
    errors.push(
      `Step ${index + 1}: FILTER operator không hợp lệ: ${step.operator}`
    )
  }

  const operatorDoesNotNeedValue =
    step.operator ===
      QUERY_PLAN_OPERATORS.EMPTY ||
    step.operator ===
      QUERY_PLAN_OPERATORS.NOT_EMPTY

  if (
    !operatorDoesNotNeedValue &&
    (
      step.value === undefined ||
      step.value === null ||
      step.value === ''
    )
  ) {
    errors.push(
      `Step ${index + 1}: FILTER phải có value.`
    )
  }
}
     

    if (
  step.action === QUERY_PLAN_ACTIONS.LOOKUP
) {
  if (
    !isAllowedValue(
      step.field,
      QUERY_PLAN_LOOKUP_FIELDS
    )
  ) {
    errors.push(
      `Step ${index + 1}: LOOKUP field không hợp lệ: ${step.field}`
    )
  }

  if (
    step.value === undefined ||
    step.value === null ||
    step.value === ''
  ) {
    errors.push(
      `Step ${index + 1}: LOOKUP phải có value.`
    )
  }
}

if (
  step.action === QUERY_PLAN_ACTIONS.COMPARE
) {
  if (
    !isAllowedValue(
      step.field,
      QUERY_PLAN_COMPARE_FIELDS
    )
  ) {
    errors.push(
      `Step ${index + 1}: COMPARE field không hợp lệ: ${step.field}`
    )
  }

  if (
    plan.timeContext?.mode !== 'RANGE'
  ) {
    errors.push(
      `Step ${index + 1}: COMPARE yêu cầu timeContext.mode = RANGE.`
    )
  }

  if (
    !plan.timeContext?.fromPeriod ||
    !plan.timeContext?.toPeriod
  ) {
    errors.push(
      `Step ${index + 1}: COMPARE phải có fromPeriod và toPeriod.`
    )
  }
}

    if (
      step.action === QUERY_PLAN_ACTIONS.GROUP_BY
    ) {
      if (
        !isAllowedValue(
          step.field,
          QUERY_PLAN_GROUP_FIELDS
        )
      ) {
        errors.push(
          `Step ${index + 1}: GROUP_BY field không hợp lệ: ${step.field}`
        )
      }
    }

    if (
      step.action === QUERY_PLAN_ACTIONS.AGGREGATE
    ) {
      if (
        !isAllowedValue(
          step.metric,
          QUERY_PLAN_METRICS
        )
      ) {
        errors.push(
          `Step ${index + 1}: metric không hợp lệ: ${step.metric}`
        )
      }
    }

    if (
      step.action === QUERY_PLAN_ACTIONS.SORT
    ) {
      if (!step.by) {
        errors.push(
          `Step ${index + 1}: SORT phải có by.`
        )
      }

      if (
        !isAllowedValue(
          step.order,
          QUERY_PLAN_SORT_ORDERS
        )
      ) {
        errors.push(
          `Step ${index + 1}: sort order không hợp lệ: ${step.order}`
        )
      }
    }

    if (
      step.action === QUERY_PLAN_ACTIONS.LIMIT
    ) {
      if (
        !Number.isInteger(step.value) ||
        step.value <= 0
      ) {
        errors.push(
          `Step ${index + 1}: LIMIT phải là số nguyên > 0.`
        )
      }
    }
  })

  // ===== V2 STEP SEQUENCE VALIDATION =====

  const actions = plan.steps.map(
    (step) => step.action
  )

  const compareIndex =
    actions.indexOf(
      QUERY_PLAN_ACTIONS.COMPARE
    )

  const groupByIndex =
    actions.indexOf(
      QUERY_PLAN_ACTIONS.GROUP_BY
    )

  const aggregateIndex =
    actions.indexOf(
      QUERY_PLAN_ACTIONS.AGGREGATE
    )

  const sortIndex =
    actions.indexOf(
      QUERY_PLAN_ACTIONS.SORT
    )

  const limitIndex =
    actions.indexOf(
      QUERY_PLAN_ACTIONS.LIMIT
    )

  // COMPARE phải là bước cuối.
  if (
    compareIndex !== -1 &&
    compareIndex !== actions.length - 1
  ) {
    errors.push(
      'COMPARE phải là bước cuối của Query Plan.'
    )
  }

  // Nếu vừa GROUP_BY vừa AGGREGATE,
  // GROUP_BY phải đứng trước AGGREGATE.
  if (
    groupByIndex !== -1 &&
    aggregateIndex !== -1 &&
    groupByIndex > aggregateIndex
  ) {
    errors.push(
      'GROUP_BY phải đứng trước AGGREGATE.'
    )
  }

  // SORT phải đứng sau AGGREGATE
  // trong pipeline xếp hạng hiện tại.
  if (
    sortIndex !== -1 &&
    (
      aggregateIndex === -1 ||
      sortIndex < aggregateIndex
    )
  ) {
    errors.push(
      'SORT phải đứng sau AGGREGATE.'
    )
  }

  // LIMIT phải đứng sau SORT
  // nếu Query Plan có SORT.
  if (
    limitIndex !== -1 &&
    sortIndex !== -1 &&
    limitIndex < sortIndex
  ) {
    errors.push(
      'LIMIT phải đứng sau SORT.'
    )
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}