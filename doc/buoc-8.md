# Bước 8 — Cộng tác và tài khoản mở rộng

Trạng thái: đã hoàn thành các phần của bước 8 trong môi trường cục bộ: bình luận/@mention (UC25), đính kèm tệp (UC26), quên/đặt lại mật khẩu (UC04), email mời Workspace và mở rộng UC32. Theo lựa chọn của nhóm, email dùng hộp thư thử; chưa gửi email thật. Phạm vi tiếp tục dựa trên [đặc tả](sơ%20đồ.md), SEQ-F (image20) và ERD (image29).

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

## Phần 3: quên/đặt lại mật khẩu và email

Chọn **Quên mật khẩu?** ở màn hình đăng nhập, nhập email và gửi liên kết. Mở liên kết trong email, nhập mật khẩu mới và xác nhận. Đổi thành công trở về đăng nhập; tất cả phiên cũ bị thu hồi. Token nằm trong URL fragment `#reset=...`, không gửi qua query string; React đọc vào bộ nhớ rồi xóa fragment khỏi thanh địa chỉ. Nếu tải lại khi đang điền mật khẩu mới, mở lại liên kết từ email.

| API | Nội dung |
| --- | --- |
| `POST /api/auth/password/forgot` | Nhận `{email}`, phản hồi 202 chung cho email ACTIVE, không tồn tại, bị khóa hoặc đang trong thời gian chờ |
| `POST /api/auth/password/reset` | Nhận `{token,password}`, đổi mật khẩu và thu hồi toàn bộ session/token của tài khoản trong cùng transaction |
| `POST /api/workspaces/:id/members/:userId/email` | Owner gửi lại email mời cho thành viên ACTIVE đã tồn tại; không thêm membership/notification trùng |

Migration `20261010180000_password_reset_tokens` thêm bảng theo ERD, chứa FK User, hash SHA-256 của token ngẫu nhiên 32 byte, thời hạn và thời điểm tạo. Không lưu token nguyên bản trong database hay phản hồi API. Email thử chứa liên kết thật của môi trường phát triển nên cần giữ ngoài Git và thư mục public.

Các quyết định bổ sung khi nguồn chưa nêu chi tiết:

- Liên kết dùng một lần, hết hạn 30 phút. Yêu cầu mới hợp lệ thay thế liên kết trước; chờ tối thiểu 60 giây giữa các email của một tài khoản. Hai endpoint recovery dùng chung hạn mức riêng 20 yêu cầu/IP/15 phút, giữ Origin/JSON checks.
- Mật khẩu mới theo chính sách đăng ký: 15–128 ký tự, scrypt có salt. Không tự đăng nhập sau reset. Tài khoản LOCKED không phát/tiêu thụ token.
- Khóa hàng User khi phát/tiêu thụ token và tạo session. Hai reset đồng thời chỉ một thành công; login đã kiểm tra mật khẩu cũ không thể tạo phiên mới sau khi reset hoàn tất.
- Email không tồn tại/bị khóa có cùng nội dung phản hồi, không trả token/trạng thái tìm tài khoản. Khi email lỗi, thu hồi token chưa gửi và ghi log chung không chứa email/token; không thay đổi mật khẩu. Chế độ email disabled báo 503 chung trước khi tìm tài khoản. Đây không phải kiểm chứng chống mọi dạng phân tích timing.
- Email mời áp dụng cơ chế UC08 hiện tại: thêm tài khoản ACTIVE đã đăng ký, rồi gửi email; không tạo tài khoản mới hay yêu cầu chấp nhận lời mời. Membership và thông báo trong ứng dụng đã commit vẫn được giữ nếu email lỗi; UI báo rõ và có **Gửi lại email mời**. Gửi lại giới hạn 20 yêu cầu/IP/15 phút, chỉ Owner; chưa có hàng đợi tự retry/background worker.

### Hộp thư thử cục bộ

API `.env` hiện đã đặt `MAIL_MODE=file` theo lựa chọn của nhóm. Email ghi vào `.local/mail/*.json`, không gửi qua Internet. Không expose endpoint đọc hộp thư; Vite từ chối phục vụ `.local` qua HTTP. Hộp thư không nằm trong Git hoặc build frontend.

Sau khi gửi yêu cầu từ giao diện, xem tối đa 10 email mới nhất:

```powershell
npm.cmd run mail:preview
# Hoặc chỉ xem email của tài khoản đang thử:
npm.cmd run mail:preview -- ban@example.com
```

Sao chép liên kết trong email đặt lại và mở trên trình duyệt. Email mời Workspace chứa địa chỉ ứng dụng; người nhận đăng nhập rồi vào Workspace. Khi dùng `MAIL_DIRECTORY` riêng, đặt cùng biến môi trường cho API và lệnh preview; nên giữ thư mục ngoài nơi được web phục vụ. Lệnh preview hiển thị liên kết nhạy cảm để người vận hành thử, không dùng output làm log công khai. JSON hộp thư tồn tại đến khi người vận hành dọn; E2E chỉ dọn email của tài khoản thử của chính lượt chạy.

Chế độ `file` bị từ chối trong production. Adapter Resend đã chuẩn bị và kiểm thử bằng mock theo [API chính thức](https://resend.com/docs/api-reference/emails/send-email), chưa gửi thật hoặc kiểm chứng mailbox bên ngoài. Khi triển khai thật cần cấu hình `MAIL_MODE=resend`, `MAIL_FROM`, `RESEND_API_KEY` và `APP_ORIGIN` HTTPS; mặc định production là email disabled. Thay file mode bằng provider không có nghĩa đã chứng minh email được nhận vào inbox.

### Kiểm chứng cuối bước 8

Build/TypeScript đạt. 17/17 kiểm thử backend độc lập database và 31/31 kiểm thử PostgreSQL đạt. Các trường hợp mới gồm token hash/dùng một lần/hết hạn/thay thế, khóa tài khoản, input/Origin/rate limit, session revocation, reset đồng thời, login sau reset, lỗi email và quyền gửi lại lời mời.

Browser QA có 5 kịch bản × 2 viewport Edge: luồng nhóm cũ với email mời/gửi lại, recovery qua hộp thư file, xác nhận mật khẩu sai, đăng nhập cũ bị từ chối/new password thành công, phiên khác bị thu hồi và liên kết đã dùng bị từ chối. Kiểm tra Vite không phục vụ email thử qua `/@fs/`. Database mới áp dụng đủ 8 migration và chạy recovery thành công.

## Phần tiếp theo

Bước 9 là Agile/Scrum theo UC44–UC52. Kết quả bước 8 là nghiệm thu môi trường cục bộ, không thay thế kiểm chứng email thật hoặc nghiệm thu toàn bộ 52 Use Case. UC32 vẫn còn các sự kiện Sprint tích hợp ở bước sau.
