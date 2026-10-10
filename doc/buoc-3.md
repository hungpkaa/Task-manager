# Bước 3 — Tài khoản và xác thực

Đây là đợt triển khai tài khoản cơ bản của UC01, UC02, UC03 và UC05. Module A trong đặc tả chưa đầy đủ vì UC04 chưa triển khai. Xem [bảng đối chiếu](doi-chieu-use-case.md) để phân biệt yêu cầu nguồn, phạm vi thực tế và lựa chọn kỹ thuật.

## Chức năng đã triển khai

- Đăng ký bằng tên hiển thị, email và mật khẩu; đăng nhập tự động sau khi đăng ký thành công.
- Đăng nhập bằng email/mật khẩu; đăng xuất thu hồi phiên hiện tại trong PostgreSQL.
- Đọc hồ sơ và sửa tên hiển thị của chính người dùng đang đăng nhập. Email đăng nhập được giữ nguyên ở bước này.
- Giao diện tiếng Việt có xác nhận mật khẩu khi đăng ký, ẩn/hiện mật khẩu, lỗi theo trường và trạng thái đang xử lý; tải lại trang kiểm tra phiên qua API.
- Trang tổng quan và hồ sơ chỉ hiển thị sau khi xác thực. Khi API trả `401` lúc sửa hồ sơ, giao diện trở lại đăng nhập và báo phiên hết hạn.
- Từ chối tài khoản `LOCKED`, phiên hết hạn hoặc token không hợp lệ. Chưa có giao diện/API quản trị khóa tài khoản.

Workspace, Project, Task, email xác minh, quên mật khẩu và đổi mật khẩu chưa được triển khai.

## Chạy và dùng thử

Máy đã cấu hình từ bước 2:

```powershell
npm.cmd install
npm.cmd run db:local:start
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd run dev
```

Nếu dùng Docker, thay `db:local:start` bằng `db:up`. Cách tạo các file `.env` cho máy mới nằm trong [hướng dẫn bước 2](buoc-2.md).

Mở http://127.0.0.1:5173. Chọn **Đăng ký**, nhập thông tin và xác nhận mật khẩu; sau đó thử **Hồ sơ cá nhân**, lưu tên mới, tải lại trang, **Đăng xuất** và **Đăng nhập** lại. Không có tài khoản mẫu; các tài khoản kiểm thử tự động được dọn sau kiểm tra.

API mặc định dùng `APP_ORIGIN=http://127.0.0.1:5173` và `NODE_ENV=development`. File `.env` cũ chưa có hai biến này vẫn dùng mặc định tương ứng. Nếu mở frontend bằng `localhost` hoặc cổng khác, đặt `APP_ORIGIN` cho đúng nguồn của frontend rồi khởi động lại API. Frontend và API được truy cập cùng nguồn qua Vite proxy.

## Hợp đồng API

Các API dưới đây có tiền tố `/api/auth`. Request thay đổi dữ liệu cần `Content-Type: application/json` và `Origin` khớp `APP_ORIGIN`.

| Phương thức / đường dẫn | Dữ liệu | Kết quả |
| --- | --- | --- |
| `POST /register` | `{ email, displayName, password }` | `201`, `{ user }`, cấp cookie phiên |
| `POST /login` | `{ email, password }` | `200`, `{ user }`, cấp cookie phiên mới |
| `POST /logout` | `{}` | `204`, thu hồi phiên và xóa cookie; gọi lại vẫn thành công |
| `GET /me` | Cookie phiên | `200`, `{ user }`; chưa đăng nhập/hết hạn trả `401` |
| `PATCH /me` | `{ displayName }` và cookie phiên | `200`, `{ user }`; chỉ cập nhật người dùng của phiên |

`user` gồm `id`, `email`, `displayName`, `systemRole`, `createdAt`. Không trả hash mật khẩu hoặc token phiên trong JSON. Lỗi nghiệp vụ trả `{ message, fields? }`; `fields` là lỗi theo tên trường. Mã lỗi gồm `400` dữ liệu sai, `401` sai thông tin/phiên, `403` tài khoản khóa hoặc nguồn yêu cầu sai, `409` email trùng, `415` nội dung không phải JSON và `429` vượt giới hạn yêu cầu.

Email được trim và chuyển chữ thường, tối đa 254 ký tự. Tên hiển thị được trim, từ 1 đến 100 ký tự. Mật khẩu đăng ký từ 15 đến 128 ký tự, giữ nguyên khoảng trắng và Unicode; xác nhận mật khẩu thuộc giao diện. Các trường ngoài schema, gồm việc tự gán role hoặc ID người khác, bị từ chối.

## Phiên, mật khẩu và dữ liệu

- Mật khẩu dùng scrypt với salt ngẫu nhiên 16 byte, `N=131072`, `r=8`, `p=1`; so sánh hash bằng `timingSafeEqual`. Tài khoản không tồn tại vẫn thực hiện bước kiểm tra hash giả để tránh bỏ qua chi phí hash.
- Token phiên ngẫu nhiên 32 byte chỉ được gửi qua cookie. PostgreSQL lưu SHA-256 của token, ngày tạo, thời điểm hết hạn và liên kết User. Thời hạn cố định 7 ngày, không gia hạn tự động.
- Cookie có `HttpOnly`, `SameSite=Lax`, `Path=/`. Với `NODE_ENV=production`, cookie có `Secure`, dùng tên `__Host-task_manager_session` và cấu hình bắt buộc `APP_ORIGIN` HTTPS.
- Mutation kiểm tra Origin và yêu cầu JSON. Mọi phản hồi auth có `Cache-Control: no-store` sau khi vào router. Đăng ký/đăng nhập chung giới hạn 20 yêu cầu/IP/15 phút, trả JSON `429` và `Retry-After`; bộ đếm hiện lưu trong một tiến trình API.
- Đăng nhập thành công thay token của trình duyệt hiện tại; cookie cũ mất hiệu lực. Đăng xuất chỉ thu hồi phiên hiện tại, không đăng xuất các thiết bị khác. Đăng nhập sai giữ nguyên cookie đang có.
- Tạo tài khoản và tạo phiên nằm trong cùng transaction. Hồ sơ luôn lấy User ID từ phiên, không nhận ID từ client. Trạng thái tài khoản được kiểm tra mỗi lần truy cập hồ sơ.
- Phiên hết hạn được từ chối và xóa khi truy cập; phiên hết hạn của một User được dọn khi User đăng nhập. Chưa có tác vụ định kỳ dọn toàn bộ phiên.
- Migration `account_sessions` bổ sung role/trạng thái mặc định cho User và bảng `sessions`; dữ liệu User từ bước 2 được giữ lại.

Cơ sở lựa chọn: [hướng dẫn lưu mật khẩu của OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [quản lý phiên của OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) và [kiểm tra Origin để chống CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Kiểm chứng

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run db:status
```

`typecheck` kiểm tra cả mã API và TypeScript của kiểm thử. Sau build, khi API/frontend đang chạy, kiểm tra luồng qua proxy:

```powershell
npm.cmd run check:running
npm.cmd run check:auth
```

Kết quả: build/typecheck thành công; 14 kiểm thử không cần DB và 5 kiểm thử tích hợp PostgreSQL đạt. Các trường hợp bao gồm email trùng/chuẩn hóa, mật khẩu và salt, token giả, cookie production, nguồn yêu cầu, giới hạn đăng nhập, sửa hồ sơ, tách dữ liệu giữa hai tài khoản, xoay token, thu hồi/hết hạn phiên và tài khoản khóa. Ngoại lệ hệ thống của UC02 được kiểm thử theo bảng nguồn: không cấp cookie phiên và báo thử lại sau. Một service/router mới đọc được phiên đã lưu trong PostgreSQL.

Luồng đăng ký → hồ sơ → cập nhật tên → đăng xuất → đăng nhập lại qua Vite proxy cũng đạt. Dữ liệu các tài khoản thử nghiệm được dọn; migration đồng bộ với database. Chưa có kiểm tra tương tác hoặc trực quan trong trình duyệt vì môi trường không cung cấp công cụ browser QA.

Bước tiếp theo là Workspace và thành viên. Cần chốt cách xử lý khi xóa thành viên đang quản lý Project hoặc có Task trước khi bổ sung thao tác xóa.
