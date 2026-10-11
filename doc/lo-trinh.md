# Bước 1 — Phạm vi và lộ trình triển khai

## Mục tiêu

Xây dựng ứng dụng web để nhóm tạo không gian làm việc, quản lý dự án, phân công công việc và theo dõi tiến độ. Tài liệu nghiệp vụ gốc là [đặc tả hệ thống](sơ%20đồ.md); lộ trình này chia việc triển khai thành các phần có thể chạy và kiểm chứng độc lập.

Phạm vi đích là đủ 52 Use Case trong đặc tả. Phiên bản đầu bên dưới là mốc trung gian do chia thứ tự triển khai, không thay thế hoặc cắt bớt yêu cầu gốc. Theo dõi từng chức năng tại [bảng đối chiếu Use Case](doi-chieu-use-case.md); hoàn thành một bước không đồng nghĩa hoàn thành toàn bộ module liên quan.

## Nền tảng

- Công nghệ được người dùng chọn: React + Node.js + PostgreSQL.
- Mặc định triển khai: TypeScript cho frontend và backend; React với Vite; Express cho REST API; Prisma cho truy cập dữ liệu và migration.
- Một repository gồm `apps/web` và `apps/api`, quản lý bằng npm workspaces. PostgreSQL chạy cục bộ qua Docker Compose; cấu hình kết nối qua biến môi trường, cung cấp `.env.example` không chứa bí mật.
- API đi qua controller, service và lớp truy cập dữ liệu. Quyền truy cập và quy tắc nghiệp vụ được kiểm tra ở backend.
- Không cố định phiên bản dependency ở bước tài liệu; chọn phiên bản tương thích và lưu lockfile khi khởi tạo.
- Triển khai và kiểm chứng tại máy trước; chưa đưa lên dịch vụ hosting ở bước này.

## Phiên bản đầu tiên

Một người dùng có thể đăng ký, đăng nhập, tạo Workspace, thêm người dùng đã đăng ký vào Workspace, tạo Project, chọn Project Manager, thêm thành viên Project và quản lý Task qua danh sách hoặc Kanban.

Task hỗ trợ tiêu đề, mô tả, một người phụ trách hoặc chưa phân công, priority, ngày bắt đầu, deadline và các trạng thái `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`. PM quản lý Task; Member có quyền phù hợp cập nhật trạng thái. Người được phân công phải thuộc Project; deadline không trước ngày bắt đầu.

Giao diện dùng tiếng Việt và hỗ trợ màn hình máy tính, điện thoại. Dữ liệu lưu ở PostgreSQL, tồn tại sau khi khởi động lại ứng dụng.

Chưa đưa vào phiên bản đầu: email mời và đặt lại mật khẩu, upload tệp, mention, Calendar, quản trị hệ thống, Scrum đầy đủ và phân tích điều phối. Đây là chức năng của các giai đoạn tiếp theo, không bị loại khỏi đặc tả.

## Các bước thực hiện

| Bước | Nội dung | Điều kiện hoàn thành |
| --- | --- | --- |
| 1 | Phạm vi, công nghệ, thứ tự thực hiện | Có tài liệu này và README dẫn đến đặc tả; chưa tạo ứng dụng |
| 2 | Khởi tạo frontend, backend và PostgreSQL | Có hướng dẫn chạy, trang React kết nối API, kiểm tra sức khỏe API và kết nối DB; build/typecheck thành công |
| 3 | Tài khoản và xác thực | Đăng ký, đăng nhập, đăng xuất, hồ sơ; hash mật khẩu; bảo vệ API và xử lý phiên hết hạn |
| 4 | Workspace và thành viên (UC06–UC11) | Tạo/cập nhật Workspace; người tạo là Owner; mời/xóa thành viên, quản lý vai trò, xem danh sách; không trùng membership; kiểm tra quyền; thông báo trong ứng dụng cho UC08 |
| 5 | Project và quyền theo Project | Owner tạo Project, chỉ định PM; quản lý thành viên; chặn truy cập ngoài phạm vi |
| 6 | Task, danh sách và Kanban | CRUD, phân công, priority, ngày tháng, cập nhật trạng thái và lọc; dữ liệu lưu bền vững |
| 7 | Hoàn thiện phiên bản đầu | Kiểm thử luồng nhóm hoàn chỉnh, quyền truy cập, lỗi nhập liệu và bố cục responsive; bổ sung hướng dẫn sử dụng |
| 8 | Cộng tác và tài khoản mở rộng | Bình luận, mention, attachment, thông báo, email mời và đặt lại mật khẩu |
| 9 | Agile/Scrum | Backlog, vòng đời Sprint, Daily Update, Review, Retrospective và xử lý Task chưa hoàn thành |
| 10 | Điều phối, báo cáo và quản trị | Effort/Capacity, dependency không chu trình, Workload, Risk, Recommendation, Dashboard, Calendar và System Admin |

Mỗi bước cập nhật trạng thái thực tế và hướng dẫn kiểm chứng. Chỉ đánh dấu hoàn thành khi đã có bằng chứng chạy hoặc kiểm tra phù hợp; không coi sơ đồ hay màn hình mẫu là tính năng đã triển khai.

Các Use Case phụ thuộc thông báo, dependency hoặc phân tích cần được kiểm chứng lại khi tích hợp phần phụ thuộc. UC23 chưa đầy đủ nếu thiếu kiểm tra dependency; các luồng Sprint có cảnh báo/Capacity cũng chưa đầy đủ nếu chỉ có CRUD Sprint.

## Kiểm chứng phiên bản đầu

- Luồng thành công: hai tài khoản → Workspace → Project → phân công PM → thêm thành viên → tạo/giao Task → cập nhật trạng thái → tải lại trang và xác nhận dữ liệu.
- Phân quyền: người ngoài Workspace/Project không đọc hoặc sửa dữ liệu bằng cách thay ID; Member không thực hiện thao tác chỉ dành cho Owner/PM.
- Dữ liệu: từ chối email trùng, membership trùng, assignee ngoài Project, trạng thái không hợp lệ và deadline trước ngày bắt đầu.
- Trải nghiệm: có trạng thái đang tải, rỗng, lỗi; thông báo rõ khi API hoặc DB không hoạt động.
- Kỹ thuật: build/typecheck hai ứng dụng, kiểm thử tích hợp các luồng xác thực và quyền, kiểm tra migration trên DB mới.

## Điểm cần chốt ở giai đoạn tương ứng

Cơ chế phiên đăng nhập đã chốt ở bước 3: token ngẫu nhiên trong cookie HttpOnly, hash token lưu PostgreSQL, thời hạn cố định 7 ngày. Chính sách xóa thành viên đang giữ vai trò PM hoặc có Task được chốt ở bước 4–5 trước khi triển khai thao tác xóa. Nhà cung cấp email, nơi lưu tệp và ngưỡng đánh giá Risk/Recommendation được chốt khi bắt đầu bước tương ứng.

Trạng thái hiện tại: các bước 1–8 đã hoàn thành trong phạm vi ghi nhận; email bước 8 dùng hộp thư thử theo lựa chọn của nhóm, chưa gửi thật. Bước 9 đã có Backlog/kế hoạch, bắt đầu/theo dõi/kết thúc Sprint, Daily Update, Review và Retrospective; UC19 chọn Sprint khi tạo Task chưa tích hợp. Bước 9–10 chưa hoàn thành. Xem [kết quả nghiệm thu bước 7](buoc-7.md), [tiến độ bước 8](buoc-8.md), [tiến độ bước 9](buoc-9.md), [hướng dẫn sử dụng](huong-dan-su-dung.md) và bảng đối chiếu để biết các phần còn lại.
