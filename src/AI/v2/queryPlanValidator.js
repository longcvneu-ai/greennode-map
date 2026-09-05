// src/ai/v2/queryPlanValidator.js

import {
  QUERY_PLAN_ACTIONS,
  QUERY_PLAN_OPERATORS,
  QUERY_PLAN_SORT_ORDERS,
  QUERY_PLAN_METRICS,
  QUERY_PLAN_GROUP_FIELDS,
} from './queryPlanContract'


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
          `Step ${index + 1}: operator không hợp lệ: ${step.operator}`
        )
      }

      if (step.value === undefined) {
        errors.push(
          `Step ${index + 1}: FILTER phải có value.`
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

  return {
    valid: errors.length === 0,
    errors,
  }
}