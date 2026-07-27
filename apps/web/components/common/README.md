# components/common/

Widget nhỏ tái dùng ở ≥2 feature, không gắn business logic của 1 feature cụ thể (vd: date-picker tuỳ biến, loading-spinner, empty-state). Không phải shadcn primitive (những cái đó thuộc `components/ui/`, sinh qua shadcn CLI).

Chưa có component nào — thư mục này chỉ giữ chỗ theo `.agent/projectRules/frontend-architecture.md`. Component riêng của 1 feature vẫn đặt trong `features/{feature}/components/` cho đến khi có feature thứ 2 dùng lại.
