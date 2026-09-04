// src/ai/aiQueryValidator.js

import {
  AI_QUERY_INTENTS,
  AI_TIME_MODES,
  AI_METRICS,
  AI_CHANGE_TYPES,
} from './aiQueryContract'

function isAllowedValue(value, allowedObject) {
  if (value == null) {
    return true
  }

  return Object.values(allowedObject).includes(value)
}

export function validateAIQuery(query) {
  const errors = []

  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return {
      valid: false,
      errors: ['AI Query không phải object hợp lệ.'],
    }
  }

  if (!isAllowedValue(query.intent, AI_QUERY_INTENTS)) {
    errors.push(`Intent không hợp lệ: ${query.intent}`)
  }

  if (!isAllowedValue(query.timeMode, AI_TIME_MODES)) {
    errors.push(`Time mode không hợp lệ: ${query.timeMode}`)
  }

  if (
    query.metric != null &&
    !isAllowedValue(query.metric, AI_METRICS)
  ) {
    errors.push(`Metric không hợp lệ: ${query.metric}`)
  }

  const changeType = query.filters?.changeType

  if (
    changeType != null &&
    !isAllowedValue(changeType, AI_CHANGE_TYPES)
  ) {
    errors.push(`Loại biến động không hợp lệ: ${changeType}`)
  }

  if (
    query.timeMode === AI_TIME_MODES.RANGE &&
    (!query.fromPeriod || !query.toPeriod)
  ) {
    errors.push(
      'Truy vấn khoảng thời gian phải có fromPeriod và toPeriod.'
    )
  }

  if (
    query.intent === AI_QUERY_INTENTS.LOOKUP &&
    !query.lookup?.maTsDg &&
    !query.lookup?.maTsbd &&
    !query.lookup?.cif
  ) {
    errors.push(
      'LOOKUP phải có maTsDg, maTsbd hoặc cif.'
    )
  }

  if (
    query.intent === AI_QUERY_INTENTS.AGGREGATE &&
    !query.metric
  ) {
    errors.push(
      'AGGREGATE phải xác định metric cần tính.'
    )
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}