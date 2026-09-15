# V2.6.7 Risk Intelligence — Design Report

Trạng thái: **THIẾT KẾ** — chưa được chấp thuận, chưa sửa mã, chưa deploy.

## 1. Mục tiêu

Biến nhánh "analytical AI" (từ V2.6.6) thành một tầng **quyết định dựa trên bằng chứng**:

- Câu hỏi phân tích/đề xuất (`phân tích`, `đề xuất`, `nhận xét`, `nhận định`, `gợi ý`, `khuyến nghị`, `tổng quan`)
  → hạ xuống thành **tập số liệu có cấu trúc (`RiskContext`)** do mã tính toán 100% tất định.
- LLM chỉ được dùng để **diễn giải bằng chứng đã cấp** và **đề xuất hành động ưu tiên** — không được tự sinh con số.
- Mọi truy vấn tất định hiện có (count / ranking / location / tie / filter / search / compare / metric) **giữ nguyên không đổi**.
- Sửa triệt để lỗi V2.6.6: câu phân tích hiện rơi thẳng vào `/api/ai/query-plan` và model trả
  `{"error":"INSUFFICIENT_INFORMATION"}` → UI hiện "Không thể xử lý yêu cầu AI."

## 2. Ràng buộc (từ yêu cầu)

1. Chỉ dùng số liệu mà **schema thật** có; không bịa field.
2. Mọi con số được **mã tính toán**, LLM **không được sinh số liệu**.
3. LLM chỉ phân tích bằng chứng được cấp; nếu thiếu → báo thiếu, không bịa.
4. Xử lý thân thiện: thiếu kỳ, 0 case, thiếu thông tin, lỗi MaaS — không lộ mã lỗi thô.
5. Có test hồi quy: analytical AI, chống hallucination, không-dữ-liệu, và truy vấn tất định.

## 3. Năng lực schema thực tế (đã kiểm chứng mã)

Nguồn: `src/services/assetService.js`, `src/data/valuationRisks.js`, `src/services/performance60000SnapshotTest.js`.

### Field có sẵn (master + snapshot, sau khi dựng kỳ)
`getAssetsByReportingPeriod(kyBaoCao)` trả record canonical gồm:

| Nhóm | Field |
|---|---|
| Master tài sản | `recordId, maTsDg, tenTaiSan, nhomTsCap1, loaiTsCap2, moTaTs, tinhTp, quanHuyenCu, xaPhuongCu, xaPhuongMoi, diaChiChiTiet, latitude, longitude, doChinhXacViTri` |
| Định giá (snapshot kỳ) | `gtDinhGia, ngayDinhGia, donViDinhGia` |
| TSBĐ (snapshot kỳ) | `maTsbd, gtBaoDam, duNoTsbd, ltv (=gtBaoDam/gtDinhGia), thanhKhoan, trangThaiTsbd, donViQuanLy, isActiveCollateral` |
| Rủi ro (kỳ) | `risks[] [{loaiRuiRo, ghiChu, trangThaiXuLy, maRuiRo}], coRuiRoDinhGia` |
| Khách hàng (kỳ) | `cifs[], customers[]` |

Enum rủi ro trong dữ liệu: `Định giá cao`, `Sai phương pháp`, `Sai thông tin tài sản` (planner còn hỗ trợ `Sai vị trí` — chưa có trong dữ liệu mẫu). Trạng thái xử lý risk: `Mới phát hiện`, `Đang xử lý`, `Đã đóng`.

Kỳ báo cáo = union `kyBaoCao` của snapshots + risks (mẫu: `2026-06-30`, `07-31`, `08-31`; 34 tỉnh).

### KHÔNG có sẵn (bắt buộc tính mới)
- **Time-series/delta**: không có field nào lưu biến động giữa kỳ. → Tính bằng cách join record cùng `maTsDg` ở hai kỳ liên tiếp (map lookup O(1), đã có index tương tự).
- **Mức độ tập trung / tỷ trọng**: không có field. → Tính từ GROUP_BY count hiện có (`COUNT`/`RISK_CASE_COUNT`) + tỷ trọng %.
- **Rủi ro mới phát sinh / đã đóng**: tính bằng so khớp `risks[]` theo `kyBaoCao` (risk ở T mà không ở T-1 = phát sinh; ngược lại = đã đóng/hết hạn — kèm `trangThaiXuLy`).

Proxy cá nhân hóa: nếu `cifs[]` có dữ liệu thì có thể nhóm rủi ro theo khách hàng (tuỳ chọn mở rộng, ngoài scope).

## 4. RiskContext đề xuất (cấu trúc)

Module mới `src/AI/v2/riskContextEngine.js` — chỉ xuất `buildRiskContext(question, dataset, planningContext)`:

```
RiskContext = {
  engine: 'RISK_CONTEXT',
  version: '2.7',
  question: string,
  scope: {
    period: '2026-08-31',            // mặc định planningContext.defaultPeriod
    periodLabel: 'tháng 8/2026',
    priorPeriod: '2026-07-31',       // kỳ liền trước để tính delta
    province: string|null,           // từ câu hỏi (Hà Nội / TP. Hồ Chí Minh)
    riskType: string|null,           // từ câu hỏi (enum rủi ro)
    assetGroup: string|null,         // BĐS / Động sản
  },

  snapshot: {                        // đếm trên đúng kỳ
    totalAssets: 20000,
    riskAssets: 804,                 // assets có coRuiRoDinhGia
    riskCases: 804,                  // tổng risk record (sẽ > riskAssets nếu 1 TS nhiều risk)
    riskRatePct: 4.0,
    cycleCompl: 0,                   // riskAssets với trangThaiXuLy='Đã đóng' (0 trong mẫu kỳ 08)
  },

  byRiskType: [                      // { key, cases, assets, sharePct } (giảm dần)
    { key: 'Định giá cao', cases: 268, sharePct: 33.3 },
    ...
  ],
  byProvince: [                      // { key, cases, assets, sharePct } (giảm dần)
    { key: 'Hà Nội', cases: 51, sharePct: 6.3 },
    ...
  ],

  concentration: {                   // tính tất định từ byProvince
    topProvince: 'Hà Nội', topProvinceCases: 51,
    topProvinceSharePct: 6.3,
    payoffTop3SharePct: 18.4,        // top 3 tỉnh / tổng — báo hiệu tập trung
    giniLikeIndex: null,             // tuỳ chọn, không bắt buộc ở bản đầu
  },

  valuation: {                       // trên tài sản rủi ro của kỳ (nếu riskAssets>0)
    totalValuation: 8_640_000_000_000, // tỷ theo formatMoney
    avgValuation: 10_746_000_000,
    totalDebt: 7_120_000_000_000,      // chỉ active collateral
    avgLTV: 0.62,
    valuationDeltaPct: 1.24,           // so kỳ trước (tài sản rủi ro chung)
    riskDeltaMoM: 12,                  // riskCases(kỳ) − riskCases(kỳ trước) (+ tăng/− giảm)
    emergingRiskAssets: 37,            // tài sản có risk ở T, không có ở T−1
    closedRiskAssets: 9,               // tài sản có risk ở T−1, không còn ở T
  },

  riskCases: [                      // mẫu case cụ thể đáng chú ý (tối đa 5)
    { maTsDg: 'DG000042', tenTaiSan: 'Ô tô TP. Hồ Chí Minh 000042', riskType: 'Sai phương pháp',
      valuation: 8_100_000_000, ltv: 0.58, province: 'TP. Hồ Chí Minh', status: 'Mới phát hiện' },
  ],
}
```

Quy tắc nguồn số liệu:
- `snapshot`, `byRiskType`, `byProvince`, `concentration`, `valuation` → từ `getAssetsByReportingPeriod` + đếm/tổ hợp trực tiếp (không qua LLM).
- Xu hướng MoM → `getAssetsByReportingPeriod(priorPeriod)` rồi so khớp theo `maTsDg`.
- Risk mới/đã đóng → so `risks[]` hai kỳ theo `maTsDg` (risk ở T−1 nhưng hết ở T = closed; `trangThaiXuLy='Đã đóng'` xác nhận).
- Nếu không có kỳ trong câu hỏi và không có `defaultPeriod` → lấy kỳ mới nhất (`getReportingPeriods(...).slice().sort().pop()`).

## 5. Luồng xử lý analytical

```
Câu hỏi analytical
   │
   ▼
createQueryPlanFromGreenNode()
   ├─ riskIntentPlanner → null (guard v2.6.6 giữ nguyên)
   ├─ tryCreateFastQueryPlan → null khi isAnalyticalQuestion  [GIỮ NGUYÊN]
   └─ ✏️ MỚI: tryCreateRiskContext(question, dataset, planningContext)
         = buildRiskContext(...)
         │
         ├─ Nếu lỗi/không xác định được kỳ  → trả { engine:'RISK_CONTEXT', status:'NO_SCOPE' }
         │
         └─ Nếu OK → trả { engine:'RISK_CONTEXT', status:'OK', riskContext }

App.jsx nhận kết quả
   ├─ nếu engine==='RISK_CONTEXT' → formatRiskAnalysis(riskContext)   [tường thuật tất định]
   │     ├─ riskCases>0   → narrative tất định (mọi số do mã tính)
   │     ├─ riskCases==0  → "Không phát hiện rủi ro trong kỳ…"
   │     └─ status='NO_SCOPE' → "Chưa xác định được kỳ báo cáo. Vui lòng nêu rõ tháng/kỳ."
   │
   └─ (bổ trợ, không chặn) call POST /api/ai/risk-analysis { question, evidence: riskContext }
        ├─ thành công → ghép { analysis, priorities[], riskSeverity } (sau khi guard số)
        └─ thất bại / INSUFFICIENT_INFORMATION / timeout / 4xx-5xx
             → giữ nguyên narrative tất định + dòng "Chưa thể bổ sung phân tích AI."
```

Nguyên tắc: **narrative tất định là nguồn chân lý cuối cùng**; câu trả lời KHÔNG BAO GIỜ dựa vào LLM cho số liệu.

## 6. Routing thay đổi so với V2.6.6 (quyết định thiết kế)

| Câu | V2.6.6 | V2.6.7 |
|---|---|---|
| Có hint analytical (bất kỳ) | LLM fallback `/api/ai/query-plan` (thường trả INSUFFICIENT_INFORMATION) | **`RISK_CONTEXT` tất định** + tuỳ chọn enrichment `/api/ai/risk-analysis` |
| Không hint, có kỳ: count/rank/location/tie/filter/search/metric | deterministic (0 fetch) | **không đổi** |
| Near-miss (`tổng số`, `đề nghị`, `phân bố`, `xét duyệt`, `nhận bảo đảm`) | deterministic | **không đổi** |

Hệ quả: **`v266AnalyticalFallbackTest` (B01, B02) và `v266AdversarialRoutingTest` (các case `LLM`) phải cập nhật kỳ vọng** từ `LLM → RISK_CONTEXT`. A-series (planner trả null) và C/J-series deterministic giữ nguyên. Đây là thay đổi có chủ đích, cần ghi rõ trong CHANGELOG.

## 7. Server: `POST /api/ai/risk-analysis`

- Mới nằm cạnh `/api/ai/query-plan` trong `server/server.js`, dùng chung helper MaaS + mã lỗi hiện có.
- Body: `{ question, evidence: RiskContext }` (evidence do FE chứng thực từ engine — server không cần dataset).
- Prompt: "Dựa DUY NHẤT vào khối bằng chứng JSON. Không thêm, không suy con số nào. Nêu mức độ rủi ro, điểm tập trung, rủi ro mới phát sinh, và tối đa 3 hành động ưu tiên tham chiếu bằng chứng." → chế độ JSON schema, nhiệt độ thấp.
- Response hợp lệ: `{ success, riskSeverity: 'LOW'|'MEDIUM'|'HIGH', analysis: string, priorities: string[] }`.
- Guard chống hallucination phía server:
  1. JSON hợp lệ theo schema.
  2. **Sanitizer số**: mọi token số trong `analysis`/`priorities` phải khớp giá trị trong `evidence` (dạng raw, tỷ, %). Khớp bằng khai thác danh sách `allowedNumbers` từ `evidence`. Token số lạ → gỡ câu chứa nó hoặc thay bằng dấu tham chiếu, đánh dấu `sanitized: true`.
  3. Không chứa số → chấp nhận (văn bản định tính).
- Failure matrix (giữ nguyên hệ mã, không lộ ra UI):
  - MaaS 4xx/5xx → `GREENNODE_API_ERROR`
  - timeout → `GREENNODE_TIMEOUT`
  - JSON không parse / không có `analysis` → `INVALID_MODEL_JSON`
  - model trả `INSUFFICIENT_INFORMATION` → trả nguyên mã (FE hiển thị bản deterministc, không lộ lỗi)
- FE không chặn: enrichment thất bại vẫn có câu trả lời (narrative tất định).

## 8. Ví dụ phản hồi (số liệu minh hoạ, mẫu 60k canonical)

### Câu: "Tổng quan tình hình rủi ro tài sản tháng 8/2026"

Narrative tất định (formatRiskAnalysis, tự sinh):
> "Trong tháng 8/2026 có 20.000 tài sản, trong đó 804 tài sản phát sinh rủi ro định giá (4,0% tổng danh mục) với 804 case. Rủi ro tập trung nhiều nhất theo loại là Định giá cao (268 case, 33,3%) và theo địa bàn là Hà Nội (51 case, 6,3%); 3 tỉnh đầu chiếm 18,4% tổng case. Giá trị định giá của các tài sản rủi ro đạt 8.640 tỷ, bình quân 10,75 tỷ/tài sản; dư nợ TSBĐ 7.120 tỷ, LTV bình quân 62,0%. So với tháng 7/2026, số case tăng thêm 12; có 37 tài sản phát sinh rủi ro mới và 9 tài sản đã hết rủi ro."

Enrichment (nếu thành công, ghép dưới):
> "Mức độ rủi ro: MEDIUM. Điểm cần lưu ý: nhóm Định giá cao chiếm 1/3 case và có 37 tài sản mới phát sinh trong tháng. Ưu tiên kiểm tra: 1) rà soát 5 tài sản mới phát sinh rủi ro thuộc Định giá cao; 2) kiểm tra địa bàn Hà Nội — nhóm tập trung nhất; 3) đối chiếu LTV ≥ 70% trong nhóm rủi ro."

Thất bại enrichment → vẫn trả narrative + "Chưa thể bổ sung phân tích AI."

### Câu: "Phân tích 10 tài sản rủi ro cần xử lý"
→ narrative liệt kê `riskCases` top 5 kèm mã, tên, loại rủi ro, giá trị; bổ sung "còn 5 tài sản nữa (xem bảng dưới)."

### Zero case: "Phân tích rủi ro ô tô tháng 8/2026" (nhóm có 0 risk)
→ "Không phát hiện rủi ro định giá đối với nhóm Ô tô trong tháng 8/2026." (không gọi enrichment)

### Thiếu kỳ & không default: 
→ "Chưa xác định được kỳ báo cáo. Vui lòng nêu rõ tháng/kỳ (ví dụ: tháng 8/2026)."

## 9. Danh sách file thay đổi

**Mới**
- `src/AI/v2/riskContextEngine.js` — `buildRiskContext()` (tất định, không phụ thuộc LLM).
- `src/AI/v2/riskAnalysisFormatter.js` — `formatRiskAnalysis(context)` (narrative tất định) + `sanitizeEnrichment(enrichment, context)`.
- `src/AI/v2/v267RiskAnalysisTest.js` — test hồi quy V2.6.7.

**Sửa**
- `src/AI/v2/riskIntentPlanner.js` — export các bộ trích xuất (`extractPeriods`, `extractProvince`, `detectRiskType`, `detectAssetGroupFilter`, `detectAssetType`, `normalize`) để engine tái sử dụng; KHÔNG đổi guard `isAnalyticalQuestion`.
- `src/AI/v2/greennodeAdapter.js` — nhánh analytical: gọi `tryCreateRiskContext` trước `createQueryPlanFromModel`; trả `{engine:'RISK_CONTEXT',...}`.
- `src/App.jsx` — nhánh nhận kết quả engine RISK_CONTEXT (~line 973–1161), gọi enrichment, render, map lỗi (không lộ mã thô).
- `server/server.js` — route mới `/api/ai/risk-analysis`.
- `package.json` — version `2.6.7`, scripts `test:risk` + thêm vào chuỗi `test:production` (sau `test:analytical`).
- `src/AI/v2/v266AnalyticalFallbackTest.js`, `src/AI/v2/v266AdversarialRoutingTest.js` — cập nhật kỳ vọng routing (xem §6).

**Không đổi (quan trọng)**: `queryPlanContract.js`, `queryPlanValidator.js`, `queryPlanExecutor.js`, `queryValueResolver.js`, `queryAnswerFormatter.js` — engine mới là kênh song song, không đụng contract.

## 10. Test hồi quy V2.6.7 (`v267RiskAnalysisTest.js`)

1. **Analytical routing**: mọi hint → trả `engine==='RISK_CONTEXT'`, 0 fetch tới `/api/ai/query-plan`.
2. **Tính đúng**: với dataset numpy nhỏ (tự dựng 10–20 record, 2 kỳ), assert từng số trong `RiskContext` khớp giá trị tính tay (riskAssets, riskCases, byRiskType, topProvince+share, valuationDeltaPct, emerging/closed).
3. **Không-data**: dataset không có risk → `riskCases===0` và formatter trả chuỗi "Không phát hiện…".
4. **Chống hallucination**: `sanitizeEnrichment` với text có số lạ → số bị gỡ/thay, `sanitized:true`; có số khớp evidence → giữ nguyên.
5. **Tất định giữ nguyên**: chạy lại 8 case trong `performance60000SnapshotTest` (count/rank/location/tie/filter/search/metric/compare) → vẫn deterministic, cùng intent, 0 fetch, <500 ms.
6. **Performance**: `buildRiskContext` trên canonical 60k (3 kỳ) → toàn bộ < 500 ms.
7. **Enrichment failure**: stub fetch trả 500 / `INSUFFICIENT_INFORMATION` → UI/format không ném lỗi, trả narrative.
8. **v266 cũ** sau khi cập nhật → toàn bộ xanh.

## 11. Rủi ro triển khai & giảm thiểu

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| LLM bịa số dù có evidence | Hallucination trong phần AI | Guard sanitize số server (chỉ giữ số xuất hiện trong evidence), narrative tất định là nguồn chính, FE render AI dưới dạng phụ lục |
| Model trả `INSUFFICIENT_INFORMATION` (tái hiện lỗi V2.6.6) | Mất phần insight | Prompt evidence-only + retry tối đa 1 lần; fail → vẫn có narrative tất định; không còn là đường trả lời duy nhất |
| Timeout MaaS (30s) | Chậm/không có insight | Enrichment không chặn (async sau khi render narrative), timeout context 25s |
| Truy vấn có hint nhưng thật sự là count/rank lẫn lộn ("tổng quan có bao nhiêu") | Chuyển sang analytical mất tính tất định cũ | Giữ hint-đường-analytical theo thiết kế V2.6.6 (hint thắng); narrative luôn cung cấp con số chính xác từ engine; kiểm tra bổ sung trong adversarial test |
| Câu analytical không có kỳ | Không xác định scope | fallback defaultPeriod → kỳ mới nhất; nếu dataset rỗng → message thân thiện |
| Chi phí 60k cho cross-period join | Perf | Map lookup theo `maTsDg`; benchmark trong test; guard <500ms |
| Excel thật: field nguồn không có `ltv`/delta | Lệch số | Engine chỉ dùng field canonical từ `getAssetsByReportingPeriod`; ltv tự tính; không phụ thuộc cột lạ |
| Thay đổi routing làm hỏng v266 tests | CI đỏ | Cập nhật kỳ vọng có chủ đích (§6), ghi CHANGELOG |

## 12. Khuyến nghị versioning

**Đề xuất: 1 bản `V2.6.7`, triển khai 2 commit riêng biệt (deploy 1 lần):**
- Commit 1 — engine + formatter + routing + UI (deterministic hoàn chỉnh, chưa có enrichment).
- Commit 2 — route `/api/ai/risk-analysis` + guard + UI enrichment.

Lý do chọn một bản thay vì tách tiếp:
- Tầng risk context có tính **cộng dồn** (additive): kênh mới song song, contract cũ không đổi → rủi ro ít.
- Deploy 2 lần liên tiếp (V2.6.7 rồi V2.6.8) làm tăng chu kỳ image/build/state + thời gian chờ xác nhận trên môi trường thật mà không có lợi về mặt rủi ro đáng kể.
- Tách chỉ nên xét nếu quyết tâm **không đưa LLM vào** nửa đầu (chỉ deterministic). Nếu vậy vẫn chạy được trong 1 bản nhờ cờ `ENABLE_RISK_ENRICHMENT` (mặc định tắt ở commit 1, bật ở commit 2) — deploy 1 lần, giữ khả năng tắt ngay.

Bản không nên tăng số minor nữa nếu có nhu cầu mở rộng phân tích (nhóm theo khách hàng, Gini, next-period) → cân nhắc 2.7.0 riêng.

## 13. Ngoài phạm vi (Out of scope)

- Dự báo/next-period prediction.
- Group theo khách hàng (`cifs`) chi tiết.
- Chỉ số GoE (Gini), chỉ số nồng độ nâng cao khác.
- UI bảng/heatmap mới (chỉ kết xuất text từ narrative, tận dụng bảng kết quả hiện có).
- Dataset mới/field mới (không duyệt schema hiện có).