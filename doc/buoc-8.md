# Bước 8 — Cộng tác và tài khoản mở rộng

Trạng thái: đã hoàn thành phần 1, bình luận và @mention (UC25, mở rộng UC32). Bước 8 chưa hoàn thành toàn bộ: UC26 đính kèm tệp, email và UC04 đặt lại mật khẩu còn lại. Phạm vi tiếp tục dựa trên [đặc tả](sơ%20đồ.md), SEQ-F (image20) và ERD (image29).

## Phần 1: bình luận và mention

Trong chi tiết Task có phần Bình luận: thành viên Project gửi nội dung, chọn người được nhắc, xem lịch sử mới nhất trước và phân trang 20 bình luận. Người được nhắc nhận thông báo riêng tư và mở đúng Task qua Thông báo. Văn bản hiển thị bằng React, không thực thi HTML/script.

API qua controller → service → repository → PostgreSQL:

| API | Nội dung |
| --- | --- |
| `GET /api/tasks/:id/comments?page=1` | Danh sách, tổng số và `canPost` theo quyền hiện tại |
| `POST /api/tasks/:id/comments` | Nhận `{ "body": "..." }`, trả bình luận mới với tác giả và mentions |

Migration `20261010160000_comments` thêm `comments` và `comment_mentions`. Bình luận thuộc Task, tác giả tham chiếu User; `author_id` biểu diễn FK người viết (`user_id` trong ERD nguồn). Khóa ghép `(comment_id, user_id)` chống mention lặp. Xóa Task xóa bình luận/mention; xóa membership không xóa lịch sử tác giả.

Bình luận, mentions và thông báo lưu cùng transaction. Khóa Workspace giống các thao tác thành viên/Task để tránh cập nhật quyền xen giữa thao tác. Nếu tạo thông báo thất bại, toàn bộ bình luận/mentions rollback.

Các quyết định triển khai vì nguồn chưa nêu chi tiết:

- Quyền xem theo Task hiện tại; chỉ thành viên Project được gửi. Owner chưa thuộc Project được xem nhưng không gửi. System Admin không có quyền đọc/ghi vượt phạm vi.
- Project đã đóng chỉ đọc; Task DONE trong Project đang hoạt động vẫn có thể bình luận.
- Nội dung sau trim dài 1–5000 ký tự. DB có CHECK nội dung không rỗng/không quá 5000 ký tự.
- Người được mention phải đang ACTIVE và thuộc cùng Project; người không tồn tại/ngoài Project/bị khóa làm yêu cầu bị từ chối, không lưu dang dở.
- Chọn thành viên chèn ký hiệu `@{email}` vào nội dung để phân biệt rõ mention với văn bản thường. Backend phân tích ký hiệu này, chuẩn hóa email, loại trùng; không nhận danh sách người nhận do client tự chỉ định. Chuỗi `@tên` tự gõ chưa hỗ trợ gợi ý. Tối đa 20 người mỗi bình luận.
- Mention chính mình được lưu nhưng không phát thông báo cho chính mình. Bình luận không có mention không phát thêm thông báo cho mọi thành viên.
- Chưa thêm sửa/xóa bình luận, realtime hay trả lời theo luồng vì SEQ-F mô tả gửi/lưu/mention/thông báo và nguồn chưa quy định các thao tác đó.

## Kiểm chứng phần 1

- Build hai ứng dụng và TypeScript đạt.
- 24/24 kiểm thử tích hợp PostgreSQL đạt, gồm hai kịch bản mới về quyền/validate/lưu mentions và phân trang/rollback/lịch sử. Bộ kiểm thử độc lập database không đổi ở lượt này.
- 8/8 kiểm thử Edge đạt trên viewport 1440×1000 và 390×844: thành viên gửi bình luận có chuỗi HTML/script dạng văn bản, mention PM, tải lại xem dữ liệu, PM mở Task từ thông báo, Project đóng không có nút gửi; các luồng cũ vẫn chạy đạt.
- Database mới áp dụng đủ 6 migration và kiểm tra Comment/CommentMention, khóa ghép và CHECK đạt. Lệnh dọn database tạm sau kiểm tra.

Chạy lần lượt sau khi database phát triển đã hoạt động:

```powershell
npm.cmd run db:deploy
npm.cmd run build
npm.cmd run typecheck
npm.cmd run test:db
npm.cmd run check:fresh-db
npm.cmd run test:e2e
```

Điều kiện chạy E2E, fixture và giới hạn trình duyệt giữ như [bước 7](buoc-7.md). Ảnh mới `comments.png` nằm trong thư mục kết quả mỗi viewport dưới `.local/e2e-results`.

## Phần còn lại

Tiếp theo triển khai UC26 upload/download tệp với kiểm tra quyền theo Task và giới hạn tệp, sau đó tài khoản mở rộng/email. Email cần cấu hình nhà cung cấp khi tích hợp; không coi thông báo trong ứng dụng là đã gửi email. Sprint vẫn thuộc bước 9.
