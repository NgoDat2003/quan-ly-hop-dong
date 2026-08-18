# SRS — Hệ thống Quản lý Hợp đồng Thuê Mặt bằng

**Phiên bản**: 2.0
**Ngày**: 2026-08-11
**Phạm vi tài liệu**: Thuần nghiệp vụ (functional requirements). Không đề cập database, API, kiến trúc hệ thống, hay yêu cầu phi chức năng.

---

## 1. Giới thiệu

### 1.1 Mục đích

Tài liệu này mô tả yêu cầu nghiệp vụ cho hệ thống quản lý hợp đồng thuê mặt bằng của công ty — số hóa quy trình hiện đang thực hiện thủ công qua Excel/email/ổ chia sẻ, quản lý hồ sơ mặt bằng và hợp đồng thuê, theo dõi thời hạn và cảnh báo hết hạn.

### 1.2 Phạm vi

Hệ thống bao phủ 7 nhóm nghiệp vụ chính: Quản lý Mặt bằng, Quản lý Hợp đồng, Theo dõi Thanh toán, Cảnh báo Hết hạn Hợp đồng, Thống kê/Báo cáo, Quản lý Người dùng & Phân quyền, và Xuất Báo cáo Excel theo template. Ngoài ra hệ thống lưu lại lịch sử chỉnh sửa (Version History) cho mọi thay đổi trên hồ sơ Mặt bằng và Hợp đồng.

Hệ thống hỗ trợ xuất dữ liệu Hợp đồng ra file Excel theo template do công ty cung cấp, để Kế toán tiếp tục dùng cho các bước xử lý tiếp theo.

**Ngoài phạm vi của giai đoạn này**: việc upload file Excel đã xuất lên SAP, và quy trình thanh toán (payment) trong SAP — 2 việc này tiếp tục thực hiện thủ công như hiện tại, không thuộc phạm vi hệ thống.

### 1.3 Định nghĩa thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| Mặt bằng (Property) | Hồ sơ địa điểm thuê — thông tin vật lý/pháp lý của 1 địa điểm |
| Hợp đồng (Contract) | Văn bản pháp lý + tài chính gắn với 1 Mặt bằng, có thời hạn |

---

## 2. Mô tả tổng quan

### 2.1 Bối cảnh sản phẩm

Công ty vận hành mô hình thuê mặt bằng cho hoạt động kinh doanh: bộ phận Site khảo sát, đàm phán, ký hợp đồng thuê với chủ nhà ngoài thực địa; sau đó hồ sơ được nhập vào hệ thống để Kế toán quản lý tiếp — theo dõi hợp đồng, thời hạn, thông tin tài chính. Legal tham gia với vai trò giám sát, xem thông tin để phục vụ tra cứu/kiểm tra khi cần.

### 2.2 Quy trình hiện tại (tham khảo)

Sơ đồ dưới đây mô tả quy trình thủ công hiện tại (Excel/email/ổ chia sẻ), làm căn cứ đối chiếu khi số hóa sang hệ thống mới.

![Quy trình quản lý hợp đồng hiện tại](./quy-trinh-hop-dong-hien-tai.jpg)

### 2.3 Vai trò người dùng (Actors)

| Actor | Mô tả | Trách nhiệm chính |
|---|---|---|
| **Admin** | Quản trị hệ thống | Toàn quyền xem/tạo/sửa/xóa; quản lý tài khoản và phân quyền cho các actor khác |
| **Site** | Nhân sự phát triển mặt bằng | Khảo sát, đàm phán, ký hợp đồng thuê với chủ nhà (ngoài hệ thống); có thể khởi tạo hồ sơ Mặt bằng trong hệ thống |
| **Kế toán** | Bộ phận kế toán | Quản lý hồ sơ Mặt bằng và Hợp đồng — có thể là người khởi tạo hồ sơ Mặt bằng thay cho Site |
| **Legal** | Bộ phận pháp lý | Xem hồ sơ Mặt bằng và Hợp đồng để tra cứu/kiểm tra; cấu hình mức cảnh báo hết hạn cho từng Hợp đồng; nhận cảnh báo hết hạn hợp đồng |

---

## 3. Yêu cầu chức năng (Functional Requirements)

### 3.1 Nhóm FR-1 — Quản lý Mặt bằng

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-1.1 | Site hoặc Kế toán tạo hồ sơ Mặt bằng mới: upload file hợp đồng gốc (PDF) đã ký với chủ nhà, hệ thống đọc và điền sẵn các trường thông tin (xem mục 4.1) từ file PDF, người tạo cập nhật/review lại thông tin cho chính xác | Site, Kế toán |
| FR-1.2 | Sau khi tạo, Site không có quyền sửa lại hồ sơ Mặt bằng đó | Hệ thống |
| FR-1.3 | Kế toán xem toàn bộ hồ sơ Mặt bằng; sửa lại thông tin hồ sơ do Site đã tạo, hoặc tạo hồ sơ Mặt bằng mới khi cần | Kế toán |
| FR-1.4 | Legal xem toàn bộ hồ sơ Mặt bằng | Legal |
| FR-1.5 | Admin xem/sửa/xóa mọi hồ sơ Mặt bằng | Admin |

**Business rule BR-1**: Tạo hồ sơ Mặt bằng không bắt buộc phải do Site thực hiện — Kế toán cũng có quyền tạo mới từ đầu, không chỉ sửa hồ sơ Site đã tạo. Sau khi tạo, Site không còn quyền sửa hồ sơ đó — mọi chỉnh sửa tiếp theo thuộc về Kế toán (hoặc Admin). Legal chỉ xem, không thao tác trên Mặt bằng.

### 3.2 Nhóm FR-2 — Quản lý Hợp đồng

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-2.1 | Kế toán tạo Hợp đồng mới, gắn với 1 hồ sơ Mặt bằng. Nhập các trường: mã hợp đồng, ngày bắt đầu/kết thúc hợp đồng, ngày bắt đầu tính tiền thuê, bảng giai đoạn điều chỉnh giá (xem FR-4 về cấu hình mức cảnh báo hết hạn) | Kế toán |
| FR-2.2 | Mỗi giai đoạn điều chỉnh giá gồm ngày bắt đầu, ngày kết thúc, và giá thuê/tháng — do người dùng **nhập tay trực tiếp** — hệ thống không tự động tính theo công thức phần trăm tăng giá | Kế toán |
| FR-2.3 | Kế toán sửa hoặc tạo mới Hợp đồng khi cần | Kế toán |
| FR-2.4 | Legal xem danh sách và chi tiết các Hợp đồng | Legal |
| FR-2.5 | Admin xem/sửa/xóa mọi Hợp đồng | Admin |

**Business rule BR-2**: Kế toán là bên thực hiện toàn bộ nghiệp vụ Hợp đồng (tạo, sửa, theo dõi). Legal chỉ xem, không thao tác.

### 3.3 Nhóm FR-3 — Theo dõi Thanh toán

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-3.1 | Kế toán theo dõi tiến độ các đợt thanh toán thực tế của từng Hợp đồng | Kế toán |
| FR-3.2 | Kế toán xuất báo cáo | Kế toán |

### 3.4 Nhóm FR-4 — Cảnh báo Hết hạn Hợp đồng

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-4.1 | Legal cấu hình 3 mức cảnh báo cho từng Hợp đồng — nhập số ngày còn lại cho mỗi mức: **Xanh**, **Vàng**, **Đỏ** (số ngày do Legal tự quyết định cho từng hợp đồng cụ thể, không cố định 6/3/1 tháng) | Legal |
| FR-4.2 | Hệ thống tự động hiển thị mã màu trên danh sách Hợp đồng và gửi cảnh báo khi số ngày còn lại tới hạn chạm 1 trong 3 mức đã cấu hình | Hệ thống |
| FR-4.3 | Cảnh báo hết hạn chỉ gửi tới Legal. Kế toán không nhận cảnh báo hết hạn | Hệ thống |

**Business rule BR-4**: Cấu hình mức cảnh báo (FR-4.1) là ngoại lệ duy nhất cho phép Legal thao tác trên Hợp đồng — ngoài việc này, Legal vẫn chỉ có quyền xem (xem BR-2).

### 3.5 Nhóm FR-5 — Thống kê / Báo cáo

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-5.1 | Hệ thống cung cấp báo cáo thống kê tổng hợp phục vụ quản lý | Admin |

### 3.6 Nhóm FR-6 — Quản lý Người dùng & Phân quyền

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-6.1 | Admin tạo, sửa, xóa tài khoản người dùng | Admin |
| FR-6.2 | Admin gán vai trò/quyền cho từng tài khoản | Admin |

### 3.7 Nhóm FR-7 — Lịch sử Chỉnh sửa (Version History)

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-7.1 | Hệ thống tự động ghi lại lịch sử mỗi lần chỉnh sửa hồ sơ Mặt bằng hoặc Hợp đồng: người sửa, thời điểm sửa, và giá trị từng trường trước/sau khi sửa | Hệ thống |
| FR-7.2 | Người dùng có quyền xem hồ sơ Mặt bằng/Hợp đồng thì cũng xem được lịch sử chỉnh sửa của hồ sơ đó | Hệ thống |

**Business rule BR-3**: Lịch sử chỉnh sửa là log tự động, không phải hành động người dùng chủ động tạo ra — mọi lần tạo/sửa hồ sơ Mặt bằng hoặc Hợp đồng đều tự động sinh 1 bản ghi lịch sử tương ứng.

### 3.8 Nhóm FR-8 — Xuất Báo cáo Excel

| ID | Yêu cầu | Actor |
|---|---|---|
| FR-8.1 | Kế toán xuất dữ liệu Hợp đồng ra file Excel, theo đúng template do công ty cung cấp sẵn | Kế toán |
| FR-8.2 | File Excel xuất ra dùng để Kế toán tiếp tục xử lý thủ công (upload lên SAP, phục vụ quy trình payment) — 2 việc này nằm ngoài phạm vi hệ thống | Kế toán |

**Business rule BR-5**: Hệ thống chỉ chịu trách nhiệm tạo ra file Excel đúng định dạng template. Việc sử dụng file đó (upload SAP, payment) là quy trình thủ công tiếp theo, không do hệ thống thực hiện.

---

## 4. Đặc tả dữ liệu nghiệp vụ (Field-level)

> **Lưu ý phạm vi mục này**: các bảng trường dưới đây là danh sách field tối thiểu đã xác nhận, chưa phải đặc tả đầy đủ. Cần bổ sung thêm tài liệu chi tiết (rà soát thêm với các bên liên quan) để hoàn thiện toàn bộ trường dữ liệu trước khi chốt thiết kế kỹ thuật. Riêng cấu trúc cột của template Excel xuất báo cáo (FR-8.1) cần công ty cung cấp mẫu thật để đối chiếu trước khi hoàn thiện thiết kế.

### 4.1 Mặt bằng (Property)

| Trường | Mô tả |
|---|---|
| Mã hợp đồng | Định danh liên kết với hợp đồng thuê gốc |
| Tên bên thuê | Tên người/đơn vị đứng tên thuê |
| Địa chỉ chi tiết | Số nhà, tên đường của địa điểm thuê |
| Quận/Huyện | Quận/huyện của địa điểm thuê |
| Thành phố/Tỉnh | Thành phố/tỉnh của địa điểm thuê |
| Diện tích | Diện tích mặt bằng thuê |
| Chủ cho thuê | Tên/thông tin liên hệ của chủ nhà |
| Thông tin liên hệ | Thông tin liên hệ liên quan tới mặt bằng (chủ nhà hoặc bên liên quan khác) |
| File hợp đồng gốc | PDF hợp đồng đã ký, có con dấu |

### 4.2 Hợp đồng (Contract)

| Trường | Mô tả |
|---|---|
| Mã hợp đồng | Định danh hợp đồng |
| Ngày bắt đầu hợp đồng | Ngày hiệu lực hợp đồng thuê |
| Ngày kết thúc hợp đồng | Ngày hết hạn thời hạn hợp đồng |
| Ngày bắt đầu tính tiền thuê | Mốc ngày hệ thống bắt đầu tính tiền thuê — có thể khác ngày bắt đầu hợp đồng (ví dụ có giai đoạn miễn phí đầu kỳ) |
| Nghĩa vụ kê khai/nộp thuế | Ghi nhận bên chịu trách nhiệm kê khai/nộp thuế cho hợp đồng thuê |
| Bảng giai đoạn điều chỉnh giá | Danh sách các giai đoạn giá thuê, mỗi giai đoạn gồm: ngày bắt đầu, ngày kết thúc, giá thuê/tháng — nhập tay |
| Số ngày cảnh báo mức Xanh | Số ngày còn lại tới hạn để hệ thống đánh dấu mức Xanh — do Legal nhập |
| Số ngày cảnh báo mức Vàng | Số ngày còn lại tới hạn để hệ thống đánh dấu mức Vàng — do Legal nhập |
| Số ngày cảnh báo mức Đỏ | Số ngày còn lại tới hạn để hệ thống đánh dấu mức Đỏ — do Legal nhập |
| Mặt bằng liên kết | Tham chiếu tới 1 hồ sơ Mặt bằng |

---

*Tài liệu này mô tả nghiệp vụ đã thống nhất cho giai đoạn hiện tại. Các nghiệp vụ ngoài phạm vi (upload file lên SAP, quy trình thanh toán trong SAP) sẽ được đặc tả riêng khi triển khai giai đoạn kế tiếp.*
