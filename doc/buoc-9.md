# Bước 9 — Agile/Scrum (đang triển khai)

## Phần 1: Product Backlog và kế hoạch Sprint

Đối chiếu [đặc tả gốc](sơ%20đồ.md), SEQ-J1 (`assets/so-do/image24.png`), UC45 (`image43.png`) và UC46 (`image44.png`). Dùng chi tiết UC46 trong ảnh: **trước khi Sprint bắt đầu** PM có thể đưa Task về Product Backlog. Đoạn diễn giải Markdown nói “Khi Sprint bắt đầu” không khớp ảnh; phần triển khai chọn quy tắc trong ảnh chi tiết.

Đã có:

- Product Backlog lấy Task của Project có `sprint_id IS NULL`; Sprint Backlog lấy Task theo Sprint. Phân trang 20 Task, danh sách Sprint cũng phân trang 20.
- PM hiện tại tạo Sprint có tên, Goal và ngày bắt đầu/kết thúc bắt buộc; ngày kết thúc không trước ngày bắt đầu. Sprint mới là `PLANNED` và thuộc một Project.
- PM chọn nhiều Task trên trang hiện tại, kiểm tra Effort và cảnh báo trước khi xác nhận đưa vào Sprint. Có thể hủy mà chưa thay đổi dữ liệu.
- Cảnh báo Task thiếu Effort/người phụ trách, dependency chưa DONE, deadline sau Sprint và Task đã DONE. Tổng Effort là tổng đã biết của **Task được chọn**, không quy đổi thành giờ hoặc năng lực nhóm.
- PM đưa Task về Product Backlog với xác nhận, chỉ khi Sprint còn PLANNED. Không sao chép Task hoặc thay đổi trạng thái công việc.
- Owner và thành viên Project xem Backlog/Sprint; Owner không tự có quyền lập kế hoạch. System Admin không được vượt phạm vi Project. Project CLOSED chỉ xem.
- Kế hoạch cập nhật toàn bộ nhóm Task trong một transaction; Task khác Project hoặc đã thuộc Sprint bị từ chối cả nhóm. So sánh `updatedAt` trước khi ghi để từ chối dữ liệu cũ. Dùng cùng khóa Workspace với Task/Project/thành viên: hai yêu cầu đưa cùng Task vào hai Sprint chỉ có một yêu cầu thành công.
- Migration mới bổ sung Sprint, foreign key ghép `(sprint_id, project_id)` và kiểm tra khoảng ngày. Partial unique index bảo đảm tối đa một Sprint ACTIVE mỗi Project, chuẩn bị cho phần vòng đời.

**UC46 mới ở mức cơ bản:** chưa có dữ liệu Capacity/Workload/Risk từ bước 10. Cả API và UI ghi rõ chưa thể kết luận quá tải; PM phải tự kiểm tra năng lực nhóm. Không giả định Capacity bằng 0 hoặc tự chọn thay PM. Quản lý dependency trên giao diện vẫn thuộc bước 10; cảnh báo hiện đọc dependency đã lưu.

## API và cách dùng

Các API yêu cầu session; thao tác ghi yêu cầu JSON và Origin hợp lệ:

| API | Chức năng |
| --- | --- |
| `GET /api/projects/:projectId/sprints?page=1` | Danh sách Sprint |
| `POST /api/projects/:projectId/sprints` | Tạo PLANNED: name, goal, startDate, endDate |
| `GET /api/projects/:projectId/backlog?page=1` | Product Backlog |
| `GET /api/projects/:projectId/backlog?sprintId=:id&page=1` | Sprint Backlog |
| `POST /api/projects/:projectId/sprints/:id/plan` | Kiểm tra / xác nhận nhóm Task |
| `POST /api/projects/:projectId/sprints/:id/tasks/:taskId/return` | Đưa Task về Product Backlog khi PLANNED |

Plan nhận `tasks: [{id, updatedAt}]` (1–100, không trùng) và `confirmed` (mặc định false). Preview không ghi dữ liệu; confirm kiểm tra lại và cập nhật atomically. Return nhận `updatedAt` của Task đang xem. API không cho gửi một `sprintId` tùy ý qua PATCH Task để vượt qua kiểm tra kế hoạch.

Mở Workspace → Project → **Mở Sprint & Backlog**. PM tạo Sprint, chọn Sprint nhận Task, chọn các checkbox trong Product Backlog → **Kiểm tra kế hoạch** → xem cảnh báo → **Xác nhận đưa vào Sprint**. Có thể chuyển sang **Sprint Backlog**, chọn **Đưa về Product Backlog** và xác nhận. Bấm tải lại để lấy thay đổi từ màn hình Task; chọn Task chỉ giữ trong trang đang xem. Đây là kế hoạch PLANNED, chưa có nút bắt đầu/kết thúc Sprint.

## Kiểm chứng

Ngày 2026-10-11: migration thứ 9 áp dụng thành công vào PostgreSQL cục bộ; kiểm tra trên DB mới cũng qua. Build/typecheck qua. 17 unit test và 34 integration test qua; phần Sprint kiểm tra quyền, ngày/Goal, phân trang, dependency/cảnh báo, preview không ghi, batch rollback, Task khác Project, dữ liệu cũ, tranh chấp đồng thời, return theo trạng thái và các ràng buộc DB.

12 kiểm thử trình duyệt qua (6 luồng × máy tính/điện thoại), gồm hồi quy Workspace/Project/Task và tài khoản/email. Bài kiểm tra Sprint bao gồm tạo Sprint, chọn hai Task, xem/hủy cảnh báo, xác nhận, tải lại trang, đưa Task về Backlog và kiểm tra chiều rộng. Ảnh chụp cảnh báo lưu trong `.local/e2e-results`, báo cáo tại `.local/e2e-report`; mở bằng `npm.cmd run test:e2e:report`. Lần kiểm tra ứng dụng đang chạy cũng xác nhận React, API, PostgreSQL và Vite proxy hoạt động.

## Phần còn lại

Bước 9 **chưa hoàn thành**. Tiếp theo: UC47–48 bắt đầu/theo dõi Sprint; UC49 Daily Update; UC50 Review; UC51 Retrospective; UC52 kết thúc và xử lý Task chưa DONE, thông báo Sprint. Chọn Sprint ngay trong form tạo Task (UC19) và kiểm tra Sprint khi đóng Project (UC15) sẽ tích hợp ở phần vòng đời. UC46 phải kiểm chứng lại sau khi có Capacity/Workload ở bước 10.
