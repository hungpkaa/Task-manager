# Bước 5 — Project và quyền Project Manager

## Đối chiếu nguồn

[Đặc tả](sơ%20đồ.md): UC12–UC17, quy tắc Owner tạo Project/phân công PM, PM quản lý dự án được giao. Đã đọc bảng [UC12](assets/so-do/image36.png), [UC13](assets/so-do/image37.png), [sequence](assets/so-do/image17.png), [ERD](assets/so-do/image29.png), [ghi chú UC còn lại](assets/so-do/image51.png). UC12 nhập tên, mô tả và thời gian, Project thuộc một Workspace. UC13 chọn thành viên Workspace và xác nhận khi thay PM. Nguồn không có bảng chi tiết riêng UC14–UC17, nên các lựa chọn dưới đây được ghi rõ.

## Phạm vi đã triển khai

- Trong Workspace có danh sách Project và trang chi tiết. Owner tạo và nhìn thấy toàn bộ Project của Workspace; Member chỉ thấy Project có membership của mình.
- Owner phân công PM trong danh sách tài khoản ACTIVE của Workspace. PM tự được thêm vào Project; PM cũ giữ membership nhưng mất quyền quản lý ngay. UI xác nhận và API kiểm tra `expectedManagerUserId`, từ chối nếu PM đã đổi trong lúc thao tác.
- Chỉ PM hiện tại được sửa tên/mô tả/ngày, thêm/xóa thành viên Project và đóng Project. Owner/Admin không tự có quyền PM.
- Thành viên Project xem chi tiết và danh sách thành viên. Thêm người ngoài Workspace, tài khoản khóa, membership trùng, xóa PM đều bị từ chối.
- Đóng chuyển ACTIVE → CLOSED, lưu closedAt và giữ dữ liệu. PM không sửa nội dung/thành viên sau đóng. Owner vẫn có thể chuyển PM để chuyển giao trách nhiệm mà không mở lại nội dung Project.
- Phân công/thay PM, thêm/xóa thành viên và đóng Project tạo thông báo trong ứng dụng cùng transaction. Trang thông báo có liên kết mở Project và kiểm tra quyền hiện tại.
- Xóa khỏi Workspace: chặn khi còn giữ PM của bất kỳ Project nào; khi đã chuyển giao, xóa các membership Project thường rồi xóa membership Workspace cùng transaction.

## Lựa chọn triển khai

Trạng thái Project dùng ACTIVE/CLOSED; chưa có mở lại/xóa Project vì nguồn không có Use Case tương ứng. Project mới chưa có PM, Owner cần phân công để quản lý nội dung. Ngày bắt đầu/kết thúc tùy chọn; nếu đủ hai ngày thì kết thúc không trước bắt đầu. Tên 1–100 ký tự, mô tả tối đa 2000 ký tự. PM cũ không bị tự xóa khỏi nhóm. Thông báo Project được bổ sung theo quy trình ghi nhận kết quả/thông báo chung; UC13 nguồn chỉ nói thông báo kết quả, không bắt buộc email.

Khi có Task ở bước 6, phải chặn xóa membership Project/Workspace nếu người dùng còn được giao Task cho đến khi chuyển giao/bỏ phân công. Task và Sprint chưa có, vì vậy đóng Project hiện chưa xử lý những bản ghi này. Khi bổ sung phải xác định điều kiện đóng với Task/Sprint đang hoạt động, không xóa lịch sử. Đây là điểm tích hợp còn lại, không coi là đã kiểm chứng.

## Dữ liệu và API

Migration `20261010125109_project_management` tạo Project/ProjectMember, enum trạng thái và CHECK ngày tháng. FK ghép giữ Manager trong đúng Workspace, ProjectMember trong đúng Project/Workspace và phải có WorkspaceMember. `projectId,userId` là khóa duy nhất. Lớp controller → service → repository → PostgreSQL; tất cả thay đổi Project dùng cùng khóa dòng Workspace với thay đổi membership để tránh phân công PM đồng thời với xóa người đó.

API dùng cookie phiên, Origin đúng APP_ORIGIN và JSON cho mọi mutation (DELETE gửi `{}`).

| API | Quyền |
| --- | --- |
| GET /api/workspaces/:workspaceId/projects | Thành viên Workspace; lọc theo quyền Project |
| POST /api/workspaces/:workspaceId/projects | Owner; tên/mô tả/startDate/endDate, ngày YYYY-MM-DD hoặc null |
| GET /api/projects/:id | Owner Workspace hoặc thành viên Project |
| PATCH /api/projects/:id | PM, ACTIVE; sửa tên/mô tả/ngày, không cho chuyển Workspace/đổi PM qua API này |
| PATCH /api/projects/:id/manager | Owner; `{managerUserId,expectedManagerUserId}`; PM hiện tại có thể null |
| POST /api/projects/:id/close | PM; giữ lịch sử, lặp lại không tạo thêm thông báo |
| GET /api/projects/:id/members | Người có quyền xem Project |
| POST /api/projects/:id/members | PM, ACTIVE; `{userId}` thuộc Workspace |
| DELETE /api/projects/:id/members/:userId | PM, ACTIVE; chặn xóa PM |

400 dữ liệu/ID/ngày/membership không hợp lệ, 401 phiên hết hạn, 403 thiếu quyền, 404 không tồn tại, 409 xung đột/đã đóng/tài khoản khóa/membership trùng. Kiểm tra ngày PATCH trên cả dữ liệu cũ và mới; CHECK DB bảo vệ cả ghi ngoài API.

## Kiểm chứng

```powershell
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd run dev
```

Mở http://127.0.0.1:5173. Đăng ký A/B/C, A tạo Workspace rồi thêm B/C. A tạo Project và chọn B làm PM. B sửa Project/thêm C; A chưa có quyền sửa nếu chưa là PM. A thay PM bằng C; B mất quyền sửa. C đóng Project, nội dung vẫn xem được. A có thể chuyển giao PM trước khi xóa thành viên khỏi Workspace.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run build
npm.cmd run check:projects
```

Kiểm thử bao gồm UC12–UC17, dữ liệu ngày sai ở API/DB, quyền Owner/PM cũ/Member/người ngoài/Admin, dữ liệu riêng giữa Project/Workspace, membership và FK, chuyển PM sau đóng, thao tác đồng thời, rollback khi lưu thông báo lỗi. Script check:projects chạy qua frontend proxy với ba tài khoản riêng, tạo Workspace/Project, đổi PM, kiểm tra quyền, đóng và xác nhận thông báo; dọn đúng dữ liệu thử. Cần API build và ứng dụng đang chạy.

Kết quả: 28 kiểm thử đạt (14 không cần DB, 14 PostgreSQL), typecheck/build cả frontend và backend đạt. Migration đã áp dụng trên PostgreSQL cục bộ; check:projects qua frontend proxy đạt. Kiểm thử cuối đã xác nhận chuyển giao PM sau đóng, xóa PM cũ khỏi Workspace và giữ Project CLOSED.

Chưa có browser QA; kiểm thử HTTP không thay thế nghiệm thu tương tác/bố cục giao diện.
