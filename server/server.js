import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

const GREENNODE_BASE_URL =
  'https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1'

const GREENNODE_MODEL =
  'qwen/qwen3.6-flash'

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'greennode-map-backend',
  })
})

function normalizeQueryPlan(queryPlan) {
  if (
    !queryPlan ||
    typeof queryPlan !== 'object'
  ) {
    return queryPlan
  }

  if (!Array.isArray(queryPlan.steps)) {
    return queryPlan
  }

  return {
    ...queryPlan,

    steps: queryPlan.steps.map((step) => {
      if (
        step.action === 'GROUP_BY' &&
        !step.field &&
        Array.isArray(step.fields) &&
        step.fields.length === 1
      ) {
        const {
          fields,
          ...rest
        } = step

        return {
          ...rest,
          field: fields[0],
        }
      }

      if (
        step.action === 'LIMIT' &&
        step.value === undefined &&
        Number.isInteger(step.count)
      ) {
        const {
          count,
          ...rest
        } = step

        return {
          ...rest,
          value: count,
        }
      }

      return step
    }),
  }
}

app.post('/api/ai/query-plan', async (req, res) => {
  try {
    const { question } = req.body

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'QUESTION_REQUIRED',
      })
    }

    if (!process.env.GREENNODE_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'GREENNODE_API_KEY_MISSING',
      })
    }

    const systemPrompt = `
Bạn là Query Planner cho GreenNode Map.

Chỉ trả về JSON hợp lệ.
Không giải thích.
Không markdown.
Không tự tính số liệu.
Không trả lời nghiệp vụ.

Schema:

{
  "version": "2.0",
  "timeContext": {
    "mode": "SINGLE_PERIOD" hoặc "RANGE",
    "period": string hoặc null,
    "fromPeriod": string hoặc null,
    "toPeriod": string hoặc null
  },
  "steps": []
}

Actions:
FILTER
LOOKUP
COMPARE
GROUP_BY
AGGREGATE
SORT
LIMIT

Cấu trúc từng action:

FILTER:
{
  "action": "FILTER",
  "field": string,
  "operator": "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE" | "IN",
  "value": any
}

LOOKUP:
{
  "action": "LOOKUP",
  "field": "maTsDg" | "maTsbd" | "cif",
  "value": any
}

COMPARE:
{
  "action": "COMPARE",
  "field": "gtDinhGia" | "gtBaoDam" | "duNoTsbd" | "ltv"
}

GROUP_BY:
{
  "action": "GROUP_BY",
  "field": "assetGroup" | "province" | "valuationUnit" | "valuationRisk"
}

AGGREGATE:
{
  "action": "AGGREGATE",
  "metric": "COUNT" | "TOTAL_VALUATION" | "TOTAL_COLLATERAL" | "TOTAL_DEBT"
}

SORT:
{
  "action": "SORT",
  "by": "value",
  "order": "ASC" | "DESC"
}

LIMIT:
{
  "action": "LIMIT",
  "value": number
}

Quy tắc:
- Không dùng FILTER cho thời gian.
- Thời gian chỉ nằm trong timeContext.
- GROUP_BY đứng trước AGGREGATE.
- SORT đứng sau AGGREGATE.
- LIMIT đứng sau SORT nếu có SORT.
- COMPARE chỉ dùng với mode RANGE và phải là bước cuối.
- GROUP_BY chỉ dùng key "field", không dùng "fields".
- LIMIT chỉ dùng key "value".
- SORT chỉ dùng key "by": "value".
- Không tự tạo action, field, metric, operator mới.

Quy đổi kỳ:
tháng 6/2026 = 2026-06-30
tháng 7/2026 = 2026-07-31
tháng 8/2026 = 2026-08-31

Nếu thiếu thông tin:
{
  "error": "INSUFFICIENT_INFORMATION"
}
`
const modelStartTime = performance.now()
    const response = await fetch(
      `${GREENNODE_BASE_URL}/chat/completions`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GREENNODE_API_KEY}`,
        },

        body: JSON.stringify({
          model: GREENNODE_MODEL,

          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: question,
            },
          ],

          temperature: 0,
          max_tokens: 512,
          top_p: 0.95,
        }),
      }
    )

    const modelEndTime = performance.now()

const modelDurationMs =
  modelEndTime - modelStartTime

console.log(
  `GreenNode model time: ${modelDurationMs.toFixed(0)} ms`
)

    const rawData = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'GREENNODE_API_ERROR',
        details: rawData,
      })
    }

    const content =
      rawData?.choices?.[0]?.message?.content

    if (!content) {
      return res.status(502).json({
        success: false,
        error: 'EMPTY_MODEL_RESPONSE',
      })
    }

    let queryPlan

    try {
      queryPlan = JSON.parse(content)
    } catch {
      return res.status(502).json({
        success: false,
        error: 'INVALID_MODEL_JSON',
        rawContent: content,
      })
    }
    
    queryPlan = normalizeQueryPlan(queryPlan)

console.log(
  'GreenNode model time:',
  Math.round(modelDurationMs),
  'ms'
)

return res.json({
  success: true,
  queryPlan,
  timing: {
    modelMs:
      Math.round(modelDurationMs),
  },
})
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
    })
  }
})

const PORT = 3001

app.listen(PORT, () => {
  console.log(
    `GreenNode Map backend running at http://localhost:${PORT}`
  )
})