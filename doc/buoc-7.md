# Bước 7 — Nghiệm thu phiên bản đầu

Đã hoàn thành nghiệm thu trong phạm vi phiên bản đầu của [lộ trình](lo-trinh.md). Căn cứ nghiệp vụ vẫn là đặc tả và [bảng 52 Use Case](doi-chieu-use-case.md); các phần ghi Cơ bản/Chưa triển khai vẫn cần hoàn thành ở bước sau.

## Thay đổi

- Sửa điều hướng Workspace/My Tasks: bấm lại mục điều hướng khi đang ở chi tiết sẽ trở về danh sách, xóa lựa chọn cũ.
- Gom các mục điều hướng vào một nhóm; sidebar máy tính giữ trong vùng nhìn và có thể cuộn khi cần.
- Cho tiêu đề, thao tác, ngày tháng và điều hướng xuống dòng trên màn hình nhỏ; tăng vùng bấm tối thiểu 44px cho các nút chính. Kanban cuộn ngang bên trong, trang không bị tràn ngang.
- Thêm Playwright, kiểm tra migration trên database mới và [hướng dẫn nhóm](huong-dan-su-dung.md).

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Build frontend/backend và TypeScript | Đạt |
| Backend độc lập database | 14/14 đạt |
| Tích hợp PostgreSQL thực | 22/22 đạt |
| Browser QA | 8/8 đạt: 4 kịch bản × 2 viewport |
| Database mới | Áp dụng đủ 5 migration; tạo Workspace/Project/Task, thông báo và kiểm tra CHECK ngày tháng đạt |

Môi trường: Windows, Node.js 24.20.0, PostgreSQL cục bộ, Playwright 1.64.0 và Edge headless. Viewport máy tính 1440×1000, điện thoại 390×844 có touch. Không dùng mock API cho luồng thành công.

Các kịch bản trình duyệt:

1. Ba tài khoản Owner/PM/Member: đăng ký → Workspace → thêm thành viên → Project → chỉ định PM → thêm thành viên Project → giao Task → mở từ Thông báo/My Tasks → cập nhật tuần tự đến DONE → tải lại → Kanban/lọc → đóng Project. Kiểm tra Owner chưa là PM không có nút tạo Task, Member không sửa metadata, Project còn Task chưa DONE không đóng được và Project đã đóng chỉ đọc.
2. Mật khẩu xác nhận sai, sửa hồ sơ và tải lại, lỗi mạng khi tải Workspace và thử lại, trạng thái rỗng, đăng xuất và tải lại.
3. Cho phiên thử nghiệm hết hạn trong PostgreSQL, xác nhận UI trở về đăng nhập với thông báo rõ ràng và không phục hồi phiên khi tải lại.
4. Danh sách 21 Task: sắp xếp, phân trang, chặn deadline trước ngày bắt đầu, lưu đúng, hủy/xác nhận xóa và quay về trang hợp lệ; điều hướng bằng bàn phím và quay lại danh sách Workspace.

Theo dõi lỗi runtime chưa được xử lý và kiểm tra trang không tràn ngang trong các luồng chính. Backend kiểm chứng sâu hơn về truy cập ngoài phạm vi bằng ID, thao tác đồng thời và rollback; không phải mọi trường hợp đó đều được lặp lại trên UI.

## Chạy lại

Đảm bảo `.env` API trỏ đến database phát triển có thể dùng cho kiểm thử, PostgreSQL đang chạy, migration đã deploy. Chạy từ thư mục gốc, lần lượt:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run check:fresh-db
npm.cmd run test:e2e
```

E2E nhập mã API đã build để tạo/kiểm tra dữ liệu thử, vì vậy cần build trước. Lệnh tự chạy/dừng API ở 4011 và Vite ở 5174; không dừng ứng dụng phát triển ở 4000/5173. Hai cổng thử phải rảnh. Không sinh Prisma Client hoặc build trong lúc E2E chạy vì API watch có thể khởi động lại.

Mặc định dùng Edge đã cài; để dùng Chrome đã cài, đặt `$env:E2E_BROWSER_CHANNEL='chrome'` trước lệnh. Chưa kiểm chứng Chrome trong lượt này. Khi đặt `WEB_URL`, bộ kiểm thử dùng dịch vụ do bạn tự chạy, không tự khởi động server; API origin và database phải khớp cấu hình kiểm thử.

E2E dùng email ngẫu nhiên `e2e-...@example.invalid`, chỉ dọn Project/Workspace/tài khoản của lượt thử. Không chạy với database production. Nếu tiến trình bị dừng cưỡng bức, fixture có thể còn lại và cần kiểm tra trước khi dọn thủ công. `check:fresh-db` cần role có quyền CREATE/DROP DATABASE, tạo tên ngẫu nhiên `task_manager_migration_check_...` và chỉ xóa database do chính lượt gọi tạo, cả khi kiểm tra lỗi; không sửa `.env`.

Báo cáo HTML: `.local/e2e-report/index.html`, mở bằng `npm.cmd run test:e2e:report`. Ảnh luồng thành công và ảnh/trace khi lỗi nằm trong `.local/e2e-results`; các artifact không commit và được thay bằng kết quả lượt chạy tiếp theo.

## Giới hạn và phần tiếp theo

Đây là kiểm tra Edge ở kích thước điện thoại, chưa kiểm tra thiết bị thật, Safari/Firefox, toàn bộ accessibility, tải lớn hay triển khai production. Google Fonts bị chặn trong E2E để kiểm tra bằng font dự phòng và tránh phụ thuộc mạng ngoài; tải font từ CDN chưa được kiểm chứng.

`npm audit` ở lượt này báo 4 mục mức high trong chuỗi dependency Prisma CLI (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). Chưa xử lý bằng hạ Prisma major hoặc `audit fix --force`; cần đánh giá bản cập nhật tương thích trước khi phát hành. Driver PostgreSQL cũng in cảnh báo deprecation về query đồng thời; các kiểm thử vẫn đạt, cần theo dõi khi nâng driver.

Bước 8 tiếp theo: bình luận/mention, attachment, thông báo mở rộng, email mời và đặt lại mật khẩu. Sprint, Dashboard, Calendar và điều phối vẫn theo bước 9–10; nghiệm thu này không đổi trạng thái những Use Case chưa triển khai.
