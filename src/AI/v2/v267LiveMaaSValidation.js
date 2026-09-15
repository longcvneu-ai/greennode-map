/*
  V2.6.7 LIVE MaaS VALIDATION (production-like, no deploy)

  Drives the REAL application code paths (riskContextEngine, riskAnalysisFormatter,
  greennodeAdapter, App.jsx mirror) against a REAL instance of server/server.js
  (which loads .env, the REAL GREENNODE_API_KEY, and calls the real GreenNode MaaS).

  Test-only harness.
  - The deployed/runtime code is NOT modified.
  - The API key is never read or printed by this file.
*/

import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'
import { formatRiskAnalysis, fetchRiskEnrichment, composeRiskAnswer, computeAllowedNumbers } from './riskAnalysisFormatter.js'
import { resolveQueryPlanValues } from './queryValueResolver.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

import { valuationAssets } from '../../data/valuationAssets.js'
import { valuationSnapshots } from '../../data/valuationSnapshots.js'
import { valuationRisks } from '../../data/valuationRisks.js'
import { collateralAssets } from '../../data/collateralAssets.js'
import { collateralSnapshots } from '../../data/collateralSnapshots.js'
import { collateralCustomers } from '../../data/collateralCustomers.js'
import { customers } from '../../data/customers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')

// ---------------- Dataset: the application's current local mock ----------------
const MOCK_DATASET = { valuationAssets, valuationSnapshots, valuationRisks, collateralAssets, collateralSnapshots, collateralCustomers, customers }

function buildTieDataset() {
  const valuationAssetsT = []
  const valuationSnapshotsT = []
  const valuationRisksT = []
  let idx = 0
  for (const province of ['Hà Nội', 'Đà Nẵng', 'Cần Thơ']) {
    for (let i = 1; i <= 25; i += 1) {
      idx += 1
      const recordId = `REC${idx}`
      valuationAssetsT.push({ recordId, maTsDg: `DG${String(idx).padStart(5, '0')}`, tenTaiSan: `Tài sản ${idx}`, tinhTp: province, nhomTsCap1: 'BĐS', loaiTsCap2: 'Nhà đất' })
      valuationSnapshotsT.push({ valuationRecordId: recordId, kyBaoCao: '2026-08-31', gtDinhGia: 1_000_000_000, ngayDinhGia: '2026-08-15', donViDinhGia: 'Nội bộ' })
      valuationRisksT.push({ valuationRecordId: recordId, kyBaoCao: '2026-08-31', loaiRuiRo: 'Định giá cao' })
    }
  }
  return { valuationAssets: valuationAssetsT, valuationSnapshots: valuationSnapshotsT, valuationRisks: valuationRisksT, collateralAssets: [], collateralSnapshots: [], collateralCustomers: [], customers: [] }
}
const TIE_DATASET = buildTieDataset()

const BASE1 = process.env.V267_LIVE_BASE1 || 'http://127.0.0.1:8730'
const BASE2 = process.env.V267_LIVE_BASE2 || 'http://127.0.0.1:8731'
const HANG_PORT = Number(process.env.V267_HANG_PORT || 8741)

const nativeFetch = globalThis.fetch
const trace = []
function makeFetch(base) {
  return async (url, init) => {
    const target = typeof url === 'string' && url.startsWith('/') ? `${base}${url}` : url
    const t0 = performance.now()
    const resp = await nativeFetch(target, init)
    let body = null
    try { body = await resp.clone().json() } catch {}
    const ms = Math.round(performance.now() - t0)
    const route = typeof url === 'string' ? url : String(url)
    trace.push({
      route,
      status: resp.status,
      ok: resp.ok,
      ms,
      modelMs: body?.timing?.modelMs ?? null,
      success: body?.success ?? null,
      error: body?.error ?? null,
      text_removed: body?.text_removed ?? null,
      analysis: body?.analysis ?? null,
      priorities: Array.isArray(body?.priorities) ? body.priorities : null,
    })
    return resp
  }
}

let server1 = null
let server2 = null
let hangServer = null

function startServer(port, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('exit', (code) => { child.exitCode = code })
    const deadline = Date.now() + 15000
    const poll = async () => {
      if (Date.now() > deadline) {
        reject(new Error(`server ${port} not ready. stderr: ${err.slice(0, 800)}`))
        return
      }
      try {
        const r = await nativeFetch(`http://127.0.0.1:${port}/health`)
        if (r.ok) { resolve({ port, child, logs: () => ({ out, err }) }); return }
      } catch {}
      setTimeout(poll, 200)
    }
    poll()
  })
}

function startHangServer(port) {
  return new Promise((resolve) => {
    const srv = net.createServer(() => {})
    srv.listen(port, '127.0.0.1', () => resolve(srv))
  })
}

function maasCalls() {
  return trace.filter((t) => t.route.endsWith('/api/ai/risk-analysis') || t.route.endsWith('/api/ai/query-plan'))
}

const BANNED = ['nợ xấu', 'vỡ nợ', 'không có khả năng trả nợ', 'mất khả năng thanh toán', 'giả mạo', 'gian lận', 'ngụy tạo', 'khởi kiện', 'kiện tụng', 'tố tụng', 'hình sự', 'xếp hạng tín nhiệm', 'thiệt hại tín dụng', 'rủi ro pháp lý']
function hasBanned(text) {
  return BANNED.some((p) => String(text || '').toLowerCase().includes(p))
}
function parseCandidateNumber(token) {
  const t = String(token || '').trim().replace(/\s+/g, '')
  if (!t) return null
  const trailingSeparator = t.match(/[.,](\d+)$/)
  const trailingDigits = trailingSeparator ? trailingSeparator[1].length : 0
  const separatorCount = (t.match(/[.,]/g) || []).length
  const isGrouped = separatorCount > 1 || (trailingDigits === 3 && t.includes('.'))
  if (isGrouped) return { value: Number(t.replace(/[.,]/g, '')), integer: true }
  const normalized = t.replace(/,/g, '.')
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return { value, integer: !normalized.includes('.') }
}
function isSalient(candidate) {
  if (!candidate) return false
  if (!candidate.integer) return true
  return Math.abs(candidate.value) >= 10
}
function isGrounded(candidate, allowed) {
  const target = candidate.integer ? candidate.value : Math.round(candidate.value * 100) / 100
  return allowed.has(target)
}
function ungroundedNumbers(text, allowed) {
  const out = []
  for (const raw of String(text || '').match(/\d[\d.,]*/g) || []) {
    const candidate = parseCandidateNumber(raw)
    if (!candidate || !isSalient(candidate)) continue
    if (!isGrounded(candidate, allowed)) out.push(candidate.value)
  }
  return out
}

let passCount = 0
let failCount = 0
const results = []

function recordResult(id, label, pass, reason, finalLength) {
  results.push({ id, label, pass, reason, finalLength })
  if (pass) passCount++
  else failCount++
}

function evidenceSummary(ctx) {
  if (!ctx) return 'No RiskContext'
  const s = ctx.snapshot || {}
  const d = ctx.delta || {}
  const v = ctx.valuation || {}
  const c = ctx.concentration || {}
  return JSON.stringify({
    scope: { period: ctx.scope?.period, priorPeriod: ctx.scope?.priorPeriod, riskType: ctx.scope?.riskType || null },
    snapshot: { totalAssets: s.totalAssets, riskAssets: s.riskAssets, riskCases: s.riskCases, riskRatePct: s.riskRatePct },
    delta: { priorRiskCases: d.priorRiskCases, riskDeltaMoM: d.riskDeltaMoM, emerging: d.emergingRiskAssets, closed: d.closedRiskAssets },
    valuation: { totalValuation: v.totalValuation, avgValuation: v.avgValuation, totalDebt: v.totalDebt, avgLtv: v.avgLtv },
    byRiskType: (ctx.byRiskType || []).map((x) => `${x.key}:${x.cases}`),
    concentration: c.topProvince ? `${c.topProvince}:${c.topProvinceCases}(${c.topProvinceSharePct}%)` : null,
    sampleAssets: (ctx.riskCasesSample || []).map((a) => a.maTsDg || a.tenTaiSan),
  })
}

async function runFlow(question, dataset, options = {}) {
  const { fetchImpl = makeFetch(BASE1), defaultPeriod = '2026-08-31', simulateError = false } = options
  trace.length = 0
  const t0 = performance.now()
  let result
  try {
    const rawQueryPlan = await createQueryPlanFromGreenNode(question, dataset, { defaultPeriod })

    if (rawQueryPlan?.engine === 'RISK_CONTEXT') {
      const analysis = formatRiskAnalysis(rawQueryPlan)
      result = {
        status: 'SUCCESS',
        planner: 'RISK_CONTEXT',
        subStatus: rawQueryPlan.status,
        evidence: evidenceSummary(rawQueryPlan.riskContext),
        canEnrich: analysis.canEnrich,
        deterministicText: analysis.text,
        riskContext: rawQueryPlan.riskContext,
      }
      if (analysis.canEnrich) {
        const enrichment = await fetchRiskEnrichment(question, analysis.riskContext, fetchImpl)
        result.finalAnswer = composeRiskAnswer(analysis, enrichment)
      } else {
        result.finalAnswer = analysis.text
      }
    } else {
      const resolution = resolveQueryPlanValues(rawQueryPlan, dataset)
      if (!resolution.success) {
        result = { status: 'ERROR', planner: 'DETERMINISTIC', error: resolution.errors.join(' | '), finalAnswer: null }
      } else {
        const validation = validateQueryPlan(resolution.queryPlan)
        if (!validation.valid) {
          result = { status: 'ERROR', planner: 'DETERMINISTIC', error: `Query Plan không hợp lệ: ${validation.errors.join(' | ')}`, finalAnswer: null }
        } else {
          const execResult = executeQueryPlan(resolution.queryPlan, dataset)
          if (!execResult.success) {
            result = { status: 'ERROR', planner: 'DETERMINISTIC', error: execResult.errors?.join(' | ') || 'Không thể thực thi Query Plan.', finalAnswer: null }
          } else {
            const finalAnswer = formatQueryAnswer(resolution.queryPlan, execResult)
            result = {
              status: 'SUCCESS',
              planner: 'DETERMINISTIC',
              subStatus: null,
              evidence: evidenceSummary(null),
              canEnrich: false,
              deterministicText: finalAnswer,
              riskContext: null,
              finalAnswer,
              intent: resolution.queryPlan?.answerContext?.intent || null,
            }
          }
        }
      }
    }
  } catch (error) {
    const isConnectionError = error instanceof TypeError && error?.message === 'Failed to fetch'
    result = {
      status: 'ERROR',
      planner: 'AI_FALLBACK_THREW',
      errorMessage: error?.message || String(error),
      userAnswer: isConnectionError ? 'Không thể kết nối tới dịch vụ AI. Vui lòng thử lại sau.' : 'Không thể xử lý yêu cầu AI. Vui lòng thử lại.',
      finalAnswer: null,
    }
  }
  result.localMs = Math.round(performance.now() - t0)
  result.maas = maasCalls()
  result.finalLength = String(result.finalAnswer || result.userAnswer || result.error || '').length
  return result
}

async function printCase(testId, label, question, r) {
  console.log('\n============================================================')
  console.log(`${testId} — ${label}`)
  console.log(`QUESTION: ${question}`)
  console.log(`RiskContext evidence: ${r.evidence ?? '(none - deterministic path)'}`)
  console.log(`deterministic narrative: ${r.deterministicText ?? '(n/a)'}`)
  if (r.status === 'SUCCESS' && r.planner === 'RISK_CONTEXT' && r.maas.some((t) => t.route.endsWith('/api/ai/risk-analysis') && t.success === true)) {
    console.log('GreenNode enrichment (server-sanitized):')
    console.log(`  riskSeverity: ${r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))?.analysis ? 'in AI answer' : 'n/a'}`)
    const en = r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))
    if (en) {
      console.log(`  analysis: ${en.analysis ?? 'n/a'}`)
      console.log(`  priorities: ${en.priorities ? en.priorities.join(' | ') : 'n/a'}`)
      console.log(`  text_removed (AI content stripped): ${en.text_removed}`)
      console.log(`  modelMs: ${en.modelMs}`)
    }
  }
  console.log(`FINAL USER-FACING ANSWER: ${r.finalAnswer ?? r.userAnswer ?? r.error}`)
  if (r.planner === 'AI_FALLBACK_THREW') console.log(`  (server/route error that produced this: ${r.errorMessage})`)
  if (r.maas.length === 0) console.log('MaaS actually called: NO')
  else r.maas.forEach((t) => console.log(`MaaS actually called: YES route=${t.route} status=${t.status} ok=${t.ok} error=${t.error ?? ''} success=${t.success ?? ''} localMs=${t.ms} modelMs=${t.modelMs ?? ''}`))
  console.log(`local end-to-end ms: ${r.localMs}`)
  console.log(`final answer length: ${r.finalLength} chars (3-section compact target ~650-700)`)
}

// ---------------- TEST EXECUTION ----------------
const main = async () => {
  console.log('V2.6.7 LIVE MaaS VALIDATION — production-like (real server + real GreenNode endpoint, no deploy)')
  console.log(`Base URL for live server 1: ${BASE1}`)
  console.log(`Base URL for live server 2 (resilience/degraded): ${BASE2}`)
  console.log('API key: loaded by server.js from .env — never printed.')

  server1 = await startServer(8730)
  console.log('live server 1 up (port 8730)')

  // Mirror browser same-origin semantics for the in-process adapter: every
  // relative '/api/...' fetch must resolve against the live server that is
  // actually running. This makes the legacy AI-fallback route (/api/ai/query-plan)
  // exercise the real MaaS endpoint too. Test-only override.
  globalThis.fetch = makeFetch(BASE1)

  // ---------------- TEST 1 ----------------
  {
    const q = 'Phân tích tình hình rủi ro định giá tài sản tháng 8/2026 và đề xuất 2 việc cần ưu tiên kiểm tra.'
    const r = await runFlow(q, MOCK_DATASET)
    await printCase('TEST 1', 'Normal analytical question (live MaaS)', q, r)

    const en = r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))
    const numbers = en?.analysis ? `${en.analysis} ${(en.priorities || []).join(' ')}` : ''
    const allowed = computeAllowedNumbers(r.riskContext)
    const ungrounded = ungroundedNumbers(`${r.finalAnswer}`, allowed)

    const pass =
      r.status === 'SUCCESS' &&
      r.planner === 'RISK_CONTEXT' &&
      r.subStatus === 'OK' &&
      r.maas.length >= 1 &&
      en?.success === true &&
      r.finalAnswer.includes('Nhận định') &&
      r.finalAnswer.includes('Điểm cần chú ý') &&
      r.finalAnswer.includes('Ưu tiên kiểm tra:') &&
      !hasBanned(r.finalAnswer) &&
      ungrounded.length === 0 &&
      /100 tài sản/.test(r.deterministicText) &&
      /3 case/.test(r.deterministicText)

    const reasons = []
    if (r.subStatus !== 'OK') reasons.push(`status ${r.subStatus}`)
    if (!en?.success) reasons.push('MaaS enrichment: success=false')
    if (!r.finalAnswer.includes('Nhận định') || !r.finalAnswer.includes('Điểm cần chú ý') || !r.finalAnswer.includes('Ưu tiên kiểm tra:')) reasons.push('not a compact 3-section answer')
    if (hasBanned(r.finalAnswer)) reasons.push('unsupported conclusion present')
    if (ungrounded.length) reasons.push(`ungrounded numbers in final answer: ${ungrounded}`)
    if (!/100 tài sản/.test(r.deterministicText) || !/3 case/.test(r.deterministicText)) reasons.push('deterministic narrative missing expected mock totals')

    for (const t of r.maas) {
      if (t.text_removed) reasons.push('AI produced ungrounded/unverifiable text that was stripped by server')
    }
    recordResult(1, 'Normal analytical question', pass, reasons.join('; ') || 'fast deterministic answer shown first; MaaS enrichment patched in; numbers match RiskContext; no invented facts', r.finalLength)
  }

  // ---------------- TEST 2 (comparison / trend now routes to RiskContext) ----------------
  {
    const q = 'So sánh tình hình rủi ro tháng 8/2026 với tháng 7/2026, điểm nào đáng chú ý nhất và tôi nên kiểm tra gì?'
    const r = await runFlow(q, MOCK_DATASET)
    await printCase('TEST 2', 'Comparison / trend (as phrased)', q, r)

    const en = r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))
    const allowed = r.riskContext ? computeAllowedNumbers(r.riskContext) : new Set()
    const ungrounded = ungroundedNumbers(`${r.finalAnswer}`, allowed)
    const bothPeriods = /tháng 8\/2026/.test(r.deterministicText) && /tháng 7\/2026/.test(r.deterministicText)

    const pass =
      r.status === 'SUCCESS' &&
      r.planner === 'RISK_CONTEXT' &&
      r.subStatus === 'OK' &&
      en?.success === true &&
      r.finalAnswer.includes('Nhận định') &&
      r.finalAnswer.includes('Ưu tiên kiểm tra:') &&
      bothPeriods &&
      !hasBanned(r.finalAnswer) &&
      ungrounded.length === 0

    const reasons = []
    if (r.planner !== 'RISK_CONTEXT') reasons.push(`planner=${r.planner}`)
    if (en?.success !== true) reasons.push('MaaS enrichment success=false')
    if (!bothPeriods) reasons.push('comparison evidence missing one period label (tháng 7/2026 / tháng 8/2026)')
    if (!r.finalAnswer.includes('Nhận định')) reasons.push('not compact 3-section answer')
    if (hasBanned(r.finalAnswer)) reasons.push('unsupported conclusion present')
    if (ungrounded.length) reasons.push(`ungrounded numbers: ${ungrounded}`)

    recordResult(2, 'Comparison / trend (as phrased)', pass, reasons.join('; ') || 'routes to RiskContext; deterministic MoM delta (t7 vs t8) shown; grounded MaaS interpretation + priorities returned; no fabrication', r.finalLength)
  }

  // ---------------- TEST 2b (supplementary: routed comparison) ----------------
  {
    const q = 'Phân tích so sánh tình hình rủi ro tháng 8/2026 với tháng 7/2026: điểm nào đáng chú ý nhất và tôi nên kiểm tra gì?'
    const r = await runFlow(q, MOCK_DATASET)
    await printCase('TEST 2b', 'Comparison / trend (analytical-hint phrasing, supplementary)', q, r)
    const en = r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))
    const allowed = computeAllowedNumbers(r.riskContext)
    const ungrounded = ungroundedNumbers(`${r.finalAnswer}`, allowed)
    const ok = r.status === 'SUCCESS' && en?.success === true && r.finalAnswer.includes('Nhận định') && r.finalAnswer.includes('Ưu tiên kiểm tra:') && !hasBanned(r.finalAnswer) && ungrounded.length === 0
    console.log('=> supplementary note: when routed to RiskContext, comparison receives deterministic MoM deltas + grounded AI commentary, PASS=' + ok)
  }

  // ---------------- TEST 3 (unsupported conclusion routes to the grounded path) ----------------
  {
    const q = 'Dựa trên dữ liệu hiện tại, tài sản nào có khả năng trở thành nợ xấu và tỷ lệ mất vốn dự kiến là bao nhiêu?'
    const r = await runFlow(q, MOCK_DATASET)
    await printCase('TEST 3', 'Unsupported conclusion (nợ xấu / loss rate) — evidence-grounded, no fabrication', q, r)

    const en = r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))
    const allowed = r.riskContext ? computeAllowedNumbers(r.riskContext) : new Set()
    const ungrounded = ungroundedNumbers(`${r.finalAnswer}`, allowed)
    const fakePercent = (r.finalAnswer || '').match(/\d+(?:[.,]\d+)?\s*%/g) || []
    const noFakePercent = fakePercent.length === 0 || fakePercent.every((p) => allowed.has(Number(p.replace(/[^0-9.]/g, '').replace(/,/g, '.'))))

    const pass =
      r.status === 'SUCCESS' &&
      r.planner === 'RISK_CONTEXT' &&
      r.subStatus === 'OK' &&
      r.finalAnswer.includes('Nhận định') &&
      r.finalAnswer.includes('Ưu tiên kiểm tra:') &&
      noFakePercent &&
      !hasBanned(r.finalAnswer) &&
      ungrounded.length === 0

    const reasons = []
    if (r.planner !== 'RISK_CONTEXT') reasons.push(`planner=${r.planner}`)
    if (en?.success === true && en.text_removed) reasons.push('server stripped AI content (ungrounded)')
    if (!r.finalAnswer.includes('Nhận định')) reasons.push('not compact 3-section answer')
    if (!noFakePercent) reasons.push('fabricated percentage present: ' + fakePercent.join(','))
    if (hasBanned(r.finalAnswer)) reasons.push('unsupported conclusion present')
    if (ungrounded.length) reasons.push(`ungrounded numbers: ${ungrounded}`)

    recordResult(3, 'Deliberately unsupported conclusion', pass, reasons.join('; ') || 'no NPL/loss-rate invented; only grounded numbers; user gets safe 3-section answer (fast deterministic view + refusal/safe AI)', r.finalLength)
  }

  // ---------------- TEST 3b (supplementary: routed to safe path) ----------------
  {
    const q = 'Phân tích: dựa trên dữ liệu hiện tại, tài sản nào có khả năng trở thành nợ xấu và tỷ lệ mất vốn dự kiến là bao nhiêu?'
    const r = await runFlow(q, MOCK_DATASET)
    await printCase('TEST 3b', 'Unsupported conclusion on the evidence-grounded path (supplementary)', q, r)
    const en = r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))
    const allowed = r.riskContext ? computeAllowedNumbers(r.riskContext) : new Set()
    const ungrounded = ungroundedNumbers(`${r.finalAnswer}`, allowed)
    const fakePercent = (r.finalAnswer || '').match(/\d+(?:[.,]\d+)?\s*%/g) || []
    const okNoFake = fakePercent.length === 0 || fakePercent.every((p) => allowed.has(Number(p.replace(/[^0-9.]/g, '').replace(/,/g, '.'))))
    const ok = r.status === 'SUCCESS' && r.subStatus === 'OK' && !hasBanned(r.finalAnswer) && ungrounded.length === 0 && okNoFake
    console.log('=> supplementary note: on the grounded path no loss-rate/default numbers are allowed (sanitizer will strip them); PASS=' + ok + (okNoFake ? '' : ` fake percents ${fakePercent}`))
  }

  // ---------------- TEST 4 ----------------
  {
    const q = 'Phân tích rủi ro tài sản tháng 9/2026 và đề xuất hành động.'
    const r = await runFlow(q, MOCK_DATASET)
    await printCase('TEST 4', 'No-data period', q, r)

    const pass =
      r.status === 'SUCCESS' &&
      r.planner === 'RISK_CONTEXT' &&
      r.subStatus === 'NO_DATASET_PERIOD' &&
      r.canEnrich === false &&
      r.maas.length === 0 &&
      (r.finalAnswer || '').toLowerCase().includes('chưa có dữ liệu') &&
      !(r.finalAnswer || '').toLowerCase().includes('không phát hiện rủi ro') &&
      !r.finalAnswer.includes('NO_DATASET_PERIOD') &&
      !r.finalAnswer.includes('Không thể xử lý yêu cầu AI')

    const reasons = []
    if (r.subStatus !== 'NO_DATASET_PERIOD') reasons.push(`status ${r.subStatus}`)
    if (r.canEnrich) reasons.push('canEnrich=true (should be false)')
    if (r.maas.length !== 0) reasons.push(`MaaS called ${r.maas.length} time(s)`)
    if (!(r.finalAnswer || '').toLowerCase().includes('chưa có dữ liệu')) reasons.push('no "no data" wording')
    if ((r.finalAnswer || '').toLowerCase().includes('không phát hiện rủi ro')) reasons.push('implies zero risk')
    if (r.finalAnswer.includes('NO_DATASET_PERIOD') || r.finalAnswer.includes('Không thể xử lý yêu cầu AI')) reasons.push('technical error leaked to user')

    recordResult(4, 'No-data period', pass, reasons.join('; ') || 'explicit no-dataset message; not presented as zero risk/improvement; no technical codes')
  }

  // ---------------- TEST 5 ----------------
  {
    const q = 'Tỉnh nào phát sinh rủi ro nhiều nhất?'
    const r = await runFlow(q, TIE_DATASET)
    await printCase('TEST 5', 'Deterministic tie regression control (synthetic tie dataset, same as test:tie)', q, r)

    const pass =
      r.status === 'SUCCESS' &&
      r.planner === 'DETERMINISTIC' &&
      r.intent === 'RANK_DIMENSION' &&
      r.maas.length === 0 &&
      (r.finalAnswer || '').includes('Hà Nội, Đà Nẵng, Cần Thơ đồng hạng cao nhất: 25 case/tỉnh/thành phố.')

    const reasons = []
    if (r.intent !== 'RANK_DIMENSION') reasons.push(`intent ${r.intent}`)
    if (r.maas.length !== 0) reasons.push(`MaaS called ${r.maas.length} time(s)`)
    if (!(r.finalAnswer || '').includes('đồng hạng')) reasons.push('tie handling missing')
    if (!(r.finalAnswer || '').includes('25 case/tỉnh/thành phố')) reasons.push('count differs')

    recordResult(5, 'Deterministic regression control', pass, reasons.join('; ') || 'identical to V2.6.4 tie regression; MaaS never called; tie handling preserved')
  }

  // ---------------- RESILIENCE: MaaS timeout/failure on TEST 1 ----------------
  {
    console.log('\n============================================================')
    console.log('RESILIENCE — simulate MaaS timeout/failure (degraded server, degraded MaaS target)')
    hangServer = await startHangServer(HANG_PORT)
    server2 = await startServer(8731, { GREENNODE_BASE_URL: `http://127.0.0.1:${HANG_PORT}`, GREENNODE_TIMEOUT_MS: '3000' })
    console.log('degraded server up (port 8731, MaaS target hangs -> forced timeout)')

    const q = 'Phân tích tình hình rủi ro định giá tài sản tháng 8/2026 và đề xuất 2 việc cần ưu tiên kiểm tra.'
    const r = await runFlow(q, MOCK_DATASET, { fetchImpl: makeFetch(BASE2) })
    await printCase('RESILIENCE', 'TEST 1 under MaaS timeout', q, r)

    const en = r.maas.find((t) => t.route.endsWith('/api/ai/risk-analysis'))
    const allowed = r.riskContext ? computeAllowedNumbers(r.riskContext) : new Set()
    const ungrounded = ungroundedNumbers(`${r.finalAnswer}`, allowed)
    const pass =
      r.status === 'SUCCESS' &&
      r.planner === 'RISK_CONTEXT' &&
      r.subStatus === 'OK' &&
      r.maas.length >= 1 &&
      en?.ok !== true &&
      (en?.error === 'GREENNODE_TIMEOUT' || en?.error === 'GREENNODE_API_ERROR' || en?.error === 'SERVER_ERROR') &&
      r.finalAnswer.includes('Nhận định') &&
      r.finalAnswer.includes('Điểm cần chú ý') &&
      r.finalAnswer.includes('Ưu tiên kiểm tra:') &&
      !r.finalAnswer.includes('Không thể xử lý yêu cầu AI') &&
      !r.finalAnswer.includes('Không thể kết nối') &&
      !/50[0-9]|TIMEOUT|SERVER_ERROR/.test(r.finalAnswer) &&
      !hasBanned(r.finalAnswer) &&
      ungrounded.length === 0 &&
      /100 tài sản/.test(r.finalAnswer)

    const reasons = []
    if (en?.error !== 'GREENNODE_TIMEOUT') reasons.push(`server error=${en?.error} (wanted GREENNODE_TIMEOUT or API error)`)
    if (!r.finalAnswer.includes('Nhận định') || !r.finalAnswer.includes('Điểm cần chú ý') || !r.finalAnswer.includes('Ưu tiên kiểm tra:')) reasons.push('not a compact deterministic 3-section fallback')
    if (r.finalAnswer.includes('Không thể xử lý yêu cầu AI')) reasons.push('generic error screen shown')
    if (r.finalAnswer.includes('Không thể kết nối')) reasons.push('connection error screen shown')
    if (/50[0-9]|TIMEOUT|SERVER_ERROR/.test(r.finalAnswer)) reasons.push('technical detail leaked to user')
    if (ungrounded.length) reasons.push(`ungrounded numbers: ${ungrounded}`)

    recordResult('R', 'MaaS timeout/failure resilience', pass, reasons.join('; ') || 'MaaS failed w/ ' + (en?.error || '?') + '; user still got fast deterministic 3-section answer; failure details stayed server-side', r.finalLength)
  }

  // ---------------- SUMMARY ----------------
  console.log('\n============================================================')
  console.log('LIVE MaaS VALIDATION SUMMARY')
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}. ${r.label}`)
    console.log(`     ${r.reason}`)
    if (r.finalLength != null) console.log(`     final answer length: ${r.finalLength} chars (≤700 target)`)
  }
  console.log(``)
  console.log(`B. LIVE MaaS LATENCY (modelMs = model time inside server; localMs = end-to-end)`)

  // Reload latencies from the actual trace entries is not persisted after each run, so we rely on the printed case blocks.

  if (server1) server1.child.kill()
  if (server2) {
    server2.child.kill()
    hangServer?.close()
  }

  const ok = failCount === 0
  console.log(`\nRESULT: ${passCount} passed, ${failCount} failed`)
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => {
  console.error('HARNESS FAILURE', e)
  try { server1?.child.kill() } catch {}
  try { server2?.child.kill() } catch {}
  try { hangServer?.close() } catch {}
  process.exitCode = 2
})