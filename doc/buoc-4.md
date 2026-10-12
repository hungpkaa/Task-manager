# Bước 4 — Workspace và thành viên

## Căn cứ đặc tả

UC06–UC11 trong [sơ đồ Workspace](assets/so-do/image3.png), UC06 chi tiết [image34](assets/so-do/image34.png), UC08 chi tiết [image35](assets/so-do/image35.png), các sequence [image15](assets/so-do/image15.png), [image16](assets/so-do/image16.png), Class/ERD [image27](assets/so-do/image27.png), [image29](assets/so-do/image29.png).

UC06 tạo Workspace và membership Owner nguyên tử. UC08 gửi lời mời tới tài khoản ACTIVE đã tồn tại ở trạng thái PENDING và tạo thông báo/email mời; người được mời có quyền chấp nhận (để gia nhập Workspace) hoặc từ chối lời mời. Owner sửa Workspace, quản lý danh sách lời mời đang chờ phản hồi, thêm/xóa thành viên và đổi vai trò; thành viên xem danh sách. Frontend gọi REST controller → service → repository → PostgreSQL; backend kiểm tra quyền.

## Chức năng đã có

- Danh sách Workspace đang tham gia, tạo và sửa tên/mô tả; người tạo nhận Owner.
- Đóng / lưu trữ Workspace (xóa mềm): Chỉ Owner có quyền thực hiện. Chặn đóng nếu còn Project đang hoạt động (`ACTIVE`). Khi đã đóng, Workspace chuyển trạng thái `CLOSED`, ẩn khỏi danh sách mặc định (lọc theo tab: Đang hoạt động, Đã đóng / Lưu trữ, Tất cả). Không cho phép tạo Project, sửa thông tin, mời hoặc xóa thành viên trên Workspace đã đóng. Owner có thể mở lại (`reopen`). Thông báo được gửi đến tất cả thành viên khi Workspace đóng hoặc mở lại.
- Mời tài khoản ACTIVE bằng email, chuẩn hóa email, từ chối người không tồn tại/bị khóa/đã tham gia hoặc đang có lời mời chờ. Lời mời được tạo ở trạng thái PENDING và tạo thông báo cho người nhận. Người nhận có thể Chấp nhận hoặc Từ chối lời mời ngay trên trang Workspace hoặc trang Thông báo. Khi chấp nhận, membership được ghi nhận và người mời nhận thông báo xác nhận. Owner quản lý danh sách lời mời chờ phản hồi, có thể gửi lại email mời hoặc hủy lời mời.
- Danh sách thành viên, cấp/hạ quyền Owner/Member, xóa membership. Kiểm tra phiên và quyền ở mỗi request; System Admin không tự có quyền Owner.
- Trang thông báo: 50 mục mới nhất của chính người dùng, số chưa đọc, đánh dấu đã đọc và mở Workspace liên quan. Thông báo cũ vẫn được giữ khi membership bị xóa; mở Workspace sẽ kiểm tra quyền hiện tại.
- Màn hình có trạng thái tải/rỗng/lỗi, thử lại, xác nhận đổi quyền/xóa, khóa thao tác khi đang gửi yêu cầu.

## Lựa chọn ngoài chi tiết nguồn

Nguồn chưa quy định tập vai trò cụ thể hoặc số Owner. Triển khai dùng Owner/Member, cho phép nhiều Owner và giữ ít nhất một Owner. Các thao tác quản trị khóa dòng Workspace trong transaction và kiểm tra lại quyền, tránh hai yêu cầu đồng thời làm mất Owner cuối cùng. `createdBy` giữ người tạo, không chuyển khi đổi quyền.

Tên 1–100 ký tự, mô tả tối đa 1000 ký tự; bổ sung description/joinedAt/timestamps/readAt để hỗ trợ giao diện. Thông báo là trong ứng dụng; email gửi lại qua hộp thư thử nghiệm. Luồng lời mời có bước Chấp nhận / Từ chối rõ ràng thông qua bảng WorkspaceInvitation (trạng thái PENDING, ACCEPTED, DECLINED, CANCELED) thay vì ép trực tiếp vào membership, giúp thao tác "Gửi lại email mời" và "Hủy lời mời" có giá trị thực tế.

Tại mốc bước 4, Project/Task chưa có. Bước 5 đã bổ sung chặn xóa thành viên giữ PM, xóa membership Project thường khi xóa khỏi Workspace; Owner có thể chuyển PM trên cả Project đã đóng. Ràng buộc Task được bổ sung ở bước 6. UC32 vẫn là nền tảng, các sự kiện Task/mention/Sprint được tích hợp sau.

## API

Các API dùng cookie phiên bước 3. Thao tác thay đổi yêu cầu Origin đúng `APP_ORIGIN` và JSON, kể cả DELETE (`{}`).

| API | Quyền và kết quả |
| --- | --- |
| GET /api/workspaces | Các Workspace của chính người dùng |
| POST /api/workspaces | Đã đăng nhập; tạo Workspace/Owner, 201 |
| GET /api/workspaces/:id | Thành viên; thông tin và vai trò hiện tại |
| PATCH /api/workspaces/:id | Owner; tên/mô tả |
| POST /api/workspaces/:id/close | Owner; đóng/lưu trữ Workspace (yêu cầu không còn Project ACTIVE), 200 |
| POST /api/workspaces/:id/reopen | Owner; mở lại Workspace đã đóng, 200 |
| GET /api/workspaces/invitations/me | Đã đăng nhập; danh sách lời mời đang chờ của chính mình |
| POST /api/workspaces/invitations/:id/accept | Người được mời; chấp nhận lời mời và gia nhập Workspace, 200 |
| POST /api/workspaces/invitations/:id/decline | Người được mời; từ chối lời mời, 200 |
| GET /api/workspaces/:id/invitations | Owner; danh sách lời mời PENDING của Workspace |
| POST /api/workspaces/:id/invitations | Owner; `{email}`, gửi lời mời mới hoặc kích hoạt lại, 201 |
| POST /api/workspaces/:id/invitations/:invitationId/resend | Owner; gửi lại email mời và thông báo cho lời mời PENDING, 200 |
| DELETE /api/workspaces/:id/invitations/:invitationId | Owner; hủy lời mời PENDING, 204 |
| GET /api/workspaces/:id/members | Thành viên; danh sách thông tin công khai |
| POST /api/workspaces/:id/members | Owner; `{email}`, gửi lời mời (tương thích endpoint cũ), 201 |
| POST /api/workspaces/:id/members/:userId/email | Owner; gửi lại email mời (tương thích endpoint cũ), 200 |
| PATCH /api/workspaces/:id/members/:userId | Owner; `{role: "OWNER" hoặc "MEMBER"}` |
| DELETE /api/workspaces/:id/members/:userId | Owner; xóa membership, 204 |
| GET /api/notifications | Thông báo của chính người dùng |
| PATCH /api/notifications/:id/read | Chính chủ; idempotent, không sửa thông báo người khác |

Lỗi: 400 dữ liệu/UUID không hợp lệ, 401 hết phiên, 403 thiếu quyền/Origin sai, 404 không tồn tại, 409 membership trùng/tài khoản khóa/Owner cuối cùng/Workspace đã đóng/còn Project đang hoạt động. Lỗi hệ thống trả thông báo thử lại, không lộ chi tiết DB.

## Chạy và kiểm chứng

```powershell
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd run dev
```

Mở http://127.0.0.1:5173, đăng ký hai tài khoản. Tài khoản A tạo Workspace và thêm email B; B xem Workspace/Thông báo. B chưa có quyền sửa hoặc mời; A cấp Owner cho B rồi có thể hạ quyền/xóa A. Owner cuối cùng không thể bị hạ quyền/xóa.

Kiểm tra tự động:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run build
npm.cmd run check:workspaces
```

14 kiểm thử không cần DB và 9 kiểm thử PostgreSQL đã đạt, gồm hồi quy tài khoản, UC06–UC11, phân quyền Member/người ngoài/Admin, dữ liệu xấu, mời trùng, thông báo riêng tư, hai lời mời và hai lần hạ quyền đồng thời. Kiểm thử chèn lỗi ghi membership/thông báo trong transaction PostgreSQL xác nhận không để dữ liệu dở dang. Build và typecheck cả hai ứng dụng đạt. Script check:workspaces cần ứng dụng đang chạy và build API; tạo dữ liệu thử riêng rồi dọn đúng dữ liệu đó.

Kiểm tra qua proxy frontend đang chạy đã đạt: đăng ký hai tài khoản → tạo Workspace → thêm thành viên → kiểm tra Member không được sửa → đọc thông báo → từ chối mời trùng. Dữ liệu thử đã được dọn sau kiểm tra.

Chưa kiểm chứng tương tác hoặc bố cục bằng trình duyệt; kiểm thử HTTP không thay thế browser QA.
