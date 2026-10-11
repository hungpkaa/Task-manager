# Bước 10 — Điều phối, báo cáo và quản trị

## Tiến độ UC36 — Task Dependency

Đã có API và giao diện quản lý dependency trong chi tiết Task. PM hiện tại của Project ACTIVE được thêm/xóa; người có quyền xem Task được đọc danh sách phân trang 20. Owner không tự có quyền quản lý Task.

- `GET /tasks/:id/dependencies?page=1`: đọc danh sách và quyền chỉnh sửa.
- `POST /tasks/:id/dependencies`: JSON `{ dependsOnTaskId }`, thêm liên kết.
- `DELETE /tasks/:id/dependencies/:dependsOnTaskId`: JSON `{}`, xóa liên kết.

Hai Task phải cùng Project; từ chối tự phụ thuộc, liên kết trùng và chu trình trực tiếp/nhiều tầng. Kiểm tra đường đi dùng truy vấn recursive; thao tác ghi dùng cùng khóa Workspace với các thao tác Task để hai yêu cầu đồng thời không tạo chu trình. Thêm/xóa cập nhật phiên bản Task để vô hiệu hóa preview Sprint cũ. Dùng bảng dependency hiện có, không cần migration mới.

BLOCKED được đánh giá từ dependency chưa DONE, không tự thay đổi trạng thái Task. Giao diện tải lại chi tiết sau khi thêm/xóa; xóa có xác nhận/hủy. Project CLOSED giữ lịch sử để xem và chặn ghi. Phân tích Risk chưa được tích hợp nên UC36 chưa nghiệm thu toàn bộ phần phụ thuộc.

## Kiểm chứng

Kiểm thử API bao gồm phân quyền, Task khác Project, dữ liệu sai, chu trình nhiều tầng, hai liên kết ngược chiều đồng thời, phân trang, BLOCKED và Project CLOSED. Luồng trình duyệt Sprint kiểm tra thêm/xóa/hủy xóa và BLOCKED trên desktop/mobile, kèm kiểm tra không tràn ngang.

Build và typecheck web/API thành công. `npm.cmd run test:db`: 44/44 kiểm thử tích hợp PostgreSQL thành công.

`npm.cmd run test:e2e -- --grep Sprint`: 2/2 luồng desktop/mobile thành công. Ảnh kiểm chứng `task-dependencies.png` nằm trong `.local/e2e-results`; báo cáo tại `.local/e2e-report`.

## Phần còn lại

UC35 Capacity, UC37 Workload, UC38 Risk, UC39 đề xuất điều phối; UC30 Calendar, UC33–34 Dashboard và UC40–43 System Admin. Tích hợp Capacity/Workload/Risk vào UC46–48 và Risk vào UC36 rồi kiểm chứng lại trước khi nghiệm thu đầy đủ bước 10.
