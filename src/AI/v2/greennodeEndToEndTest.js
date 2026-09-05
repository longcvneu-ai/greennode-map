// src/AI/v2/greennodeEndToEndTest.js

import {
  createQueryPlanFromGreenNode,
} from './greennodeAdapter.js'

import {
  validateQueryPlan,
} from './queryPlanValidator.js'

import {
  executeQueryPlan,
} from './queryPlanExecutor.js'

async function runGreenNodeEndToEndTest() {
  const question =
    'Top 1 tỉnh có dư nợ TSBĐ cao nhất tháng 8/2026'

  try {
    console.log(
      'GREENNODE E2E - QUESTION:',
      question
    )

    const queryPlan =
      await createQueryPlanFromGreenNode(
        question
      )

    console.log(
      'GREENNODE E2E - QUERY PLAN:',
      queryPlan
    )

    const validation =
      validateQueryPlan(queryPlan)

    console.log(
      'GREENNODE E2E - VALIDATION:',
      validation
    )

    if (!validation.valid) {
      console.error(
        'GREENNODE E2E - QUERY PLAN INVALID:',
        validation.errors
      )

      return
    }

    const result =
      executeQueryPlan(queryPlan)

    console.log(
      'GREENNODE E2E - RESULT:',
      result
    )
  } catch (error) {
    console.error(
      'GREENNODE E2E - ERROR:',
      error
    )
  }
}

runGreenNodeEndToEndTest()