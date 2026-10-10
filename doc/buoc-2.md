# Bước 2 — Nền tảng frontend, API và PostgreSQL

Tài liệu này ghi nhận nền tảng khi hoàn thành bước 2. Chức năng tài khoản hiện tại được mô tả trong [bước 3](buoc-3.md).

## Những gì đã có

- npm workspaces gồm `apps/web` (React, Vite, TypeScript) và `apps/api` (Express, TypeScript).
- API qua các lớp HTTP, service và repository; Prisma 7 sử dụng PostgreSQL driver adapter.
- Migration đầu tiên tạo bảng `users` với email duy nhất và trường lưu hash mật khẩu, chuẩn bị cho bước 3. Chưa có chức năng tài khoản hoặc tài khoản mẫu.
- Trang tổng quan tiếng Việt hiển thị kết nối thật, có trạng thái đang tải, mất kết nối và nút kiểm tra lại. Các phần Workspace/Project/Task được ghi rõ chưa triển khai.
- API bind loopback mặc định; Vite proxy `/api` đến backend. Frontend không kết nối trực tiếp database.
- Docker Compose có PostgreSQL 18, volume lưu dữ liệu, healthcheck và cổng loopback `55432`.
- Script PostgreSQL riêng trên Windows là lựa chọn thay thế khi Docker không chạy. Dữ liệu được lưu ở `.local/postgres`, không dùng cluster của dịch vụ PostgreSQL khác trên máy.

## Cài đặt và chạy

Yêu cầu Node.js 22.12 trở lên và npm. Cần Docker Desktop đang chạy hoặc PostgreSQL cài sẵn trên Windows. Các lệnh dưới đây chạy từ thư mục gốc dự án bằng PowerShell; dùng `npm.cmd` để tránh execution policy chặn `npm.ps1`.

### Chuẩn bị cấu hình

Chỉ sao chép khi chưa có các file `.env`; không ghi đè cấu hình riêng đang dùng.

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
npm.cmd install
```

Mật khẩu trong `.env.example` chỉ phục vụ phát triển cục bộ. `POSTGRES_PASSWORD` ở gốc và mật khẩu trong `DATABASE_URL` của API phải khớp nhau. `.env` và `.local` không được đưa vào Git.

### Khởi động database — chọn một cách

Docker Compose:

```powershell
npm.cmd run db:up
```

Hoặc PostgreSQL cài sẵn trên Windows:

```powershell
npm.cmd run db:local:start
```

Script mặc định tìm binary ở `C:\Program Files\PostgreSQL\18\bin`. Nếu khác, đặt `$env:PG_BIN` trỏ đến thư mục `bin` trước khi chạy. Lần đầu script khởi tạo cluster và database; các lần sau giữ dữ liệu. Không chạy đồng thời hai cách vì cùng dùng cổng `55432`. Thay đổi mật khẩu trong `.env` không tự đổi mật khẩu của cluster hoặc volume đã tồn tại.

### Áp dụng migration và khởi động ứng dụng

```powershell
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd run dev
```

- Frontend: http://127.0.0.1:5173
- API liveness: http://127.0.0.1:4000/api/health
- API/database readiness: http://127.0.0.1:4000/api/health/ready

`dev` chạy cả API và frontend. Dừng bằng `Ctrl+C`. `apps/web/.env.example` là cấu hình tùy chọn để đổi API proxy target; nếu đổi cổng API, cần cấu hình target tương ứng.

### Kiểm tra

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd run db:validate
npm.cmd run db:status
npm.cmd test
npm.cmd run test:db
```

`test:db` cần PostgreSQL đang chạy và migration đã áp dụng; dữ liệu thử nghiệm được rollback. Khi cả frontend và API đang chạy, kiểm tra HTTP và proxy bằng:

```powershell
npm.cmd run check:running
```

Để tạo migration mới sau khi sửa schema:

```powershell
npm.cmd run db:migrate -- --name ten_thay_doi
```

Không cần tạo lại migration đầu tiên. `db:deploy` áp dụng migration đã có vào database mới. API sau build có thể chạy bằng `npm.cmd run start -w @task-manager/api`; triển khai production và reverse proxy chưa thuộc bước này.

### Dừng database

Docker:

```powershell
npm.cmd run db:down
```

PostgreSQL riêng:

```powershell
npm.cmd run db:local:stop
```

Hai lệnh giữ dữ liệu để dùng lại lần sau.

## Hợp đồng API hiện tại

| Endpoint | Thành công | Khi không sẵn sàng |
| --- | --- | --- |
| `GET /api/health` | `200`, `{ "status": "ok", "service": "task-manager-api" }` | Không phụ thuộc database |
| `GET /api/health/ready` | `200`, `{ "status": "ok", "database": "connected" }` | `503`, `{ "status": "degraded", "database": "unavailable" }` |

Endpoint chưa tồn tại trả JSON `404`. JSON sai định dạng trả `400`; payload vượt `100kb` trả `413`. Lỗi không trả stack trace, mật khẩu hoặc connection string. Readiness hiện kiểm tra kết nối qua `SELECT 1`; trạng thái migration được kiểm tra riêng bằng `db:status`.

## Kết quả kiểm chứng

- Build frontend/backend và typecheck thành công.
- Prisma schema hợp lệ; migration đầu tiên đã áp dụng lên PostgreSQL 18.6 mới tạo trong dự án, trạng thái migration đồng bộ.
- 5 kiểm thử API đạt: database lỗi vẫn giữ liveness; readiness thành công; JSON lỗi; cấu hình thiếu/sai; payload quá lớn.
- 1 kiểm thử tích hợp PostgreSQL đạt: Prisma ghi/đọc bản ghi, email duy nhất và rollback không để lại dữ liệu thử.
- HTTP frontend, API và Vite proxy đều đạt; endpoint không tồn tại trả JSON `404`.
- Lệnh `dev` chạy đồng thời hai ứng dụng thành công; giới hạn payload qua Vite proxy trả JSON `413`.
- Ngắt PostgreSQL thực tế: liveness vẫn `200`, readiness trực tiếp và qua proxy đều `503`. Khởi động lại PostgreSQL phục hồi readiness `200`.
- Script PostgreSQL cục bộ đã được kiểm tra khởi động/dừng trên Windows. Trong môi trường sandbox, việc điều khiển PostgreSQL và chạy tsx cần quyền ngoài sandbox; đây là giới hạn của môi trường kiểm tra.
- Chưa kiểm tra trực quan trong trình duyệt vì không có công cụ browser QA. Cấu hình Docker Compose đã vượt qua `docker compose config --quiet`, nhưng container chưa chạy thử do Docker daemon trên máy chưa hoạt động; việc kết nối và migration được kiểm chứng bằng PostgreSQL cục bộ.
- Các tiến trình kiểm tra đã dừng sau khi kiểm chứng; dữ liệu PostgreSQL được giữ nguyên. Dùng các lệnh khởi động ở trên để chạy lại.

Bước tiếp theo: đăng ký, đăng nhập, đăng xuất và hồ sơ cá nhân; chốt cơ chế phiên đăng nhập trước khi triển khai API tài khoản.
