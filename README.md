# Task-manager

Hệ thống quản lý công việc nhóm theo Workspace, Project, Task và Sprint.

Bước 9 đã có Backlog/kế hoạch, bắt đầu/theo dõi/kết thúc Sprint, Daily Update, Review, Retrospective và chọn Sprint khi tạo Task. Tích hợp Capacity/Workload/Risk còn lại ở bước 10; xem [tiến độ bước 9](doc/buoc-9.md).

## Trạng thái

Đã hoàn thành bước 7 trong phạm vi phiên bản đầu: nền tảng React/Express/PostgreSQL, tài khoản, Workspace, Project và Task, kèm nghiệm thu trình duyệt và responsive.
Có đăng ký, đăng nhập, đăng xuất, đọc/sửa hồ sơ và phiên đăng nhập lưu trong PostgreSQL.
Có tạo/sửa Workspace, thêm/xóa thành viên, phân quyền Owner/Member và thông báo khi được thêm vào nhóm.
Có tạo Project, phân công/thay Project Manager, sửa dự án, quản lý thành viên và đóng dự án.
Có tạo/sửa/xóa Task, phân công, priority/ngày/effort, đổi trạng thái, My Tasks, List/Kanban, tìm kiếm/lọc/sắp xếp và thông báo giao việc.
Sprint, cộng tác mở rộng, Dashboard và phân tích điều phối chưa hoàn thiện; xem bảng Use Case để biết các phần phụ thuộc còn lại.
Đã hoàn thành bước 8 trong môi trường cục bộ: bình luận/mention, tệp đính kèm, quên/đặt lại mật khẩu, email mời và gửi lại. Email dùng hộp thư thử theo lựa chọn của nhóm; chưa gửi email thật.

## Tài liệu

- [Đặc tả hệ thống và sơ đồ](doc/sơ%20đồ.md)
- [Bước 1 — Phạm vi, công nghệ và lộ trình](doc/lo-trinh.md)
- [Bước 2 — Hướng dẫn chạy và kết quả kiểm tra](doc/buoc-2.md)
- [Bước 3 — Tài khoản và xác thực](doc/buoc-3.md)
- [Bước 4 — Workspace, thành viên và thông báo](doc/buoc-4.md)
- [Bước 5 — Project và phân quyền PM](doc/buoc-5.md)
- [Bước 6 — Task, My Tasks, List và Kanban](doc/buoc-6.md)
- [Bước 7 — Nghiệm thu phiên bản đầu](doc/buoc-7.md)
- [Bước 8 — Bình luận, mention và tiến độ cộng tác](doc/buoc-8.md)
- [Hướng dẫn sử dụng cho nhóm](doc/huong-dan-su-dung.md)
- [Đối chiếu tiến độ với 52 Use Case](doc/doi-chieu-use-case.md)

## Công nghệ đã chọn

React cho frontend, Node.js cho backend và PostgreSQL cho cơ sở dữ liệu.
Chi tiết nền tảng và thứ tự triển khai được ghi trong tài liệu lộ trình.

## Chạy nhanh trên PowerShell

Yêu cầu Node.js 22.12 trở lên, npm và Docker Desktop đang chạy.

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
npm.cmd install
npm.cmd run db:up
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd run dev
```

Chỉ sao chép `.env` khi chưa có file cấu hình riêng. Mở http://127.0.0.1:5173.
Máy đã cài PostgreSQL trên Windows có thể thay `db:up` bằng `db:local:start` khi chưa dùng Docker.
Xem hướng dẫn bước 2 để kiểm tra hoặc dừng ứng dụng.

## Thử chức năng tài khoản

Mở đúng địa chỉ http://127.0.0.1:5173, chọn **Đăng ký**, nhập tên, email và mật khẩu từ 15 đến 128 ký tự.
Đăng ký thành công sẽ đăng nhập tự động. Vào **Hồ sơ cá nhân** để đổi tên hiển thị hoặc **Đăng xuất** để kết thúc phiên.
Mặc định `APP_ORIGIN` chỉ cho phép địa chỉ trên; nếu dùng `localhost` hoặc cổng khác, cần cập nhật cấu hình API tương ứng.

Đối với máy đã cài phiên bản bước 2, chạy `npm.cmd install`, `npm.cmd run db:deploy` và `npm.cmd run db:generate` để cập nhật trước khi chạy ứng dụng.

## Thử Workspace

Vào **Workspace**, tạo không gian rồi thêm email của tài khoản đã đăng ký. Người được thêm có thể đăng nhập, xem Workspace và mở **Thông báo**. Owner có thể sửa thông tin, cấp quyền Owner hoặc xóa thành viên; hệ thống giữ ít nhất một Owner.
Chi tiết API, lựa chọn nghiệp vụ và kiểm thử xem tài liệu bước 4.

## Thử Project

Mở Workspace → **Project**. Owner tạo dự án, chọn PM từ thành viên Workspace và xác nhận. PM đăng nhập để sửa dự án, thêm thành viên hoặc đóng dự án. Owner chỉ có quyền quản lý nội dung Project khi được phân công PM. Owner có thể chuyển PM cả sau khi đóng Project để chuyển giao trách nhiệm trước khi xóa thành viên khỏi Workspace.

## Thử Task

PM mở Project → **Task → Tạo Task**, nhập tiêu đề và chọn thành viên Project. Người được giao mở **My Tasks** hoặc **Thông báo** để xem công việc, chuyển lần lượt Cần làm → Đang làm → Chờ duyệt → Hoàn thành. Trong Project có cách xem Danh sách/Kanban, bộ lọc và phân trang. Owner chưa được phân công PM không có quyền quản lý Task.

Project còn Task chưa DONE không thể đóng. Thành viên còn Task chưa DONE phải được chuyển giao/bỏ phân công trước khi xóa khỏi Project/Workspace.

## Kiểm tra phiên bản đầu

Sau khi PostgreSQL chạy và migration đã được áp dụng, chạy lần lượt:

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run check:fresh-db
npm.cmd run test:e2e
```

Browser QA mặc định dùng Edge đã cài trên Windows, tự chạy API/web ở cổng 4011/5174. Không chạy generate/build cùng lúc với E2E vì API watch sẽ khởi động lại. `check:fresh-db` cần quyền tạo/xóa database và chỉ xóa database tạm do chính lệnh tạo. Chi tiết môi trường, báo cáo và giới hạn xem bước 7.

## Thử email và đặt lại mật khẩu

API phát triển mặc định dùng `MAIL_MODE=file`: email ghi ở `.local/mail`, không gửi thật. Chọn **Quên mật khẩu?** ở màn hình đăng nhập rồi chạy `npm.cmd run mail:preview -- ban@example.com` để xem email thử và mở liên kết. Liên kết dùng một lần, hết hạn 30 phút; đổi mật khẩu thu hồi mọi phiên đăng nhập cũ. Email mời được tạo sau khi thêm thành viên; Owner có thể **Gửi lại email mời** từ danh sách thành viên. Chi tiết cấu hình và giới hạn xem bước 8.
