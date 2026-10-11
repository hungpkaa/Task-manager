# Bước 9 — Agile/Scrum (đang triển khai)

## Phần 1: Product Backlog và kế hoạch Sprint

Đối chiếu [đặc tả gốc](sơ%20đồ.md), SEQ-J1 (`assets/so-do/image24.png`), UC45 (`image43.png`) và UC46 (`image44.png`). Dùng chi tiết UC46 trong ảnh: **trước khi Sprint bắt đầu** PM có thể đưa Task về Product Backlog. Đoạn diễn giải Markdown nói “Khi Sprint bắt đầu” không khớp ảnh; phần triển khai chọn quy tắc trong ảnh chi tiết.

Đã có:

- Product Backlog lấy Task của Project có `sprint_id IS NULL`; Sprint Backlog lấy Task theo Sprint. Phân trang 20 Task, danh sách Sprint cũng phân trang 20.
- PM hiện tại tạo Sprint có tên, Goal và ngày bắt đầu/kết thúc bắt buộc; ngày kết thúc không trước ngày bắt đầu. Sprint mới là `PLANNED` và thuộc một Project.
- PM chọn nhiều Task trên trang hiện tại, kiểm tra Effort và cảnh báo trước khi xác nhận đưa vào Sprint. Có thể hủy mà chưa thay đổi dữ liệu.
- Cảnh báo Task thiếu Effort/người phụ trách, dependency chưa DONE, deadline sau Sprint và Task đã DONE. Tổng Effort là tổng đã biết của **Task được chọn**, không quy đổi thành giờ hoặc năng lực nhóm.
- PM đưa Task về Product Backlog với xác nhận, chỉ khi Sprint còn PLANNED. Không sao chép Task hoặc thay đổi trạng thái công việc.
- Owner và thành viên Project xem Backlog/Sprint; Owner không tự có quyền lập kế hoạch. System Admin không được vượt phạm vi Project. Project CLOSED chỉ xem.
- Kế hoạch cập nhật toàn bộ nhóm Task trong một transaction; Task khác Project hoặc đã thuộc Sprint bị từ chối cả nhóm. So sánh `updatedAt` trước khi ghi để từ chối dữ liệu cũ. Dùng cùng khóa Workspace với Task/Project/thành viên: hai yêu cầu đưa cùng Task vào hai Sprint chỉ có một yêu cầu thành công.
- Migration mới bổ sung Sprint, foreign key ghép `(sprint_id, project_id)` và kiểm tra khoảng ngày. Partial unique index bảo đảm tối đa một Sprint ACTIVE mỗi Project, chuẩn bị cho phần vòng đời.

**UC46 mới ở mức cơ bản:** chưa có dữ liệu Capacity/Workload/Risk từ bước 10. Cả API và UI ghi rõ chưa thể kết luận quá tải; PM phải tự kiểm tra năng lực nhóm. Không giả định Capacity bằng 0 hoặc tự chọn thay PM. Quản lý dependency trên giao diện vẫn thuộc bước 10; cảnh báo hiện đọc dependency đã lưu.

## API và cách dùng

Các API yêu cầu session; thao tác ghi yêu cầu JSON và Origin hợp lệ:

| API | Chức năng |
| --- | --- |
| `GET /api/projects/:projectId/sprints?page=1` | Danh sách Sprint |
| `POST /api/projects/:projectId/sprints` | Tạo PLANNED: name, goal, startDate, endDate |
| `GET /api/projects/:projectId/backlog?page=1` | Product Backlog |
| `GET /api/projects/:projectId/backlog?sprintId=:id&page=1` | Sprint Backlog |
| `POST /api/projects/:projectId/sprints/:id/plan` | Kiểm tra / xác nhận nhóm Task |
| `POST /api/projects/:projectId/sprints/:id/tasks/:taskId/return` | Đưa Task về Product Backlog khi PLANNED |

Plan nhận `tasks: [{id, updatedAt}]` (1–100, không trùng) và `confirmed` (mặc định false). Preview không ghi dữ liệu; confirm kiểm tra lại và cập nhật atomically. Return nhận `updatedAt` của Task đang xem. API không cho gửi một `sprintId` tùy ý qua PATCH Task để vượt qua kiểm tra kế hoạch.

Mở Workspace → Project → **Mở Sprint & Backlog**. PM tạo Sprint, chọn Sprint nhận Task, chọn các checkbox trong Product Backlog → **Kiểm tra kế hoạch** → xem cảnh báo → **Xác nhận đưa vào Sprint**. Có thể chuyển sang **Sprint Backlog**, chọn **Đưa về Product Backlog** và xác nhận. Bấm tải lại để lấy thay đổi từ màn hình Task; chọn Task chỉ giữ trong trang đang xem. Phần bắt đầu/theo dõi Sprint được bổ sung bên dưới; kết thúc Sprint chưa có.

## Phần 2: bắt đầu và theo dõi Sprint (UC47–48)

Đối chiếu SEQ-J2 (`image25.png`), UC47 (`image45.png`) và UC48 (`image46.png`).

- PM chọn **Bắt đầu Sprint**, xem cảnh báo rồi xác nhận. Backend kiểm tra PLANNED, Goal, ít nhất một Task và không có Sprint ACTIVE khác; lưu `started_at` và chuyển ACTIVE. Ngày dự kiến không tự kích hoạt Sprint hoặc ngăn PM bắt đầu: tài liệu quy định PM quyết định.
- Preview không thay đổi dữ liệu. Xác nhận kiểm tra lại trạng thái/phiên bản Sprint, Backlog và cảnh báo. Khóa Workspace cùng partial unique index bảo vệ khi bắt đầu đồng thời hoặc tranh chấp với đóng Project/chuyển PM. Project có Sprint ACTIVE không được đóng, kể cả khi mọi Task đã DONE.
- Thông báo `SPRINT_STARTED` gửi trong ứng dụng cho thành viên Project cùng transaction; lỗi lưu thông báo hoàn tác cả ACTIVE/startedAt. Thông báo mở Project để người dùng chọn Sprint; chưa điều hướng trực tiếp đến Sprint cụ thể.
- **Theo dõi Sprint** dành cho thành viên Project/PM đúng UC48. Owner chưa là thành viên vẫn xem Product/Sprint Backlog nhưng không mở Dashboard này. Người ngoài Project hoặc System Admin không được vượt phạm vi bằng ID.
- Dashboard hiển thị Goal, ngày, trạng thái, tổng Task theo TODO/IN_PROGRESS/REVIEW/DONE, tỷ lệ DONE, BLOCKED và quá hạn. Số liệu toàn Sprint độc lập với bộ lọc và phân trang, đọc trong cùng snapshot PostgreSQL.
- Board/danh sách lọc theo status/priority/assignee, phân trang 20. Bấm Task để mở chi tiết, sửa/đổi trạng thái theo quyền sẵn có; **Về theo dõi Sprint** tải lại tiến độ. Board chỉ hiển thị Task của trang đang xem; tổng Dashboard dùng toàn Sprint.
- Tiến độ = số Task DONE / tổng Task, làm tròn phần trăm; không phải Effort đã hoàn thành. Task DONE không tính BLOCKED/quá hạn. Task quá hạn khi dueDate trước ngày hiện tại tại Việt Nam; ngày đến hạn vẫn chưa quá hạn. Số ngày còn lại là chênh lệch ngày lịch tại Asia/Ho_Chi_Minh, tối thiểu 0. Sprint ACTIVE qua ngày kết thúc hiển thị quá hạn.
- Dùng **Tải lại tiến độ Sprint** để lấy dữ liệu mới; chưa realtime/polling. Chưa có phân tích Workload/Capacity/Risk, cảnh báo ghi rõ giới hạn; UC47–48 ghi mức cơ bản cho tới khi tích hợp bước 10.

API bổ sung: `POST /api/projects/:projectId/sprints/:id/start` nhận `{expectedUpdatedAt, confirmed}`; `GET /api/projects/:projectId/sprints/:id/monitor` nhận `page/status/priority/assigneeId` (assigneeId có thể là `unassigned`). Các API giữ session/Origin/JSON và kiểm tra Project như phần 1.

Migration thứ 10 bổ sung thời điểm bắt đầu. Build/typecheck và 17 unit + 38 integration test đã qua; kiểm tra cả 10 migration trên DB mới qua. Các test mới kiểm tra quyền PM/thành viên, Backlog rỗng, xác nhận cũ, một ACTIVE, thông báo không trùng/rollback, chuyển PM, đóng Project đồng thời, số liệu không đổi khi lọc/phân trang và ngày Việt Nam qua ranh giới UTC. 12 kiểm thử trình duyệt qua (6 luồng × máy tính/điện thoại), gồm bắt đầu/hủy xác nhận Sprint, PM mở Task và chuyển DONE, quay lại thấy tiến độ cập nhật, lọc danh sách rỗng vẫn giữ tổng 100%, thành viên xem tiến độ, cùng hồi quy tài khoản/Workspace/Project/Task/email. Ảnh cảnh báo và Dashboard tại `.local/e2e-results`; báo cáo mở bằng `npm.cmd run test:e2e:report`. Ứng dụng đang chạy cũng qua kiểm tra React/API/PostgreSQL/proxy.

## Kiểm chứng

Ngày 2026-10-11: migration thứ 9 áp dụng thành công vào PostgreSQL cục bộ; kiểm tra trên DB mới cũng qua. Build/typecheck qua. 17 unit test và 34 integration test qua; phần Sprint kiểm tra quyền, ngày/Goal, phân trang, dependency/cảnh báo, preview không ghi, batch rollback, Task khác Project, dữ liệu cũ, tranh chấp đồng thời, return theo trạng thái và các ràng buộc DB.

12 kiểm thử trình duyệt qua (6 luồng × máy tính/điện thoại), gồm hồi quy Workspace/Project/Task và tài khoản/email. Bài kiểm tra Sprint bao gồm tạo Sprint, chọn hai Task, xem/hủy cảnh báo, xác nhận, tải lại trang, đưa Task về Backlog và kiểm tra chiều rộng. Ảnh chụp cảnh báo lưu trong `.local/e2e-results`, báo cáo tại `.local/e2e-report`; mở bằng `npm.cmd run test:e2e:report`. Lần kiểm tra ứng dụng đang chạy cũng xác nhận React, API, PostgreSQL và Vite proxy hoạt động.

## Phần còn lại

Bước 9 **chưa hoàn thành**. Tiếp theo: UC52 kết thúc và xử lý Task chưa DONE, thông báo hoàn thành Sprint. Chọn Sprint ngay trong form tạo Task (UC19) vẫn chưa tích hợp. UC46–48 phải kiểm chứng lại sau khi có Capacity/Workload/Risk ở bước 10. Hiện Sprint đã ACTIVE chưa có nút kết thúc; phần tiếp theo sẽ triển khai luồng đó, không tự chuyển COMPLETED hoặc xóa dữ liệu.

## Phần 5: Sprint Retrospective (UC51)

Đối chiếu UC51 (`image49.png`). Thành viên Project và PM mở **Theo dõi Sprint**, nhập điều làm tốt, điều cần cải thiện và việc sẽ thực hiện. Ba trường bắt buộc, tối đa 4000 ký tự mỗi trường. Mỗi Sprint có một bản tổng hợp chung (đúng ràng buộc UNIQUE sprint_id trong đặc tả); người cập nhật gần nhất và thời gian Việt Nam được hiển thị. Nội dung tập trung vào quy trình làm việc, không thay đổi Task/Review/Sprint.

Cho phép cả thành viên và PM sửa khi Project ACTIVE và Sprint chưa COMPLETED. Owner chưa thuộc Project và System Admin không vượt phạm vi. Sau khi hoàn thành/đóng Project, chỉ xem bản đã lưu. Ghi dùng khóa Workspace cùng transaction để kiểm tra lại membership/trạng thái. `expectedUpdatedAt` null khi tạo, timestamp khi sửa; bản sửa cũ nhận 409, giữ nội dung đang nhập để người dùng đối chiếu trước khi tải lại.

API `GET /api/projects/:projectId/sprints/:id/retrospective` và `PUT` cùng đường dẫn nhận `{wentWell, needsImprovement, actionItems, expectedUpdatedAt}`. Migration thứ 13 tạo bảng, UNIQUE, FK và kiểm tra độ dài.

Kiểm chứng ngày 2026-10-11: build/typecheck qua, 41 integration test qua, 13 migration trên DB mới qua. UC51 kiểm tra quyền thành viên/PM, input/Origin, một bản chung, hai người sửa đồng thời, thu hồi membership, lịch sử COMPLETED/Project CLOSED và ràng buộc DB. Hai luồng Sprint desktop/mobile qua: thành viên lưu, PM sửa, thành viên gửi bản cũ nhận lỗi và tải lại thấy đúng nội dung mới; không tràn ngang. Chỉ chạy lại hai luồng Sprint, không chạy lại toàn bộ kiểm thử trình duyệt.

## Phần 4: Sprint Review (UC50)

Đối chiếu UC50 (`image48.png`). Trong **Theo dõi Sprint**, PM hiện tại nhập tổng kết và phản hồi (bắt buộc, tối đa 4000 ký tự mỗi trường). Mỗi Sprint có một bản Review tổng hợp; PM có thể cập nhật khi Sprint PLANNED/ACTIVE và Project còn ACTIVE. COMPLETED chỉ xem. Thành viên Project xem nội dung; Owner chưa thuộc Project và System Admin không vượt phạm vi. Review không thay đổi trạng thái Task hoặc Sprint.

Màn hình hiển thị số Task DONE/chưa DONE hiện tại và số liệu tại lần lưu gần nhất. Backend tính và lưu số liệu trong cùng transaction với Review, lấy tác giả từ phiên. Dùng khóa Workspace để tuần tự hóa với Task, chuyển PM và vòng đời Project/Sprint. `expectedUpdatedAt` (null khi tạo mới) ngăn hai cửa sổ ghi đè; bản cũ nhận 409 và phải tải lại. Tải lại sẽ thay nội dung đang nhập bằng bản đã lưu.

API: `GET /api/projects/:projectId/sprints/:id/review`; `PUT` cùng đường dẫn nhận `{summary, feedback, expectedUpdatedAt}`. Migration thứ 12 tạo `sprint_reviews`, UNIQUE sprint_id, FK và kiểm tra độ dài/số lượng không âm.

Kiểm chứng ngày 2026-10-11: build/typecheck qua, 40 integration test qua và cả 12 migration trên DB mới qua. Test UC50 kiểm tra quyền, Origin, input, snapshot khác số liệu hiện tại, một bản ghi mỗi Sprint, hai bản sửa đồng thời, PM chuyển giao và lịch sử COMPLETED. Hai luồng Sprint trên trình duyệt (desktop/mobile) qua, gồm PM tạo/sửa Review, thành viên tải lại vẫn thấy nội dung và không có nút sửa; kiểm tra không tràn ngang. Chưa chạy lại toàn bộ bộ kiểm thử trình duyệt trong lần bổ sung UC50.

## Phần 3: Daily Update (UC49)

Đối chiếu đặc tả UC49 (`image47.png`). Trong **Theo dõi Sprint**, thành viên Project (bao gồm PM là thành viên) nhập tiến độ đã thực hiện, kế hoạch tiếp theo và blocker. Progress và kế hoạch bắt buộc, mỗi trường tối đa 2000 ký tự; blocker có thể để trống. Mỗi lần gửi là một bản ghi riêng, không sửa/xóa lịch sử và không thay đổi trạng thái Task. Tác giả lấy từ phiên đăng nhập, thời điểm lấy từ DB.

Chỉ Project/Sprint ACTIVE cho phép ghi. Owner chưa thuộc Project và System Admin không được vượt phạm vi. Lịch sử được giữ khi Sprint hoàn thành, hiển thị mới nhất trước, phân trang 20 và thời gian Việt Nam. Thao tác ghi dùng cùng khóa Workspace để kiểm tra lại thành viên/trạng thái trong transaction.

API: `GET /api/projects/:projectId/sprints/:id/daily?page=1` và `POST` cùng đường dẫn, nhận `{progress, nextPlan, blockers}`. Migration thứ 11 tạo bảng Daily Update, FK và ràng buộc độ dài. Build/typecheck, 17 unit và 39 integration test đã qua; 11 migration trên DB mới đã qua. Kiểm thử UC49 kiểm tra phân quyền, trạng thái, dữ liệu nhập, Origin, nhiều lần cập nhật, phân trang và lịch sử sau khi hoàn thành.

Hai kiểm thử Sprint trên trình duyệt (máy tính/điện thoại) đã qua, bao gồm thành viên gửi Daily Update, thấy tác giả/nội dung, tải lại trang vẫn giữ lịch sử và Task không đổi trạng thái. Đã kiểm tra không tràn ngang; ảnh tại `.local/e2e-results/*/sprint-daily.png`. Lần này chỉ chạy lại hai luồng Sprint, không chạy lại toàn bộ 12 kiểm thử trình duyệt.
