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

// TEST 5: FILTER kết hợp Hà Nội + TSBĐ đang bảo đảm
const activeCollateralHaNoiQuery = createEmptyAIQuery()

activeCollateralHaNoiQuery.intent = AI_QUERY_INTENTS.FILTER
activeCollateralHaNoiQuery.timeMode = AI_TIME_MODES.SINGLE_PERIOD
activeCollateralHaNoiQuery.period = '2026-08-31'

activeCollateralHaNoiQuery.filters.province = 'Hà Nội'
activeCollateralHaNoiQuery.filters.objectType =
  'ACTIVE_COLLATERAL'

console.log(
  'AI QUERY TEST 5 - ACTIVE COLLATERAL HA NOI:',
  executeAIQuery(activeCollateralHaNoiQuery)
)
// TEST 6: LOOKUP theo mã tài sản định giá DG001
const lookupDG001Query = createEmptyAIQuery()

lookupDG001Query.intent = AI_QUERY_INTENTS.LOOKUP
lookupDG001Query.timeMode = AI_TIME_MODES.SINGLE_PERIOD
lookupDG001Query.period = '2026-08-31'

lookupDG001Query.lookup.maTsDg = 'DG001'

console.log(
  'AI QUERY TEST 6 - LOOKUP DG001:',
  executeAIQuery(lookupDG001Query)
)

// TEST 7: LOOKUP theo mã TSBĐ BD001
const lookupBD001Query = createEmptyAIQuery()

lookupBD001Query.intent = AI_QUERY_INTENTS.LOOKUP
lookupBD001Query.timeMode = AI_TIME_MODES.SINGLE_PERIOD
lookupBD001Query.period = '2026-08-31'

lookupBD001Query.lookup.maTsbd = 'BD001'

console.log(
  'AI QUERY TEST 7 - LOOKUP BD001:',
  executeAIQuery(lookupBD001Query)
)

// TEST 8: LOOKUP theo CIF
const lookupCIF001Query = createEmptyAIQuery()

lookupCIF001Query.intent = AI_QUERY_INTENTS.LOOKUP
lookupCIF001Query.timeMode = AI_TIME_MODES.SINGLE_PERIOD
lookupCIF001Query.period = '2026-08-31'

lookupCIF001Query.lookup.cif = 'CIF001'

console.log(
  'AI QUERY TEST 8 - LOOKUP CIF001:',
  executeAIQuery(lookupCIF001Query)
)

// TEST 9: AGGREGATE tổng giá trị định giá tại Hà Nội
const totalValuationHaNoiQuery = createEmptyAIQuery()

totalValuationHaNoiQuery.intent =
  AI_QUERY_INTENTS.AGGREGATE

totalValuationHaNoiQuery.timeMode =
  AI_TIME_MODES.SINGLE_PERIOD

totalValuationHaNoiQuery.period = '2026-08-31'

totalValuationHaNoiQuery.filters.province = 'Hà Nội'

totalValuationHaNoiQuery.metric =
  AI_METRICS.TOTAL_VALUATION

console.log(
  'AI QUERY TEST 9 - TOTAL VALUATION HA NOI:',
  executeAIQuery(totalValuationHaNoiQuery)
)

// TEST 10: AGGREGATE tổng số tài sản tại Hà Nội
const totalAssetsHaNoiQuery = createEmptyAIQuery()

totalAssetsHaNoiQuery.intent =
  AI_QUERY_INTENTS.AGGREGATE

totalAssetsHaNoiQuery.timeMode =
  AI_TIME_MODES.SINGLE_PERIOD

totalAssetsHaNoiQuery.period = '2026-08-31'

totalAssetsHaNoiQuery.filters.province = 'Hà Nội'

totalAssetsHaNoiQuery.metric =
  AI_METRICS.TOTAL_ASSETS

console.log(
  'AI QUERY TEST 10 - TOTAL ASSETS HA NOI:',
  executeAIQuery(totalAssetsHaNoiQuery)
)

// TEST 11: AGGREGATE số TSBĐ đang bảo đảm tại Hà Nội
const totalCollateralHaNoiQuery = createEmptyAIQuery()

totalCollateralHaNoiQuery.intent =
  AI_QUERY_INTENTS.AGGREGATE

totalCollateralHaNoiQuery.timeMode =
  AI_TIME_MODES.SINGLE_PERIOD

totalCollateralHaNoiQuery.period = '2026-08-31'

totalCollateralHaNoiQuery.filters.province = 'Hà Nội'

totalCollateralHaNoiQuery.metric =
  AI_METRICS.TOTAL_COLLATERAL

console.log(
  'AI QUERY TEST 11 - TOTAL COLLATERAL HA NOI:',
  executeAIQuery(totalCollateralHaNoiQuery)
)

// TEST 12: AGGREGATE tổng dư nợ TSBĐ tại Hà Nội
const totalDebtHaNoiQuery = createEmptyAIQuery()

totalDebtHaNoiQuery.intent =
  AI_QUERY_INTENTS.AGGREGATE

totalDebtHaNoiQuery.timeMode =
  AI_TIME_MODES.SINGLE_PERIOD

totalDebtHaNoiQuery.period = '2026-08-31'

totalDebtHaNoiQuery.filters.province = 'Hà Nội'

totalDebtHaNoiQuery.metric =
  AI_METRICS.TOTAL_DEBT

console.log(
  'AI QUERY TEST 12 - TOTAL DEBT HA NOI:',
  executeAIQuery(totalDebtHaNoiQuery)
)

// TEST 13: COMPARE các TSBĐ đã giải chấp từ T7 -> T8
const releasedCompareQuery = createEmptyAIQuery()

releasedCompareQuery.intent =
  AI_QUERY_INTENTS.COMPARE

releasedCompareQuery.timeMode =
  AI_TIME_MODES.RANGE

releasedCompareQuery.fromPeriod = '2026-07-31'
releasedCompareQuery.toPeriod = '2026-08-31'

releasedCompareQuery.filters.changeType =
  AI_CHANGE_TYPES.RELEASED

console.log(
  'AI QUERY TEST 13 - COMPARE RELEASED:',
  executeAIQuery(releasedCompareQuery)
)

// TEST 14: COMPARE các TSBĐ không còn xuất hiện trong nguồn từ T7 -> T8
const missingSourceCompareQuery = createEmptyAIQuery()

missingSourceCompareQuery.intent =
  AI_QUERY_INTENTS.COMPARE

missingSourceCompareQuery.timeMode =
  AI_TIME_MODES.RANGE

missingSourceCompareQuery.fromPeriod = '2026-07-31'
missingSourceCompareQuery.toPeriod = '2026-08-31'

missingSourceCompareQuery.filters.changeType =
  AI_CHANGE_TYPES.MISSING_SOURCE

console.log(
  'AI QUERY TEST 14 - COMPARE MISSING SOURCE:',
  executeAIQuery(missingSourceCompareQuery)
)