import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  sanitizeEnrichment,
} from '../src/AI/v2/riskAnalysisFormatter.js'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

const GREENNODE_BASE_URL =
  process.env.GREENNODE_BASE_URL ||
  'https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1'

const GREENNODE_MODEL =
  process.env.GREENNODE_MODEL ||
  'qwen/qwen3.6-flash'

const GREENNODE_TIMEOUT_MS =
  Number(process.env.GREENNODE_TIMEOUT_MS || 30000)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIST_DIR = path.resolve(__dirname, '../dist')

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

Quy tắc chọn metric:

- COUNT:
  Dùng khi người dùng hỏi số lượng tài sản.
  Ví dụ:
  "Có bao nhiêu tài sản..."
  "Số tài sản..."

- TOTAL_COLLATERAL:
  Dùng khi người dùng hỏi về số lượng / tình hình TSBĐ đang bảo đảm.
  Các cụm như:
  "tài sản bảo đảm"
  "TSBĐ"
  "tình hình tài sản bảo đảm"
  nếu không hỏi giá trị tiền thì ưu tiên TOTAL_COLLATERAL.

- TOTAL_VALUATION:
  Chỉ dùng khi người dùng hỏi rõ về:
  "giá trị định giá"
  "GT định giá"
  "tổng giá trị định giá"

- TOTAL_DEBT:
  Chỉ dùng khi người dùng hỏi rõ về:
  "dư nợ"
  "dư nợ TSBĐ"
  "tổng dư nợ"

Không được suy diễn:
- "tài sản bảo đảm" = "giá trị định giá"
- "TSBĐ" = "giá trị định giá"

Nếu câu hỏi nói "tình hình tài sản bảo đảm" mà không nhắc đến giá trị định giá hoặc dư nợ:
→ dùng AGGREGATE metric = TOTAL_COLLATERAL.

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
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      GREENNODE_TIMEOUT_MS
    )

    const modelStartTime = performance.now()
    let response
    try {
      response = await fetch(
        `${GREENNODE_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GREENNODE_API_KEY}`,
          },
          body: JSON.stringify({
            model: GREENNODE_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question },
            ],
            temperature: 0,
            max_tokens: 512,
            top_p: 0.95,
          }),
        }
      )
    } catch (error) {
      if (error?.name === 'AbortError') {
        return res.status(504).json({
          success: false,
          error: 'GREENNODE_TIMEOUT',
        })
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }

    const modelEndTime = performance.now()

const modelDurationMs =
  modelEndTime - modelStartTime

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

/*
  ======================================================
  /api/ai/risk-analysis (V2.6.7 Risk Intelligence)
  ======================================================

  Evidence-grounded enrichment layer:
  - evidence (RiskContext) is computed deterministically by the client engine
    and is the single source of truth.
  - The LLM may only interpret the supplied evidence. Every number it echoes
    must exist in the evidence; unsupported conclusions (credit loss / default /
    fraud / legal) are stripped before the response reaches the user.
*/

const RISK_SEVERITY_VALUES = ['LOW', 'MEDIUM', 'HIGH']

const riskAnalysisSystemPrompt = `
Bạn là công cụ phân tích rủi ro định giá (Risk Intelligence) cho GreenNode Map.

Bạn nhận DUY NHẤT một khối bằng chứng JSON ("evidence") do hệ thống tính toán sẵn.
Bạn không có quyền truy cập dữ liệu khác và không được tự sinh con số nào.

ĐƯỢC PHÉP:
- Nêu các mẫu (pattern) nổi bật đang có trong bằng chứng.
- Giải thích vì sao một tín hiệu đáng chú ý, dựa trên dữ liệu trong bằng chứng.
- Sắp xếp ưu tiên các quan sát.
- Đề xuất bước kiểm tra / hành động tiếp theo thiết thực, dựa trên bằng chứng.
- Nếu evidence.ranking cho biết isTie=true, PHẢI giữ nguyên toàn bộ nhóm đồng hạng; tuyệt đối không chọn một phần tử duy nhất làm "cao nhất" hoặc ưu tiên riêng nếu bằng chứng không có tiêu chí phá hòa.

CẤM:
- Bịa sự kiện, con số, trường dữ liệu, nguyên nhân, xác suất, kết luận rủi ro
  không có trong bằng chứng.
- Suy diễn tổn thất tín dụng / vỡ nợ / gian lận / rủi ro pháp lý trừ khi bằng
  chứng trực tiếp hỗ trợ.
- Trích dẫn số liệu không nằm trong bằng chứng.
- Thêm cảnh báo chung chung không liên quan tới bằng chứng.

Nếu bằng chứng không đủ để phân tích, chỉ trả về:
{"error":"INSUFFICIENT_INFORMATION"}

Chỉ trả về JSON hợp lệ theo schema:
{"riskSeverity":"LOW","analysis":"...","priorities":["..."]}
- riskSeverity: một trong LOW, MEDIUM, HIGH.
- analysis: văn bản định tính (không yêu cầu kèm số; nếu có số phải trùng số trong bằng chứng).
- priorities: tối đa 3 chuỗi hành động ưu tiên.

NGẮN GỌN: trả lời thật ngắn gọn, súc tích (analysis tối đa ~220 chữ).
Không lặp lại toàn bộ số liệu; chỉ nêu tín hiệu nổi bật và hành động kiểm tra cụ thể.
`

app.post('/api/ai/risk-analysis', async (req, res) => {
  try {
    const { question, evidence } = req.body

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'QUESTION_REQUIRED',
      })
    }

    if (!evidence || typeof evidence !== 'object' || !evidence.scope) {
      return res.status(400).json({
        success: false,
        error: 'EVIDENCE_REQUIRED',
      })
    }

    if (!process.env.GREENNODE_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'GREENNODE_API_KEY_MISSING',
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      GREENNODE_TIMEOUT_MS
    )

    const modelStartTime = performance.now()
    let response
    try {
      response = await fetch(
        `${GREENNODE_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GREENNODE_API_KEY}`,
          },
          body: JSON.stringify({
            model: GREENNODE_MODEL,
            messages: [
              { role: 'system', content: riskAnalysisSystemPrompt },
              { role: 'user', content: JSON.stringify({ question, evidence }) },
            ],
            temperature: 0,
            max_tokens: 300,
            top_p: 0.95,
          }),
        }
      )
    } catch (error) {
      if (error?.name === 'AbortError') {
        return res.status(504).json({
          success: false,
          error: 'GREENNODE_TIMEOUT',
        })
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }

    const modelDurationMs = performance.now() - modelStartTime

    const rawData = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'GREENNODE_API_ERROR',
        details: rawData,
      })
    }

    const content = rawData?.choices?.[0]?.message?.content

    if (!content) {
      return res.status(502).json({
        success: false,
        error: 'EMPTY_MODEL_RESPONSE',
      })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      return res.status(502).json({
        success: false,
        error: 'INVALID_MODEL_JSON',
        rawContent: content,
      })
    }

    if (parsed?.error === 'INSUFFICIENT_INFORMATION') {
      return res.json({
        success: false,
        error: 'INSUFFICIENT_INFORMATION',
      })
    }

    if (
      !parsed ||
      typeof parsed?.analysis !== 'string' ||
      !RISK_SEVERITY_VALUES.includes(parsed?.riskSeverity)
    ) {
      return res.status(502).json({
        success: false,
        error: 'INVALID_MODEL_JSON',
        rawContent: content,
      })
    }

    const sanitized = sanitizeEnrichment(parsed, evidence)

    if (!sanitized.analysis && sanitized.priorities.length === 0) {
      return res.json({
        success: false,
        error: 'UNSUPPORTED_CONTENT',
      })
    }

    return res.json({
      success: true,
      riskSeverity: sanitized.riskSeverity,
      analysis: sanitized.analysis,
      priorities: sanitized.priorities,
      text_removed: sanitized.sanitized,
      timing: {
        modelMs: Math.round(modelDurationMs),
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

// Production: serve the Vite build from the same AgentBase runtime.
app.use(express.static(DIST_DIR))
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path === '/health') {
    return next()
  }
  return res.sendFile(path.join(DIST_DIR, 'index.html'), (error) => {
    if (error) next()
  })
})

const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log(`GreenNode Map running on ${HOST}:${PORT}`)
})
