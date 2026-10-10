# Hướng dẫn sử dụng phiên bản đầu

Mở http://127.0.0.1:5173 sau khi ứng dụng và PostgreSQL đã chạy theo README. Nhóm có thể dùng ba tài khoản riêng để thử Owner, Project Manager (PM) và Member. Mỗi người đăng ký tên, email và mật khẩu 15–128 ký tự; dùng cửa sổ riêng hoặc đăng xuất khi đổi tài khoản.

## Tạo nhóm và dự án

1. Owner vào **Workspace**, tạo không gian làm việc. Người tạo tự trở thành Owner.
2. Mở Workspace và thêm email các tài khoản đã đăng ký. Người được thêm xem **Thông báo** và Workspace của mình. Phiên bản này chưa gửi email mời cho người chưa có tài khoản.
3. Owner mở **Project**, tạo dự án rồi chọn và xác nhận PM từ thành viên Workspace.
4. PM mở Project, thêm thành viên từ Workspace vào dự án. Vai trò Owner của Workspace không tự cấp quyền quản lý Task; muốn quản lý nội dung dự án cần được phân công PM.

## Giao và xử lý công việc

PM mở Project → **Task → Tạo Task**. Nhập tiêu đề, mô tả, priority, ngày bắt đầu/deadline và effort nếu cần; chọn người phụ trách thuộc Project hoặc để chưa phân công. Deadline phải từ ngày bắt đầu trở đi.

Người được giao mở **My Tasks** hoặc **Thông báo** để vào chi tiết. Người phụ trách và PM có thể chuyển tuần tự **Cần làm → Đang làm → Chờ duyệt → Hoàn thành**. PM sửa thông tin, phân công lại hoặc xóa với xác nhận. Nếu dependency chưa hoàn thành, hệ thống cảnh báo và yêu cầu xác nhận tiếp tục; giao diện quản lý dependency thuộc giai đoạn sau.

Trong Project, đổi giữa **Danh sách/Kanban**, tìm kiếm hoặc lọc theo trạng thái, priority, người phụ trách; bấm **Áp dụng** để cập nhật. Danh sách và Kanban cùng dùng dữ liệu phân trang: dùng Trang trước/Trang sau để xem đủ công việc. Trên điện thoại, cuộn ngang bên trong Kanban để xem các cột còn lại.

## Chuyển giao và kết thúc

Task chưa Hoàn thành phải được chuyển giao hoặc bỏ phân công trước khi xóa thành viên khỏi Project/Workspace. Thành viên đang là PM phải được thay PM trước khi xóa khỏi Workspace. Workspace luôn giữ ít nhất một Owner.

PM chỉ đóng Project khi mọi Task đã DONE. Dự án đóng và Task bên trong chỉ đọc; Owner vẫn có thể đổi PM để chuyển giao trách nhiệm. Lịch sử người phụ trách của Task đã hoàn thành được giữ lại.

## Điều hướng và xử lý lỗi

Bấm **Workspace** hoặc **My Tasks** ở menu để về danh sách, kể cả khi đang xem chi tiết. Tải lại trang giữ phiên đăng nhập nhưng không giữ đường dẫn chi tiết; ứng dụng hiện điều hướng bằng trạng thái trong trang. **Hồ sơ cá nhân** cho phép đổi tên hiển thị; **Đăng xuất** thu hồi phiên hiện tại.

Nếu lỗi mạng, kiểm tra API/PostgreSQL rồi bấm **Thử lại** nơi có nút. Khi phiên hết hạn, đăng nhập lại. Nếu thao tác bị từ chối do quyền hoặc dữ liệu đã đổi, tải lại danh sách và liên hệ Owner/PM của nhóm để chuyển giao đúng vai trò.

Trong chi tiết Task, thành viên Project có thể nhập **Nội dung bình luận**, chọn **Nhắc thành viên (@mention)** rồi **Gửi bình luận**. Người được nhắc nhận thông báo và mở Task từ đó. Chọn thành viên sẽ chèn `@{email}` vào nội dung; giữ ký hiệu này để gửi mention. Có thể gửi bình luận không mention; lịch sử mới nhất trước, 20 bình luận mỗi trang. Project đã đóng chỉ cho xem lịch sử.

Trong chi tiết Task → **Tệp đính kèm**, chọn tệp rồi **Đính kèm tệp**. Mỗi tệp có nội dung và tối đa 10 MB; hỗ trợ PDF, PNG/JPG, TXT, CSV, MD, ZIP, DOCX/XLSX/PPTX. Bấm **Tải xuống** để lưu về máy. Người tải lên hoặc PM có thể **Xóa tệp** với xác nhận; bấm Hủy giữ lại tệp. Tải lại trang vẫn xem và tải xuống được tệp đã lưu. Project đóng chỉ cho tải xuống, không tải lên/xóa; người ngoài Project không tự có quyền từ đường dẫn tệp.

Nếu quên mật khẩu, ở màn hình đăng nhập chọn **Quên mật khẩu?**, nhập email tài khoản và gửi yêu cầu. Hiện email đi vào hộp thư thử cục bộ: người chạy dự án dùng `npm.cmd run mail:preview -- email-cua-ban@example.com` để xem rồi mở liên kết. Nhập và xác nhận mật khẩu mới 15–128 ký tự; đổi xong đăng nhập lại. Mọi phiên cũ bị thu hồi. Liên kết dùng một lần/30 phút; khi cần yêu cầu lại, chờ ít nhất 60 giây và dùng email mới nhất. Nếu tải lại form reset, mở lại liên kết từ email.

Thêm thành viên Workspace cũng tạo email mời trong hộp thư thử. Owner có thể **Gửi lại email mời**; gửi lại không thêm thành viên lần nữa. Nếu tạo email lỗi, thông báo và thành viên đã thêm vẫn còn. Chế độ thử chưa gửi đến hộp thư Internet.

Trong Project, bấm **Mở Sprint & Backlog**. PM nhập tên, Sprint Goal và ngày để **Tạo Sprint PLANNED**; chọn Task từ **Product Backlog** → **Kiểm tra kế hoạch** → đọc cảnh báo → **Xác nhận đưa vào Sprint**. Chuyển **Sprint Backlog** để xem hoặc đưa Task về Product Backlog trước khi Sprint bắt đầu; thao tác đưa về cần xác nhận. Thành viên và Owner xem được nhưng chỉ PM lập kế hoạch. Task/Sprint phân trang 20; lựa chọn Task chỉ giữ trên trang hiện tại. Khi sửa Task ở khu vực Task, bấm **Tải lại Sprint & Backlog** để lấy dữ liệu mới.

Phần kế hoạch hiện chưa tính Capacity/Workload; cảnh báo ghi rõ để PM tự kiểm tra năng lực nhóm. Chưa có bắt đầu/kết thúc Sprint, Daily, Review, Retro. Sprint, Calendar và Dashboard phân tích chưa hoàn thiện. Xem [bảng Use Case](doi-chieu-use-case.md), [bước 8](buoc-8.md) và [bước 9](buoc-9.md) để biết phạm vi hiện tại.
