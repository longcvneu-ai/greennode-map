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
  'z-ai/glm-5.2-hackathon'

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
Bạn là AI Query Planner cho GreenNode Map.

Nhiệm vụ duy nhất:
Chuyển câu hỏi tiếng Việt của người dùng thành Query Plan JSON đúng schema V2.

Chỉ trả về JSON hợp lệ.
Không giải thích.
Không thêm markdown.
Không tự tính toán số liệu.
Không tự trả lời kết quả nghiệp vụ.
Không tự tạo field, action, metric hoặc operator ngoài danh sách cho phép.
Không dùng FILTER để lọc thời gian.
Thời gian luôn đặt trong timeContext.
LIMIT bắt buộc dùng key "value".
SORT dùng "by": "value".

Schema bắt buộc:

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

Action được phép:
FILTER
LOOKUP
COMPARE
GROUP_BY
AGGREGATE
SORT
LIMIT

FILTER operators:
EQ
NEQ
GT
GTE
LT
LTE
IN

LOOKUP fields:
maTsDg
maTsbd
cif

COMPARE fields:
gtDinhGia
gtBaoDam
duNoTsbd
ltv

GROUP_BY bắt buộc có đúng cấu trúc:

{
  "action": "GROUP_BY",
  "field": "province"
}

Bắt buộc dùng key "field" ở dạng số ít.
Không được dùng "fields".
Không được dùng array cho GROUP_BY field.
Mỗi GROUP_BY chỉ có đúng một field.
GROUP_BY fields:
assetGroup
province
valuationUnit
valuationRisk

Metrics:
COUNT
TOTAL_VALUATION
TOTAL_COLLATERAL
TOTAL_DEBT

Quy ước thời gian:
tháng 6/2026 = 2026-06-30
tháng 7/2026 = 2026-07-31
tháng 8/2026 = 2026-08-31

COMPARE chỉ dùng với timeContext.mode = "RANGE".
COMPARE phải là bước cuối.
GROUP_BY phải đứng trước AGGREGATE.
SORT phải đứng sau AGGREGATE.
LIMIT phải đứng sau SORT nếu có SORT.

QUY TẮC TÊN KEY BẮT BUỘC:

FILTER:
action, field, operator, value

LOOKUP:
action, field, value

COMPARE:
action, field

GROUP_BY:
action, field

AGGREGATE:
action, metric

SORT:
action, by, order

LIMIT:
action, value

Không được tự đổi tên key.
Không được dùng "fields".
Không được dùng "count" thay cho "value".
Nếu không đủ thông tin để tạo Query Plan hợp lệ, trả:
{
  "error": "INSUFFICIENT_INFORMATION"
}
`

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
          max_tokens: 2048,
          top_p: 0.95,
        }),
      }
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

    return res.json({
      success: true,
      queryPlan,
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