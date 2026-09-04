import {
  AI_QUERY_INTENTS,
  AI_TIME_MODES,
  AI_METRICS,
  AI_CHANGE_TYPES,
  createEmptyAIQuery,
} from './aiQueryContract'

import { validateAIQuery } from './aiQueryValidator'

import { executeAIQuery } from './aiQueryEngine'

// TEST 1: Query hợp lệ
const validQuery = createEmptyAIQuery()

validQuery.intent = AI_QUERY_INTENTS.AGGREGATE
validQuery.timeMode = AI_TIME_MODES.SINGLE_PERIOD
validQuery.period = '2026-08-31'
validQuery.filters.province = 'Hà Nội'
validQuery.metric = AI_METRICS.TOTAL_VALUATION

console.log(
  'AI QUERY TEST 1 - VALID:',
  validateAIQuery(validQuery)
)


// TEST 2: AI tạo ra metric không được phép
const invalidMetricQuery = createEmptyAIQuery()

invalidMetricQuery.intent = AI_QUERY_INTENTS.AGGREGATE
invalidMetricQuery.metric = 'DOANH_THU'

console.log(
  'AI QUERY TEST 2 - INVALID METRIC:',
  validateAIQuery(invalidMetricQuery)
)


// TEST 3: COMPARE nhưng thiếu khoảng thời gian
const invalidRangeQuery = createEmptyAIQuery()

invalidRangeQuery.intent = AI_QUERY_INTENTS.COMPARE
invalidRangeQuery.timeMode = AI_TIME_MODES.RANGE
invalidRangeQuery.filters.changeType =
  AI_CHANGE_TYPES.RELEASED

console.log(
  'AI QUERY TEST 3 - INVALID RANGE:',
  validateAIQuery(invalidRangeQuery)
)

// TEST 4: Query Engine - FILTER tài sản tại Hà Nội

console.log('AI QUERY TEST 4 - START')

const filterHaNoiQuery = createEmptyAIQuery()

filterHaNoiQuery.intent = AI_QUERY_INTENTS.FILTER
filterHaNoiQuery.timeMode = AI_TIME_MODES.SINGLE_PERIOD
filterHaNoiQuery.period = '2026-08-31'
filterHaNoiQuery.filters.province = 'Hà Nội'

try {
  const filterResult = executeAIQuery(filterHaNoiQuery)

  console.log(
    'AI QUERY TEST 4 - FILTER HA NOI:',
    filterResult
  )
} catch (error) {
  console.error(
    'AI QUERY TEST 4 - ERROR:',
    error
  )
}