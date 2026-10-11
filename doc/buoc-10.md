# Bước 10 — Điều phối, báo cáo và quản trị

## Tiến độ UC36 — Task Dependency

Đã có API và giao diện quản lý dependency trong chi tiết Task. PM hiện tại của Project ACTIVE được thêm/xóa; người có quyền xem Task được đọc danh sách phân trang 20. Owner không tự có quyền quản lý Task.

- `GET /tasks/:id/dependencies?page=1`: đọc danh sách và quyền chỉnh sửa.
- `POST /tasks/:id/dependencies`: JSON `{ dependsOnTaskId }`, thêm liên kết.
- `DELETE /tasks/:id/dependencies/:dependsOnTaskId`: JSON `{}`, xóa liên kết.

Hai Task phải cùng Project; từ chối tự phụ thuộc, liên kết trùng và chu trình trực tiếp/nhiều tầng. Kiểm tra đường đi dùng truy vấn recursive; thao tác ghi dùng cùng khóa Workspace với các thao tác Task để hai yêu cầu đồng thời không tạo chu trình. Thêm/xóa cập nhật phiên bản Task để vô hiệu hóa preview Sprint cũ. Dùng bảng dependency hiện có, không cần migration mới.

BLOCKED được đánh giá từ dependency chưa DONE, không tự thay đổi trạng thái Task. Giao diện tải lại chi tiết sau khi thêm/xóa; xóa có xác nhận/hủy. Project CLOSED giữ lịch sử để xem và chặn ghi. Phân tích Risk chưa được tích hợp nên UC36 chưa nghiệm thu toàn bộ phần phụ thuộc.

## UC35–37 — Capacity và Workload

PM mở điều phối trong Project để chọn kỳ và thiết lập/cập nhật Capacity cho thành viên hiện tại có tài khoản ACTIVE. Effort đã được quản lý trong chi tiết Task theo thang 1/2/3/5/8. Capacity là số nguyên dương, tối đa 1.000.000 điểm; hai ngày bắt buộc, ngày kết thúc không trước ngày bắt đầu.

- `GET /projects/:id/workload?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD&page=1`: báo cáo theo kỳ, phân trang 20 thành viên; tổng quan tính toàn Project.
- `GET /projects/:id/capacities?page=1`: lịch sử phân trang 20.
- `PUT /projects/:id/capacities`: JSON `userId`, `periodStart`, `periodEnd`, `capacityPoints`, `expectedUpdatedAt` (null khi tạo; timestamp đã đọc khi sửa).

Chỉ PM hiện tại đọc/ghi điều phối; Owner/Member/System Admin không tự có quyền này. Ghi dùng khóa Workspace cùng các thao tác quản lý Task/thành viên/PM; từ chối cập nhật bản cũ và kỳ chồng nhau của cùng thành viên. Project CLOSED chỉ đọc. Capacity gắn Project/User để giữ lịch sử khi membership bị xóa, và chỉ thiết lập cho thành viên hiện tại.

Lựa chọn triển khai do đặc tả chưa định nghĩa chi tiết kỳ: tính Task TODO/IN_PROGRESS/REVIEW có khoảng ngày giao với kỳ (biên inclusive), ngày thiếu được xem là không giới hạn đầu/cuối. Task thiếu cả hai ngày được tính ở mọi kỳ. Không chia Effort theo ngày; Capacity phải khớp chính xác kỳ truy vấn, không cộng hoặc chia tỷ lệ các kỳ khác. Tỷ lệ = Effort đã biết / Capacity × 100, làm tròn hai chữ số thập phân; trên 100% là quá tải. Thiếu Capacity trả tỷ lệ null; thiếu Effort báo dữ liệu chưa đầy đủ. Task chưa phân công được báo riêng. Báo cáo đọc dữ liệu hiện tại, không phải snapshot lịch sử của Task.

Migration thứ 15 `20261011160000_member_capacities` thêm bảng, FK Project/User, unique thành viên/kỳ và CHECK Capacity dương/ngày hợp lệ. API kiểm tra kỳ chồng nhau dưới khóa chung. Chưa tích hợp Capacity/Workload vào preview/bắt đầu/theo dõi Sprint, Risk hoặc đề xuất điều phối.

## Kiểm chứng

Kiểm thử API bao gồm phân quyền, Task khác Project, dữ liệu sai, chu trình nhiều tầng, hai liên kết ngược chiều đồng thời, phân trang, BLOCKED và Project CLOSED. Luồng trình duyệt Sprint kiểm tra thêm/xóa/hủy xóa và BLOCKED trên desktop/mobile, kèm kiểm tra không tràn ngang.

Build và typecheck web/API thành công. `npm.cmd run test:db`: 46/46 kiểm thử tích hợp PostgreSQL thành công, gồm Capacity, tỷ lệ tải, ranh giới ngày, thiếu dữ liệu, phân trang, phân quyền, kỳ chồng nhau/cập nhật cũ/đồng thời và lịch sử khi rời Project. 15 migration chạy thành công trên database PostgreSQL mới qua `check:fresh-db`.

`npm.cmd run test:e2e -- --grep Sprint`: 2/2 luồng desktop/mobile thành công, gồm tạo/sửa/hủy sửa Capacity và tỷ lệ 125% → 50%. Ảnh kiểm chứng `task-dependencies.png` và `capacity-workload.png` nằm trong `.local/e2e-results`; báo cáo tại `.local/e2e-report`.

## Phần còn lại

UC38 Risk, UC39 đề xuất điều phối; UC30 Calendar, UC33–34 Dashboard và UC40–43 System Admin. Tích hợp Capacity/Workload/Risk vào UC46–48 và Risk vào UC36 rồi kiểm chứng lại trước khi nghiệm thu đầy đủ bước 10.
