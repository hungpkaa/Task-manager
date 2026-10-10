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

Tệp đính kèm, đặt lại mật khẩu, Sprint, Calendar và Dashboard phân tích chưa hoàn thiện. Xem [bảng Use Case](doi-chieu-use-case.md) để biết phạm vi hiện tại và [bước 8](buoc-8.md) để kiểm tra phần cộng tác.
