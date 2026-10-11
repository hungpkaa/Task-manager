# Bước 11 — Kiểm chứng dữ liệu và bàn giao vận hành cục bộ

## Kết quả ngày 11/10/2026

Đã mở rộng kiểm tra cài đặt mới cho Capacity, Dashboard, Calendar và cấp System Admin đầu tiên. Bootstrap được thử ở chế độ xem trước, xác nhận không đổi quyền, cấp quyền trên tài khoản fixture rồi từ chối cấp lại. Không cấp quyền cho tài khoản thật.

Đã kiểm chứng sao lưu/khôi phục bằng PostgreSQL `pg_dump` dạng custom và `pg_restore` trong một transaction. Database nguồn và đích đều là database tạm của bài kiểm tra. Sau khôi phục, cả 19 bảng có cùng số dòng và hash dữ liệu, bao gồm attachment, bình luận/mention, Sprint, Capacity, thông báo và lịch sử migration. Ràng buộc deadline vẫn từ chối dữ liệu không hợp lệ.

## Chạy lại kiểm chứng

Yêu cầu PostgreSQL đang chạy, tài khoản cấu hình có quyền tạo/xóa database và công cụ client PostgreSQL tương thích với server. Trên Windows mặc định tìm công cụ ở `C:\Program Files\PostgreSQL\18\bin`; đặt `PG_BIN` nếu cài ở nơi khác. Trên hệ điều hành khác dùng công cụ trong PATH.

```powershell
npm.cmd run build
npm.cmd run check:fresh-db
npm.cmd run check:recovery
```

`check:recovery` đã bao gồm kiểm tra migration và luồng nghiệp vụ trên database mới. Không cần chạy cả hai nếu chỉ muốn kiểm chứng đầy đủ. Lệnh chỉ xóa database ngẫu nhiên do chính lần chạy tạo thành công. Archive fixture nằm trong thư mục tạm riêng và được dọn khi kết thúc. Nếu tiến trình bị tắt cưỡng bức, database/thư mục tạm có thể còn lại; kiểm tra tên và chủ sở hữu trước khi dọn thủ công.

## Quy trình sao lưu dữ liệu sử dụng thực tế

Quy trình dưới đây là hướng dẫn vận hành, chưa chạy trên dữ liệu người dùng trong đợt này.

1. Ghi nhận phiên bản mã nguồn và trạng thái migration. Dùng `npm.cmd run db:status` để kiểm tra schema đã cập nhật.
2. Chọn nơi lưu riêng có quyền truy cập giới hạn. Bản sao chứa email, hash mật khẩu, phiên đăng nhập và nội dung tệp đính kèm. Không đưa archive vào Git hoặc thư mục web được phục vụ công khai.
3. Dùng `pg_dump --format=custom --no-owner --no-acl --file <archive> --host <host> --port <port> --username <user> --dbname <database>`. Cung cấp mật khẩu qua cơ chế xác thực PostgreSQL; không ghi mật khẩu vào lệnh hoặc tài liệu.
4. Kiểm tra lệnh trả mã thành công và lưu checksum SHA-256 của archive. `pg_restore --list <archive>` kiểm tra danh mục; cần khôi phục thử để chứng minh bản sao sử dụng được.
5. Ghi riêng cấu hình cần thiết trong nơi lưu bí mật được quản lý: biến môi trường, APP_ORIGIN và cấu hình mail. Attachment hiện lưu trong database; hộp thư thử `.local/mail` và cấu hình môi trường không nằm trong bản dump.

## Quy trình khôi phục

1. Tạo database đích mới, không ghi đè database đang sử dụng. Khôi phục cùng phiên bản ứng dụng/schema của bản sao trước khi nâng cấp.
2. Chạy `pg_restore --exit-on-error --single-transaction --no-owner --no-acl --host <host> --port <port> --username <user> --dbname <database-moi> <archive>`. Kiểm tra mã kết thúc; không mở ứng dụng khi khôi phục thất bại.
3. Trỏ cấu hình của môi trường kiểm chứng vào database mới. Kiểm tra migration, đăng nhập, quyền Workspace/Project, Task, Sprint và tải attachment mẫu; đối chiếu số liệu với thời điểm sao lưu.
4. Bản sao phục hồi trạng thái phiên đăng nhập/token tại thời điểm sao lưu. Khi chuyển sang sử dụng thật, vận hành cần quyết định thu hồi phiên/token trước khi mở truy cập. Không tự chạy thao tác này trên database người dùng.
5. Chỉ chuyển ứng dụng sang database đích sau khi đã xác nhận kết quả. Giữ database cũ theo thời hạn lưu đã thống nhất để có đường quay lại.

## Phần tiếp theo cần môi trường thực tế

Kiểm chứng hiện dùng dữ liệu fixture nhỏ, chưa đo thời gian khôi phục ở dung lượng thực tế. Cần thống nhất nơi triển khai, nhà cung cấp email, lịch lưu/giữ bản sao và mục tiêu mất dữ liệu/thời gian khôi phục trước khi cấu hình production. Luồng gửi email hiện tiếp tục dùng hộp thư thử theo lựa chọn hiện tại.
