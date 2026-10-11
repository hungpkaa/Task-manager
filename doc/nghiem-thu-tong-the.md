# Rà soát nghiệm thu tổng thể

Mốc rà soát: 11/10/2026. Các nhóm chức năng của bước 10 đã được triển khai trong môi trường cục bộ. Phạm vi chi tiết vẫn theo [bảng đối chiếu Use Case](doi-chieu-use-case.md), không coi số lượng bài kiểm thử là chứng nhận đầy đủ mọi nhánh của 52 Use Case.

## Phần bổ sung từ rà soát

UC32 trước đây chỉ trả 50 thông báo mới nhất. Đã thêm lịch sử phân trang 50 mục, bộ lọc tất cả/chưa đọc và tổng số chưa đọc trên toàn bộ lịch sử. Khi đọc mục cuối của trang cuối trong bộ lọc chưa đọc, giao diện tự chuyển về trang hợp lệ. API kiểm tra truy vấn, giữ phạm vi người dùng và sắp xếp ổn định khi thời gian tạo trùng nhau; đánh dấu đã đọc nhiều lần không đổi thời điểm đọc ban đầu.

## Phạm vi bàn giao

| Nhóm | Phạm vi hiện có |
| --- | --- |
| Tài khoản | Đăng ký, đăng nhập/đăng xuất, đổi tên hiển thị, đặt lại mật khẩu qua hộp thư thử |
| Workspace / Project | Thành viên, quyền Owner/PM, vòng đời và dữ liệu được lưu PostgreSQL |
| Task / cộng tác | Trạng thái, giao việc, bình luận/mention, tệp đính kèm, phụ thuộc, thông báo |
| Scrum | Backlog, lập kế hoạch, bắt đầu/hoàn thành Sprint, tiến độ |
| Bước 10 | Capacity/Workload, Risk, gợi ý người nhận, Calendar, Dashboard cá nhân/Project, System Admin |

## Giới hạn cần giữ rõ

- Hồ sơ chỉ sửa tên hiển thị; chưa có luồng đổi email.
- Email dùng hộp thư thử theo lựa chọn hiện tại. Cần cấu hình và kiểm chứng nhà cung cấp trước khi gửi thật.
- Risk và gợi ý người nhận dùng quy tắc đã ghi trong tài liệu bước 10; PM quyết định giao việc.
- Bootstrap System Admin là thao tác vận hành riêng. Chưa cấp quyền cho tài khoản thật trong đợt kiểm thử.
- Nghiệm thu cục bộ chưa thay thế triển khai production, kiểm chứng sao lưu/khôi phục hay kiểm thử tải.

## Kiểm chứng

Build và typecheck thành công. Kiểm thử API đạt 56/56 bài, gồm kiểm tra lịch sử thông báo, riêng tư, truy vấn không hợp lệ và thao tác đọc lặp lại. Kiểm thử trình duyệt đạt 16/16 bài trên desktop và mobile, gồm lịch sử thông báo và các luồng Workspace/Project/Task, cộng tác, Sprint và quản trị.
