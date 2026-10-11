# Hoàn thiện giao diện và thao tác

## Đợt 1 — Tổng quan và thông báo

- Tổng quan có ba lối vào nhanh: công việc cá nhân, Workspace và thông báo. Các thẻ chuyển trực tiếp tới màn hình tương ứng, hỗ trợ bàn phím và bố cục một cột trên điện thoại.
- Thông báo có thanh lọc/chuyển trang phía trên danh sách, trạng thái đã đọc/chưa đọc bằng chữ, thời gian Việt Nam và các thao tác đặt cùng một hàng khi đủ chiều rộng.
- Lịch sử dài cuộn trong danh sách để các điều khiển không bị đẩy xuống cuối 50 mục. Giao diện vẫn giữ phân trang và tự chuyển trang khi đọc hết trang cuối của bộ lọc chưa đọc.
- Kiểm chứng bằng build/typecheck và các luồng E2E desktop/mobile; bài kiểm tra lịch sử thông báo sử dụng lối vào nhanh mới.

Các cải tiến tiếp theo nên tập trung vào thao tác Task/Project và chuẩn bị dữ liệu demo theo nhu cầu sử dụng, dựa trên luồng đã triển khai trong bảng đối chiếu Use Case.

## Đợt 2 — Hệ giao diện xanh lá

Hệ màu, bo góc, bóng đổ và cỡ chữ dùng chung được khai báo trong `theme.css`, áp dụng sau các kiểu bố cục hiện có. Dashboard, Workspace, Project, Sprint, hồ sơ và cộng tác dùng cùng kiểu thẻ/biểu mẫu; điều hướng và nút có kích thước dễ đọc, dễ chạm hơn.

Task có nhãn chữ và màu cho trạng thái/ưu tiên, cùng Effort trên thẻ danh sách và Kanban. Form chia thành thông tin chung, lịch trình, ưu tiên/ước lượng; thang điểm vẫn là 1, 2, 3, 5, 8 hoặc chưa đặt. Không đổi API, schema hay quy tắc nghiệp vụ.

Kiểm tra giao diện gồm ảnh Tổng quan, form Task, danh sách, Kanban và thông báo trên desktop/mobile, xác nhận Effort và nhãn màu trong luồng E2E. Hiệu ứng tôn trọng tùy chọn giảm chuyển động; nhãn màu luôn có chữ và focus bàn phím rõ.

Đã sửa khóa React trùng giữa bình luận và attachment, tránh khối bình luận bị lặp khi quay về danh sách Task. Kiểm thử luồng nhóm xác nhận Kanban không còn khối bình luận ở ngoài chi tiết.

## Đợt 3 — Tổng quan và Task theo bố cục dashboard

Tổng quan thu gọn lời chào và thao tác nhanh. Bốn thẻ số liệu dùng dữ liệu thật: tổng Task, đang làm, quá hạn, hoàn thành. Desktop hiển thị công việc cần chú ý cạnh biểu đồ vòng phân bố bốn trạng thái; mobile chuyển một cột. Biểu đồ có mô tả bằng chữ và không hiện vòng tiến độ khi chưa có Task. Giải thích cách tính và trạng thái kết nối đặt trong các khối mở rộng.

Danh sách Task có các cột thông tin trên desktop, chuyển thành thẻ trên mobile. Kanban có cột màu, avatar chữ cái và các thông tin công việc; số lượng vẫn tính trên trang kết quả hiện tại. Bộ lọc luôn hiện tìm kiếm/trạng thái, giữ lựa chọn nâng cao khi tải lại danh sách. Xóa bộ lọc đặt lại toàn bộ điều kiện, cách sắp xếp và trang 1. Chi tiết và các khối cộng tác được phân chia rõ; điều hướng/chế độ xem có SVG đồng bộ.

Kiểm thử bổ sung xác nhận biểu đồ với bốn Task ở bốn trạng thái (25% hoàn thành), lỗi mạng/tải lại, trạng thái đang tải, tiêu đề dài trên điện thoại, mở chi tiết và quay lại Dashboard, cùng xóa bộ lọc từ trang 2. Backend và schema không thay đổi.
