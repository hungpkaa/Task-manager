# Hoàn thiện giao diện và thao tác

## Đợt 1 — Tổng quan và thông báo

- Tổng quan có ba lối vào nhanh: công việc cá nhân, Workspace và thông báo. Các thẻ chuyển trực tiếp tới màn hình tương ứng, hỗ trợ bàn phím và bố cục một cột trên điện thoại.
- Thông báo có thanh lọc/chuyển trang phía trên danh sách, trạng thái đã đọc/chưa đọc bằng chữ, thời gian Việt Nam và các thao tác đặt cùng một hàng khi đủ chiều rộng.
- Lịch sử dài cuộn trong danh sách để các điều khiển không bị đẩy xuống cuối 50 mục. Giao diện vẫn giữ phân trang và tự chuyển trang khi đọc hết trang cuối của bộ lọc chưa đọc.
- Kiểm chứng bằng build/typecheck và các luồng E2E desktop/mobile; bài kiểm tra lịch sử thông báo sử dụng lối vào nhanh mới.

Các cải tiến tiếp theo nên tập trung vào thao tác Task/Project và chuẩn bị dữ liệu demo theo nhu cầu sử dụng, dựa trên luồng đã triển khai trong bảng đối chiếu Use Case.
