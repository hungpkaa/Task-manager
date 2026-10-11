# Bước 6 — Task, My Tasks, List và Kanban

## Căn cứ và phạm vi

[Đặc tả gốc](sơ%20đồ.md), bảng [UC19](assets/so-do/image38.png), [UC22](assets/so-do/image39.png), [UC23](assets/so-do/image40.png), [Activity tạo Task](assets/so-do/image52.png). Nguồn yêu cầu PM tạo/giao Task, assignee thuộc Project, TODO mặc định, kiểm tra ngày, thông báo khi phân công và cảnh báo dependency. Task không thuộc Sprint nằm trong Product Backlog.

Có frontend → REST controller → service → repository → PostgreSQL cho UC18–24, UC27–29 và UC31. Tại mốc bước 6, UC19 còn phần chọn Sprint (đã bổ sung ở bước 9); UC23 còn cập nhật Dashboard/Progress. Calendar, bình luận, mention, attachment và giao diện quản lý dependency chưa triển khai tại mốc này. Đợt bước 6 không có nghĩa các phần phụ thuộc đã hoàn thành.

## Hành vi và lựa chọn triển khai

- PM hiện tại tạo/sửa/xóa Task, đổi assignee, priority, ngày và effort. Owner/Admin không tự có quyền PM. Người có quyền xem Project xem Task; người ngoài Project/Workspace bị từ chối.
- Task mới TODO; priority mặc định MEDIUM, hỗ trợ LOW/MEDIUM/HIGH/URGENT. Ngày tùy chọn YYYY-MM-DD, deadline không trước bắt đầu. Effort null hoặc 1/2/3/5/8. Tiêu đề 1–200 ký tự, mô tả tối đa 10000. Đây là lựa chọn chi tiết khi nguồn không ghi giới hạn.
- Assignee có thể null; khi giao phải thuộc Project và ACTIVE. Ghi Task và thông báo cùng transaction; đổi sang cùng assignee không tạo thông báo lặp. PATCH thông tin không cho đổi projectId, status, assigneeId hoặc sprintId; dùng API chuyên biệt.
- Đổi trạng thái dành cho PM hoặc assignee còn là thành viên. Chỉ chuyển bước kế tiếp TODO → IN_PROGRESS → REVIEW → DONE; lặp cùng trạng thái được chấp nhận, không cho nhảy bước/quay lùi. `expectedStatus` chống thao tác trên dữ liệu cũ.
- BLOCKED là đánh giá khi có dependency chưa DONE, không phải trạng thái thứ năm. Trước chuyển trạng thái, API trả 409 cảnh báo; UI hiển thị công việc chặn và yêu cầu xác nhận. Gửi `acknowledgeBlocked:true` cho phép tiếp tục, vẫn giữ cảnh báo. Đây là chính sách cảnh báo nguồn cho phép theo rule triển khai.
- Bảng TaskDependency chuẩn bị cho bước 10; FK ghép cùng Project và CHECK không tự phụ thuộc. Chưa có API/UI thêm/xóa và chống chu trình; không đánh dấu UC36 xong. Test chèn dependency bằng fixture DB để kiểm chứng đánh giá. PM không được xóa Task còn bị Task khác phụ thuộc.
- My Tasks chỉ trả công việc giao cho chính mình trong Project còn membership; không lộ dữ liệu chỉ vì giữ assignee lịch sử. List/Kanban dùng cùng truy vấn, bốn cột gốc; chuyển trạng thái trong chi tiết, không kéo thả.
- Tìm title/description không phân biệt hoa thường, lọc status/priority/assignee (kể cả unassigned), sort updatedAt/title/dueDate/priority; asc/desc, ngày null cuối. Phân trang mặc định 20, tối đa 100 phía API; UI 20 mục/trang cả List/Kanban, hiển thị tổng số và điều hướng. Đây không phải bảng Kanban tải toàn bộ Project.
- Xóa thành viên Project/Workspace bị chặn nếu còn Task chưa DONE được giao; chuyển giao/bỏ phân công trước. Task DONE giữ assignee User làm lịch sử kể cả khi người đó rời nhóm; không giữ quyền truy cập. FK assignee tới User; kiểm tra membership khi giao nằm ở service/repository.
- Đóng Project bị chặn khi còn Task chưa DONE. Sau đóng, Task chỉ xem; dữ liệu DONE không tự xóa. Điều kiện liên quan Sprint bổ sung ở bước 9. Không tự mở lại Project.

Mọi thay đổi Task dùng cùng khóa dòng Workspace với đổi PM, thành viên và đóng Project, kiểm tra lại quyền/dữ liệu sau khóa. Danh sách và tổng số được đọc trong transaction RepeatableRead để nhất quán khi phân trang.

## Dữ liệu và API

Migration `20261010133350_task_management` tạo Task, TaskDependency, enum trạng thái/priority, FK và CHECK ngày/effort/dependency. `sprintId` hiện chỉ được null, có CHECK DB chống ID mồ côi; bước 9 phải bỏ CHECK này và thêm FK cùng Project trước khi hỗ trợ chọn Sprint.

Cookie/Origin/JSON theo các bước trước; DELETE gửi `{}`. Không trả passwordHash/session/token trong dữ liệu công việc.

| API | Nội dung |
| --- | --- |
| GET /api/projects/:projectId/tasks | Danh sách phân trang, kiểm tra quyền Project |
| POST /api/projects/:projectId/tasks | PM, tạo Task và thông báo nếu phân công |
| GET /api/tasks/mine | Chính mình, bộ lọc/sort/phân trang; không lọc sang assignee khác |
| GET /api/tasks/:id | Chi tiết, quyền thao tác và công việc chặn |
| PATCH /api/tasks/:id | PM, title/description/priority/startDate/dueDate/effort |
| PATCH /api/tasks/:id/assignee | PM, `{assigneeId: uuid hoặc null}` |
| PATCH /api/tasks/:id/status | `{status,expectedStatus,acknowledgeBlocked?}`, trả task/warning |
| DELETE /api/tasks/:id | PM, xóa có xác nhận UI; từ chối nếu còn dependent |

Query: `q,status,priority,assigneeId,sort,direction,page,pageSize`. Assignee filter nhận UUID hoặc `unassigned`. Đầu vào lạ/enum sai/UUID sai bị từ chối. PATCH ngày kiểm tra cả giá trị hiện tại và mới; lỗi trả JSON 400/401/403/404/409, lỗi hệ thống không lộ DB.

## Thử nghiệm và kiểm chứng

```powershell
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd run dev
```

Mở http://127.0.0.1:5173. Owner tạo Workspace/Project, thêm B/C, chọn B làm PM; B thêm C vào Project rồi tạo Task giao C. C mở My Tasks/Thông báo, đổi trạng thái tuần tự. B lọc/đổi List–Kanban, sửa và phân công lại. Thử đóng khi còn Task TODO hoặc xóa C còn Task chưa DONE để thấy lỗi; khi tất cả DONE mới đóng được.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run build
npm.cmd run check:tasks
```

Kiểm thử PostgreSQL bao gồm CRUD, thông báo/idempotency, My Tasks, phân quyền Owner/PM/assignee/member/người ngoài/Admin, trường giả mạo, ngày/effort/query sai, lọc/sort/phân trang và cách ly Project; cảnh báo dependency/xác nhận, CHECK/FK, chặn xóa/đóng, giữ DONE; đổi trạng thái và giao việc/xóa membership đồng thời; rollback khi thông báo lỗi. Script check:tasks tạo ba tài khoản riêng và kiểm tra qua proxy frontend, dọn đúng dữ liệu thử.

Kết quả: 36 kiểm thử đạt (14 không cần DB, 22 PostgreSQL), typecheck và build cả hai ứng dụng đạt. Migration đã áp dụng, DB schema đồng bộ. check:tasks qua frontend proxy đạt, gồm đăng ký ba tài khoản → Workspace/Project/PM → giao Task → My Tasks/thông báo → đổi trạng thái → lọc → đóng Project; dữ liệu thử được dọn. Health/ready/proxy và React entrypoint cũng đạt.

Chưa có browser QA; kiểm thử HTTP không thay thế nghiệm thu tương tác, bố cục responsive và khả năng sử dụng ở bước 7.
