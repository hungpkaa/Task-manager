# Bước 8 — Cộng tác và tài khoản mở rộng

Trạng thái: đã hoàn thành phần 1 (bình luận/@mention, UC25) và phần 2 (đính kèm tệp, UC26), mở rộng UC32. Bước 8 chưa hoàn thành toàn bộ: email và UC04 đặt lại mật khẩu còn lại. Phạm vi tiếp tục dựa trên [đặc tả](sơ%20đồ.md), SEQ-F (image20) và ERD (image29).

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

## Phần 2: tệp đính kèm (UC26)

Trong chi tiết Task có phần Tệp đính kèm: chọn tệp, tải lên, xem tên/dung lượng/người tải lên, tải xuống và xóa với xác nhận. Danh sách phân trang 20 tệp, mới nhất trước. Tải xuống đi qua API có session và kiểm tra quyền; không cung cấp URL tệp công khai.

| API | Nội dung |
| --- | --- |
| `GET /api/tasks/:id/attachments?page=1` | Danh sách metadata, tổng số, `canUpload`/`canDelete`; không trả nội dung tệp |
| `POST /api/tasks/:id/attachments` | Nội dung binary `application/octet-stream`, header `X-Filename` là tên tệp mã hóa `encodeURIComponent` |
| `GET /api/tasks/:id/attachments/:attachmentId/download` | Kiểm tra Task và attachment khớp nhau, tải nội dung |
| `DELETE /api/tasks/:id/attachments/:attachmentId` | Người tải lên hoặc PM xóa tệp trong Project còn hoạt động |

Migration `20261010170000_task_attachments` tạo bảng theo ERD: ID, FK Task, `uploaded_by` tham chiếu User, tên/dung lượng/thời điểm và nội dung `BYTEA`. Nội dung và metadata lưu/xóa cùng transaction PostgreSQL, không có tệp ngoài database cần dọn. Xóa Task cascade cả nội dung; xóa membership giữ lịch sử người tải lên. Backup database bao gồm nội dung tệp.

Lựa chọn triển khai vì nguồn chưa quy định nơi lưu, giới hạn và quyền xóa:

- Lưu PostgreSQL phù hợp phiên bản phát triển hiện tại, không cần tài khoản dịch vụ ngoài. Khi số lượng/dung lượng tăng, cần đánh giá chuyển nội dung sang object storage; database/backup sẽ tăng theo tệp.
- Tệp có nội dung, tối đa 10 MiB (10.485.760 byte), mỗi lần một tệp. Chấp nhận phần mở rộng PDF, PNG/JPG/JPEG, TXT, CSV, MD, ZIP, DOCX/XLSX/PPTX. Đây là kiểm tra phần mở rộng, chưa kiểm tra magic bytes/virus hoặc giải nén/preview.
- Backend kiểm tra session, Origin và quyền trước khi đọc binary; giới hạn request 10 MiB, không nhận Content-Encoding. Kiểm tra lại membership/Project trong transaction sau khi nhận tệp để xử lý quyền thay đổi trong lúc tải lên.
- Thành viên Project tải lên; người có quyền xem Task được xem/tải xuống, gồm Owner theo quyền đọc hiện tại. Owner chưa thuộc Project không tải lên/xóa. Người tải lên hoặc PM, đang thuộc Project, được xóa. Project đóng chỉ cho xem/tải xuống, kể cả PM không sửa/xóa.
- Tên tệp tối đa 255 ký tự, chuẩn hóa Unicode; từ chối đường dẫn, ký tự điều khiển, tên ẩn và đuôi không hỗ trợ. Không dùng tên người dùng cung cấp làm đường dẫn filesystem.
- Download luôn `Content-Disposition: attachment`, `application/octet-stream`, `nosniff` và `no-store`; trình duyệt tải tệp, không preview nội dung trong ứng dụng. Tệp chưa được quét virus, người dùng vẫn cần kiểm tra trước khi mở.
- DB CHECK dung lượng dương/không quá giới hạn và khớp `octet_length(data)`, cùng FK/cascade. Không thêm sự kiện thông báo cho mọi lần upload vì nguồn chưa quy định người nhận.

### Kiểm chứng phần 2

Build/TypeScript đạt. 14/14 kiểm thử backend độc lập database và 27/27 kiểm thử PostgreSQL đạt. Ba kịch bản tích hợp mới xác nhận bytes và tên Unicode, metadata không chứa bytes, quyền đọc/xóa và ID Task không khớp, Origin/MIME/encoding/tên/dung lượng sai, CHECK dữ liệu, thao tác đồng thời với xóa membership, lịch sử Project đóng và cascade Task.

8/8 kiểm thử browser QA đạt, bổ sung upload → hủy/xác nhận xóa → upload tệp giữ lại → download và đối chiếu từng byte → tải lại → Project đóng vẫn download, không có upload/xóa. Đợt này phát hiện và sửa min-width mặc định của fieldset trong form bình luận gây tràn ngang trên điện thoại. Kết quả và artifact dùng cùng bộ E2E bước 7; kiểm tra Edge với viewport máy tính/điện thoại, không thay thế thiết bị thật. Database mới đã áp dụng đủ 7 migration, đọc/ghi attachment và CHECK đạt.

Chạy lại theo các lệnh phía trên. Không cần cài thêm dependency hoặc cấu hình nơi lưu tệp; `db:deploy` cập nhật bảng mới. Ảnh `comments.png` cuối luồng hiện bao gồm phần đính kèm của Task đã đóng.

## Phần còn lại

Tiếp theo là tài khoản mở rộng/UC04 và email. Email cần cấu hình nhà cung cấp khi tích hợp; không coi thông báo trong ứng dụng là đã gửi email. Sprint vẫn thuộc bước 9.
