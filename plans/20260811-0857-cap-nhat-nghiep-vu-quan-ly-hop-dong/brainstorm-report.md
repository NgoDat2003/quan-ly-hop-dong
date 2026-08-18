# Brainstorm: Cập nhật nghiệp vụ Quản lý Hợp đồng (v2 — dựa trên flow "Current")

**Ngày**: 2026-08-11
**Trạng thái**: Nghiệp vụ v2 đã chốt với user qua ảnh flow "Current" — thay thế phần role/quyền trong SRS v1
**Input**: ảnh flowchart "Quản lý hợp đồng (Current)" mô tả quy trình thủ công hiện tại (Excel/email/ổ chung) + user diễn giải lại

**Quan hệ với tài liệu cũ**: [`../20260806-1425-contract-management-brainstorm/srs-nghiep-vu.md`](../20260806-1425-contract-management-brainstorm/srs-nghiep-vu.md) và `brainstorm-report.md` cùng thư mục là v1. Tài liệu này **thay thế phần vai trò/quyền/state machine** của v1, giữ nguyên các phần khác chưa bị user đổi ý (rent schedule nhập tay, cấu trúc field cơ bản).

---

## 1. Thay đổi lớn nhất: đảo vai trò so với v1

**Lưu ý tên gọi**: ảnh flow gốc dùng tên "Network (a.Cường)" nhưng đây chỉ là tên gọi khác của role **Site** đã có trong SRS v1 (cùng 1 người/vai trò, đi đàm phán/ký hợp đồng ngoài thực địa). Tài liệu này **giữ nguyên tên "Site"** theo yêu cầu, không đổi thành Network.

| | SRS v1 (nghe từ họp, suy luận) | v2 (chốt từ ảnh flow Current) |
|---|---|---|
| Người tạo Property | Site | **Site** (không đổi — chỉ là ảnh gọi "Network", cùng 1 role) |
| Người edit/tạo lại Property sau đó | Legal | **Kế toán** |
| Người tạo Contract | Legal | **Kế toán** |
| Quyền Legal | Duyệt, edit, tạo lại hồ sơ | **Chỉ View — không có nghiệp vụ tạo/sửa gì** |
| State machine Property | DRAFT → PENDING_REVIEW → APPROVED/REJECTED | **Không có state — chỉ có 1 hành động submit, xong là xong** |

**Lý do đảo vai trò**: user xác nhận trực tiếp qua ảnh — luồng thật là Site ký hợp đồng ngoài thực địa → nộp hồ sơ vào hệ thống (1 lần) → **Kế toán** là người xử lý tiếp toàn bộ nghiệp vụ giấy tờ (Scan & lưu hợp đồng, nhập Property/Contract, theo dõi thanh toán, xuất báo cáo) → Legal chỉ đứng ngoài xem để biết/kiểm tra, không có bước duyệt chính thức nào trong hệ thống.

## 2. Vai trò (Actors) — v2

| Vai trò | Quyền trên Property | Quyền trên Contract | Ghi chú |
|---|---|---|---|
| **Admin** | Full CRUD | Full CRUD | Không đổi so với v1 |
| **Site** | Tạo 1 lần duy nhất (upload PDF + field mặt bằng) | Không có nghiệp vụ | Đi đàm phán/ký hợp đồng ngoài thực địa (ngoài hệ thống), sau đó nhập hồ sơ vào hệ thống đúng 1 lần. (Ảnh flow gốc gọi role này là "Network" — cùng 1 vai trò, giữ tên "Site") |
| **Kế toán** | Edit hồ sơ Site đã nộp, hoặc tạo mới nếu cần — không giới hạn số lần | Tạo/edit toàn quyền | Vai trò nghiệp vụ chính — làm hầu hết mọi thứ sau khi Site nộp xong |
| **Legal** | Chỉ View | Chỉ View | Không có quyền tạo/sửa/xóa gì cả — xem để biết/kiểm tra |

**Điểm cần lưu ý khi map sang permission-based RBAC** (base template dùng `@RequirePermissions()`, không hardcode role — xem [CLAUDE.md](../../CLAUDE.md) phần Backend Patterns): 4 vai trò trên nên map thành permission cụ thể, ví dụ `property:create`, `property:update`, `contract:create`, `contract:update`, `property:view`, `contract:view` — Legal chỉ được gán 2 permission `*:view`.

## 3. Quy tắc nộp hồ sơ Property — ĐÃ ĐƠN GIẢN HÓA, bỏ state machine

**v1 có**: state machine DRAFT → PENDING_REVIEW → APPROVED/REJECTED, có khái niệm "khóa edit sau submit", có bước Legal duyệt.

**v2 (đã xác nhận trực tiếp)**: **Không có trạng thái/state machine nào cả.**

- Network nhập 1 form duy nhất (upload PDF hợp đồng + field mặt bằng) → bấm nộp → xong luôn. Không có bước lưu nháp giữa đường, không có 2 hành động tách biệt (save draft, rồi submit sau) — chỉ 1 hành động submit = tạo record.
- Sau khi Site nộp, **Kế toán có quyền edit lại record đó tự do, không giới hạn số lần**, hoặc tạo hồ sơ mới khác nếu cần (không cần "sai nhiều mới tạo lại" như v1 — không có ràng buộc gì đặc biệt, Kế toán chủ động quyết).
- Không có khái niệm khóa edit vĩnh viễn cho Site sau khi nộp theo nghĩa system-enforced lock — thực chất Site chỉ đơn giản KHÔNG CÓ quyền edit từ đầu sau khi tạo (permission-based, không phải state-based lock).

**Kết luận kỹ thuật**: Property không cần cột `status` hay state machine. Chỉ cần permission phân biệt: Site có `property:create` (không có `property:update`), Kế toán có cả `property:create` + `property:update`, Legal chỉ có `property:view`.

## 4. Contract (FR-2) — Kế toán làm toàn bộ

v1 suy luận Legal là người tạo Contract (dựa trên thứ tự Site → Legal → Kế toán trên note tay, đoán Legal đứng giữa nên tạo Contract trước khi bàn giao Kế toán). **v2 bác bỏ suy luận này** — user xác nhận trực tiếp theo ảnh flow Current: Kế toán là người thực hiện toàn bộ nghiệp vụ Contract (tạo, sửa, theo dõi), Legal không có vai trò tạo gì.

Các phần khác của Contract từ v1 **vẫn giữ nguyên** (không bị user đổi ý ở vòng trao đổi này):
- Rent schedule nhập tay theo từng kỳ/năm, không tự tính % — xem v1 mục 3.2/5.2, đã xác nhận chắc 100%
- Có số ngày cảnh báo trước hạn hợp đồng (config được)

## 4b. Quan hệ Property–Contract: 1-1 hay 1-N

> [!IMPORTANT]
> **⚠️ QUYẾT ĐỊNH TẠM THỜI — BẮT BUỘC REVIEW LẠI VỚI USER TRƯỚC KHI CODE (không được tự implement dựa vào mục này mà không hỏi lại).**

**Đã chốt tạm**: **1 Property — nhiều Contract (1-N)**. Contract có FK trỏ tới Property, không có state machine hay logic renew tự động gì thêm — vẫn là CRUD đơn giản, chỉ khác 1-1 ở chỗ 1 Property có thể liệt kê nhiều Contract theo thời gian.

**Lý do chọn 1-N** (phân tích, chưa xác nhận thực tế nghiệp vụ công ty):
- Property (địa chỉ, chủ nhà, diện tích, PDF gốc) là dữ liệu ít đổi theo thời gian; Contract (thời hạn, giá thuê) có tính lặp lại tự nhiên khi hết hạn thuê tiếp cùng địa điểm (renew) — đây là hành vi phổ biến trong nghiệp vụ leasing nói chung, không riêng công ty này.
- Chi phí kỹ thuật thêm vào so với 1-1 gần như bằng 0 (chỉ là 1 cột FK `contract.propertyId`, Prisma xử lý quan hệ này tự nhiên, không cần thêm bảng/logic riêng).
- Rủi ro nếu chọn sai theo hướng 1-1: khi renew xảy ra thật, phải tạo lại toàn bộ Property (nhập lại địa chỉ/chủ nhà/PDF trùng lặp) hoặc migrate schema giữa chừng — tốn công hơn nhiều so với chi phí làm 1-N ngay từ đầu.

**Vì sao vẫn phải review lại trước khi code, dù đã chọn**: user xác nhận **chưa biết chắc thực tế công ty có xảy ra renew hay không** — quyết định 1-N ở trên là suy luận kỹ thuật (dựa trên logic nghiệp vụ leasing chung + phân tích chi phí/rủi ro), **không phải xác nhận từ thực tế vận hành của công ty**. Trước khi bắt tay implement Contract module, phải hỏi lại người có thẩm quyền nghiệp vụ (không chỉ người yêu cầu hiện tại) xem thực tế renew có xảy ra không, và nếu có thì Property có giữ nguyên hay đổi gì không.

## 5. Cảnh báo hết hạn hợp đồng — đã chốt người nhận

Theo ảnh flow Current: mốc cảnh báo 6 tháng / 3 tháng / 1 tháng trước hạn.

**Người nhận cảnh báo (đã xác nhận)**: **Kế toán + Legal**. Kế toán là người xử lý (renew/liên hệ tái ký...), Legal chỉ nhận để biết, không thao tác gì thêm.

## 6. Scope — điểm dừng của hệ thống (KHÔNG làm SAP/Payment)

Theo ảnh flow Current, quy trình thủ công đầy đủ có các bước:

```
Network: Deal hợp đồng → Review & Ký → Gửi hợp đồng đã ký cho Kế toán
Kế toán: Scan & lưu hợp đồng
  → nhánh 1: input data theo dõi thanh toán → Excel → Upload SAP → Quy trình payment
  → nhánh 2: Upload ổ chung
Legal: Down hợp đồng (từ ổ chung) để xem + nhập dữ liệu theo dõi hợp đồng → Excel → Cảnh báo hết hạn (6/3/1 tháng)
```

**Đã xác nhận rõ ranh giới scope (CHỐT LẠI — đảo quyết định trước đó)**: hệ thống **CÓ** làm xuất Excel theo template công ty cung cấp — đây là nghiệp vụ chính thức của giai đoạn này (FR-8 trong SRS v2), không phải để dành phase sau như đã ghi trước đây trong mục này. Hệ thống chỉ **KHÔNG** làm:
- Upload file Excel đã xuất lên SAP (bước thủ công tiếp theo, ngoài hệ thống)
- Quy trình payment (nằm hoàn toàn trong SAP)

**Lý do sửa lại**: câu viết trước đó ("xuất báo cáo Excel để nạp vào SAP" nằm trong phần "ngoài phạm vi") gây hiểu nhầm là hệ thống không xuất Excel gì cả — user chỉ ra câu này khó hiểu. Sau khi hỏi lại, user xác nhận rõ: xuất Excel LÀ việc hệ thống làm, chỉ có bước "dùng file đó để upload SAP" mới là ngoài phạm vi.

**Vẫn còn treo**: cấu trúc cột cụ thể của template Excel (bao nhiêu cột, tên cột, có mấy loại template) — cần công ty cung cấp mẫu thật trước khi hoàn thiện thiết kế field xuất file, dù nghiệp vụ "có làm Excel export" đã chốt.

## 7. Đối chiếu với "ổ chung" và "Scan & lưu hợp đồng" trong ảnh

Ảnh mô tả quy trình thủ công hiện tại dùng file PDF scan + ổ chung mạng (network drive) để Legal down về xem. Trong hệ thống mới, việc "Legal down hợp đồng để xem" tương đương với **Legal có quyền View + xem/download file PDF đã upload trong hệ thống** — không cần ổ chung riêng nữa, hệ thống là nguồn duy nhất lưu file.

"Scan & lưu hợp đồng" (Kế toán) tương đương bước Kế toán **upload/attach file PDF hợp đồng đã ký** vào record Property/Contract trong hệ thống — không phải 1 nghiệp vụ tách biệt.

## 7b. Bổ sung: FR-3/5/6 từ SRS v1 + Version History kiểu Frappe (yêu cầu mới từ khách hàng)

**Bổ sung lại 3 nhóm FR bị bỏ sót khi viết SRS v2 lần đầu** — không phải thay đổi nghiệp vụ, chỉ là thiếu sót cần đưa lại vào tài liệu chính thức, giữ đúng mức độ mô tả mờ như v1 (chưa có chi tiết field, để hỏi sau khi cần):
- **FR-3 Theo dõi Thanh toán**: Kế toán theo dõi tiến độ thanh toán thực tế + xuất báo cáo — 2 câu mô tả, chưa có field cụ thể (đợt trả gọi là gì, ngày trả, số tiền, trạng thái đã trả/chưa trả... đều chưa hỏi)
- **FR-5 Thống kê/Báo cáo**: hoàn toàn chưa có chi tiết nội dung báo cáo (giống v1)
- **FR-6 Quản lý Người dùng & Phân quyền**: Admin CRUD account + gán permission — không đổi so với hạ tầng RBAC đã có sẵn trong base template (`AccessControlModule`)

Đã đánh lại số thứ tự SRS v2 theo yêu cầu: FR-1 Mặt bằng, FR-2 Hợp đồng, FR-3 Theo dõi Thanh toán, FR-4 Cảnh báo hết hạn, FR-5 Thống kê/Báo cáo, FR-6 Quản lý User, **FR-7 Version History** (mới).

**Yêu cầu mới — Version History kiểu Frappe Framework**: khách hàng (bên công ty) muốn có tính năng theo dõi lịch sử chỉnh sửa giống tab "Version" của Frappe — mỗi lần 1 record (Property/Contract) bị tạo/sửa, hệ thống tự lưu lại: ai sửa, lúc nào, và **giá trị từng field trước → sau** (không chỉ "ai sửa lần cuối"). Người xem được Property/Contract thì cũng xem được lịch sử của nó.

**Note kỹ thuật cho lúc plan/implement** (không đưa vào SRS gửi khách vì đây là chi tiết triển khai, không phải nghiệp vụ):
- Cần 1 bảng audit log riêng (ví dụ `PropertyVersion`/`ContractVersion`, hoặc 1 bảng chung `EntityChangeLog` polymorphic) lưu diff field-level — không nên chỉ lưu `updatedBy`/`updatedAt` trên bảng chính vì không đáp ứng yêu cầu "xem giá trị cũ/mới".
- Cách phổ biến: interceptor/service hook ở tầng NestJS service, so sánh object trước/sau khi update rồi ghi diff — không cần dùng trigger DB.
- File PDF (Property) nếu bị thay bằng file khác thì version history nên ghi nhận link file cũ, không cần diff nội dung file.
- Đây là tính năng cross-cutting (áp dụng cho cả Property và Contract), nên cân nhắc thiết kế 1 service/module chung dùng lại được, tránh viết lặp 2 lần theo entity — nhưng đây là quyết định kỹ thuật để bàn ở `/ck:plan`, không quyết ở bước brainstorm này.

## 7c. Bổ sung field từ mẫu Excel thật ("BẢNG TỔNG HỢP THEO DÕI MẶT BẰNG THUÊ")

User cung cấp ảnh chụp sheet Excel thật đang dùng để theo dõi mặt bằng thuê — đây là dữ liệu thật (không phải suy luận), nên các field đọc được từ đây có độ tin cậy cao, đã đưa thẳng vào SRS v2 mục 4:

- **Địa chỉ tách 3 cấp**: Địa chỉ chi tiết / Quận-Huyện / Thành phố-Tỉnh (Property) — thay cho field "địa chỉ mặt bằng" gộp chung trước đó.
- **Ngày bắt đầu tính tiền thuê** (Contract) — tách riêng khỏi ngày bắt đầu hợp đồng, vì có thể có giai đoạn miễn phí/ân hạn đầu kỳ không tính tiền thuê.
- **Nghĩa vụ kê khai/nộp thuế** (Contract) — field ghi nhận bên chịu trách nhiệm kê khai thuế cho hợp đồng (ảnh có ví dụ "Maycha kê khai nộp thuế").
- **Thông tin liên hệ** (Property) — cột riêng trong Excel, tách khỏi field "chủ cho thuê".
- **Bảng giai đoạn điều chỉnh giá dùng khoảng ngày cụ thể** (ngày bắt đầu, ngày kết thúc, giá thuê/tháng) — sửa lại cách mô tả "bảng giá thuê theo năm/kỳ" (cách gọi cũ, mơ hồ) thành đúng cấu trúc thật: nhiều dòng, mỗi dòng là 1 khoảng ngày + giá, không phải "năm thứ N".
- **Mã màu cảnh báo hết hạn**: Vàng (≤ 6 tháng), Cam (≤ 3 tháng), Đỏ (≤ 1 tháng) — khớp đúng 3 mốc cảnh báo đã có ở FR-4, thêm vào SRS như FR-4.3 vì đây là quy ước hiển thị trực quan mà Kế toán đã quen dùng trong Excel, nên giữ lại khi thiết kế UI hệ thống mới.
- Cột "Ngày còn lại đến đợt tăng giá" trong Excel là giá trị **derived** (tính từ bảng giai đoạn điều chỉnh giá, không phải field nhập tay riêng) — không cần thêm field DB riêng cho nó, chỉ cần tính toán khi hiển thị.

**Note kỹ thuật**: field "Nghĩa vụ kê khai/nộp thuế" trong ảnh chỉ có 1 giá trị ví dụ ("Maycha kê khai nộp thuế") — chưa rõ đây là free-text hay danh sách lựa chọn cố định (enum). Cần hỏi thêm khi vào giai đoạn thiết kế field DB chi tiết, không chốt ở mức brainstorm này.

## 7d. Ảnh flow "Quản lý hợp đồng (Current)" đã chèn vào SRS

Theo yêu cầu, ảnh sơ đồ flow thủ công hiện tại (Network/Kế toán/Legal + Excel/SAP/ổ chung) đã được chèn vào SRS v2 mục 2.2 "Quy trình hiện tại (tham khảo)" — dùng làm căn cứ đối chiếu khi đọc SRS, không phải đặc tả hệ thống mới. File ảnh gốc lưu tại `quy-trinh-hop-dong-hien-tai.jpg` trong plan folder, nhúng base64 trực tiếp vào bản `.html`/`.pdf` để tự chứa.

**Lưu ý**: ảnh Excel ("BẢNG TỔNG HỢP THEO DÕI MẶT BẰNG THUÊ") ở mục 7c bên trên **không** được chèn vào SRS — chỉ dùng để phân tích lấy field, theo đúng yêu cầu user ("nhầm ảnh 2 mới bỏ vô tài liệu").

## 8. Tổng hợp mức độ tin cậy — v2

**A. Đã xác nhận chắc chắn (trực tiếp từ user qua ảnh + hỏi lại):**
- Giữ tên role "Site" (ảnh gọi "Network" chỉ là tên khác cùng 1 role, không đổi thuật ngữ tài liệu)
- Site chỉ tạo Property đúng 1 lần (upload PDF + field), không có bước nháp giữa đường, không edit lại được sau khi nộp
- Kế toán: full quyền tạo/edit Property (không giới hạn số lần) VÀ toàn quyền tạo/edit Contract
- Legal: chỉ View trên cả Property và Contract, không có nghiệp vụ tạo/sửa nào
- Không có state machine (draft/pending/approved/rejected) cho Property — chỉ permission phân quyền tạo vs sửa
- Cảnh báo hết hạn hợp đồng (mốc 6/3/1 tháng) gửi cho Kế toán + Legal
- Excel export **LÀ nghiệp vụ chính thức của giai đoạn này** (FR-8) — chỉ upload SAP + payment mới ngoài phạm vi (đã đảo lại so với quyết định ban đầu, xem mục 6)
- Yêu cầu mới: Version History field-level kiểu Frappe cho Property + Contract (xem mục 7b) — đã đưa vào SRS v2 thành FR-7
- Field mới từ mẫu Excel thật (xem 7c): địa chỉ 3 cấp, ngày bắt đầu tính tiền thuê, nghĩa vụ kê khai thuế, thông tin liên hệ, bảng giai đoạn điều chỉnh giá theo khoảng ngày, mã màu cảnh báo (Vàng/Cam/Đỏ)

**B. Giữ nguyên từ v1 (không bị đổi ý ở vòng này):**
- Rent schedule nhập tay theo kỳ/năm, không tự tính % tăng giá
- Admin full CRUD
- FR-3 Theo dõi Thanh toán, FR-5 Thống kê/Báo cáo, FR-6 Quản lý User — giữ mức mô tả mờ như v1, chưa thêm chi tiết field

**C. Chốt tạm, bắt buộc review lại trước khi code (xem mục 4b):**
- Quan hệ Property-Contract: chọn tạm **1-N**, dựa trên phân tích chi phí/rủi ro kỹ thuật — chưa xác nhận thực tế nghiệp vụ renew của công ty. **Không tự implement dựa vào lựa chọn này mà không hỏi lại người có thẩm quyền nghiệp vụ trước.**

**D. Còn treo — cần giải quyết trước khi hoàn thiện thiết kế Excel export (nhưng KHÔNG chặn việc lên plan cho phần còn lại):**
- Cấu trúc cột cụ thể của template Excel export (bao nhiêu cột, tên cột, mấy loại template) — cần công ty cung cấp mẫu thật, dù nghiệp vụ "có làm Excel export" đã chốt là trong scope
- 2 field nghi "Tòa nhà"/"Tọa độ" từ note tay v1 — chưa xác nhận lại trong vòng này
- Nghiệp vụ thứ 5 chưa xác định (cụm "Tiền/MI Htr/30tr/20Tr" từ note tay v1) — chưa nhắc lại trong vòng này, vẫn treo

## 9. Việc cần làm tiếp theo

1. **[BẮT BUỘC trước khi code Contract module]** Hỏi lại người có thẩm quyền nghiệp vụ về thực tế renew mặt bằng — xác nhận/bác bỏ lựa chọn tạm 1-N ở mục 4b.
2. **[BẮT BUỘC trước khi code FR-8 Excel export]** Lấy mẫu template Excel thật từ công ty để chốt cột — Excel export đã trong scope chính thức nhưng chưa có mẫu thật để thiết kế field xuất file.
3. Cập nhật SRS v1 thành SRS v2 hoàn chỉnh theo các quyết định ở đây, rồi chuyển `/ck:plan` cho phase Property + Contract + Excel export.
