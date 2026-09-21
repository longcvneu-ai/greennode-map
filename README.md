# GreenNode Map

GreenNode Map là giải pháp quản lý và phân tích **tài sản đảm bảo / TSBĐ (digital collateral) trực quan trên bản đồ**, kết hợp bảng điều khiển KPI, nhập liệu từ Excel và truy vấn bằng ngôn ngữ tự nhiên sử dụng AI của GreenNode AI Platform.

## 1. Giới thiệu

### Vấn đề

- Dữ liệu tài sản đảm bảo lớn và phân tán ở nhiều hệ thống, nhiều định dạng.
- Quản lý theo bảng (tabular) truyền thống khiến việc quan sát **phân bố địa lý, mức độ tập trung và rủi ro** trở nên khó khăn.
- Người dùng cần truy vấn, phân tích nhanh mà không phải xử lý thủ công các bộ dữ liệu Excel lớn.

### Giải pháp

- Bản đồ tài sản số tương tác (interactive digital asset map).
- Nhập dữ liệu từ Excel.
- Bảng điều khiển KPI / dashboard.
- Lọc trên bản đồ và xem chi tiết tài sản.
- Trực quan hóa rủi ro.
- Truy vấn AI bằng ngôn ngữ tự nhiên sử dụng GreenNode AI.
- Giao diện responsive cho desktop và mobile.

## 2. Chức năng chính

- **Bản đồ tài sản số**: hiển thị tài sản đảm bảo trên bản đồ tương tác (Leaflet).
- **Gộp marker (clustering)**: nhóm các tài sản gần nhau ở mức zoom thấp để map hoạt động mượt với dữ liệu lớn.
- **Nhiều tài sản tại cùng tọa độ**: gộp và hiển thị truy cập rõ ràng cho các tài sản trùng vị trí địa lý.
- **Bộ lọc**: lọc theo nhóm tài sản, tỉnh/thành, đơn vị định giá, mức độ rủi ro…
- **KPI**: các chỉ số tổng quan như dư nợ, giá trị đảm bảo, LTV…
- **Nhập Excel**: import dữ liệu tài sản từ file Excel để phân tích.
- **Chi tiết tài sản**: hồ sơ từng tài sản tại một tọa độ.
- **Nhận diện / hiển thị rủi ro**: phân tích và trực quan hóa nhóm rủi ro định giá.
- **AI Query**: hỏi đáp và phân tích bằng ngôn ngữ tự nhiên.
- **Responsive**: giao diện thích nghi desktop và mobile.

## 3. Kiến trúc tổng quan

| Tầng | Công nghệ |
|------|-----------|
| Frontend | React, Vite, Leaflet / React Leaflet |
| Backend | Node.js, Express |
| AI | Tích hợp API GreenNode AI (OpenAI-compatible) |
| Dữ liệu | Dữ liệu mô phỏng (mock) và nhập liệu từ Excel |
| Triển khai | Docker / GreenNode AgentBase |

## 4. Yêu cầu môi trường

- **Node.js**: bản mới nhất (khuyến nghị ≥ 20, theo yêu cầu của Vite 8 được dùng trong dự án).
- **npm**: đi kèm Node.js.
- **Trình duyệt hiện đại**: Chrome, Edge, Firefox.

## 5. Cài đặt

```bash
git clone https://github.com/longcvneu-ai/greennode-map.git
cd greennode-map
npm install
```

## 6. Cấu hình môi trường

Ứng dụng đọc cấu hình từ **biến môi trường**. Các biến được sử dụng (chỉ nêu tên — **không bao gồm giá trị thật**):

```
PORT
HOST
GREENNODE_API_KEY
GREENNODE_BASE_URL
GREENNODE_MODEL
GREENNODE_TIMEOUT_MS
```

Ví dụ file `.env` (chỉ dùng giá trị giả định / placeholder):

```env
GREENNODE_API_KEY=<your_api_key>
GREENNODE_BASE_URL=<your_base_url>
GREENNODE_MODEL=z-ai/glm-5.2-hackathon
GREENNODE_TIMEOUT_MS=60000
PORT=8080
HOST=0.0.0.0
```

> ⚠️ **Bảo mật**: không được commit các giá trị thật (API key, secret, token) vào Git. Các file bí mật (`.env`, `.env.*`, `.greennode.json`, …) đã được loại trừ khỏi Git và Docker context.

## 7. Chạy local

**Chế độ development** — chạy song song 2 tiến trình (frontend Vite có proxy tới backend):

```bash
# Terminal 1 — backend API (cổng 8080)
npm start

# Terminal 2 — frontend dev server (Vite, proxy /api → 127.0.0.1:8080)
npm run dev
```

**Chế độ full-stack một tiến trình** — build frontend rồi chạy server (server tự phục vụ file build):

```bash
npm run build
npm start
# Mở http://localhost:8080
```

## 8. Build production

```bash
npm run build
```

Lệnh trên tạo thư mục `dist/` — bản build production của frontend, được phục vụ bởi `npm start` (Express).

## 9. Cấu trúc thư mục

```
greennode-map/
├── src/            # React frontend + logic nghiệp vụ, dịch vụ AI/phân tích
├── server/         # Backend Express (API AI, phục vụ static build)
├── public/         # Tài nguyên tĩnh (favicon, icons)
├── test-fixtures/  # Dữ liệu mẫu phục vụ kiểm thử
├── Dockerfile      # Đóng gói container
└── vite.config.js  # Cấu hình Vite
```

## 10. Kiểm thử

Các nhóm kiểm thử chính:

- **AI Query / phân tích**: kiểm thử kế hoạch truy vấn, routing theo ngữ cảnh rủi ro.
- **Risk**: phân tích định giá và rủi ro.
- **Map**: hiệu năng bản đồ với data lớn, xử lý tài sản trùng tọa độ.
- **KPI**: tính toán chỉ số tổng quan với dữ liệu Excel.
- **Excel**: kiểm thử import và regression với dữ liệu Excel thực.
- **UI regression**: luồng giao diện end-to-end.

Chạy toàn bộ regression:

```bash
npm run test:final-regression
```

## 11. Bảo mật

- Thông tin xác thực được truyền qua **biến môi trường**, không nhúng vào mã nguồn hoặc image.
- Các file chứa bí mật (`.env`, `.env.*`, `.greennode.json`, …) được loại trừ khỏi Git và Docker context.
- Không commit API key / token vào repository.
- Phần hiển thị bản đồ **không cố ý phơi bày** thông tin xác thực AI phía client.

## 12. Phiên bản

**GreenNode Map V2.6.10**

Điểm nổi bật của bản phát hành:

- Migrate AI runtime sang GLM 5.2 (`z-ai/glm-5.2-hackathon`).
- Không còn phơi bày output thô của model trong phản hồi lỗi API.