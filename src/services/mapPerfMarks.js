/*
 * GREENNODE V2.6.7 — LIGHTWEIGHT BROWSER PERFORMANCE MARKS
 * ========================================================
 * DEV/TEST-ONLY instrumentation. KHÔNG thay đổi UI production.
 * Chỉ ghi mark khi người dùng chủ động bật:
 *
 *   window.__GN_MAP_PERF__ = { marks: [] }
 *   window.__GN_MAP_PERF__.enabled = true
 *
 * Khi tắt (mặc định), mỗi call chỉ là 1 phép so sánh window flag — chi phí ≈ 0.
 *
 * Sử dụng UI devtools:
 *   window.__GN_MAP_PERF__.summary()   -> bảng mark/measure đã ghi
 *   window.__GN_MAP_PERF__.clear()     -> xóa mark
 */

/* eslint-disable no-console */

const GLOBAL_KEY = '__GN_MAP_PERF__'

function ensureStore() {
  if (typeof window === 'undefined') return null
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = { enabled: false, marks: [] }
  }
  const store = window[GLOBAL_KEY]
  if (typeof store.enabled !== 'boolean') store.enabled = false
  if (!Array.isArray(store.marks)) store.marks = []
  if (typeof store.summary !== 'function') {
    store.summary = summary
  }
  if (typeof store.clear !== 'function') {
    store.clear = clear
  }
  return store
}

const report = {}

export function perfEnabled() {
  if (typeof window === 'undefined') return false
  return !!(window[GLOBAL_KEY]?.enabled)
}

export function mark(id, detail) {
  if (!perfEnabled()) return
  const store = ensureStore()
  if (!store) return
  const record = {
    id,
    at: performance.now(),
    ts: Date.now(),
  }
  if (detail !== undefined) record.detail = detail
  store.marks.push(record)
}

export function begin(id) {
  if (!perfEnabled()) return
  report[id] = performance.now()
}

export function end(id) {
  if (!perfEnabled()) return
  const start = report[id]
  if (typeof start !== 'number') return
  const duration = performance.now() - start
  delete report[id]
  mark(`measure:${id}`, { ms: Number(duration.toFixed(3)) })
}

export function clear() {
  const store = ensureStore()
  if (!store) return
  store.marks = []
}

export function summary() {
  const store = ensureStore()
  if (!store) return []
  return store.marks
}