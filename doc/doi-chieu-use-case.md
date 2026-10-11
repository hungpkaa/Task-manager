# Đối chiếu triển khai với đặc tả

## Căn cứ và cách ghi nhận

[Đặc tả hệ thống](sơ%20đồ.md) và các ảnh gốc được tham chiếu trong đặc tả là căn cứ nghiệp vụ. Lộ trình chỉ chia thứ tự triển khai; phạm vi đích vẫn gồm đủ 52 Use Case. Các phần được làm sau vẫn là yêu cầu cần hoàn thành.

Trước mỗi nhóm chức năng: đọc Use Case, luồng chính/thay thế/ngoại lệ, sơ đồ liên quan và ràng buộc ERD; sau đó triển khai frontend, API và dữ liệu, kiểm thử theo yêu cầu rồi cập nhật bảng dưới đây. Nếu nguồn có điểm chưa rõ hoặc không nhất quán, ghi rõ điểm đó và cách xử lý; không âm thầm đổi quy tắc.

`Đã triển khai` nghĩa là có mã và kiểm chứng API/dữ liệu. Bước 7 bổ sung browser QA cho luồng phiên bản đầu trên Edge với viewport máy tính và điện thoại; đây chưa phải nghiệm thu toàn bộ 52 Use Case hoặc mọi trình duyệt. Xem [phạm vi kiểm thử](buoc-7.md). Khi nguồn chưa quy định đủ chi tiết, ghi `Cơ bản` và nêu phạm vi thực tế, không tự coi phần suy diễn là yêu cầu gốc.

## Trạng thái 52 Use Case

| Mã | Chức năng trong đặc tả | Trạng thái thực tế | Bước dự kiến |
| --- | --- | --- | --- |
| UC01 | Đăng ký tài khoản | Cơ bản: tên/email/mật khẩu, email duy nhất, mặc định Member | 3 |
| UC02 | Đăng nhập | Đã triển khai: validate, hash, trạng thái khóa, session và trang sau đăng nhập | 3 |
| UC03 | Đăng xuất | Đã triển khai: thu hồi phiên hiện tại, xóa cookie | 3 |
| UC04 | Quên / đặt lại mật khẩu | Đã triển khai: token hash, dùng một lần/30 phút, thu hồi mọi phiên; email hộp thư thử theo lựa chọn nhóm, chưa gửi thật | 8 |
| UC05 | Cập nhật hồ sơ cá nhân | Cơ bản: đọc hồ sơ, sửa tên của chính mình; chưa sửa email | 3 |
| UC06 | Tạo Workspace | Đã triển khai: Workspace và membership Owner cùng transaction | 4 |
| UC07 | Cập nhật Workspace | Đã triển khai: Owner sửa tên/mô tả | 4 |
| UC08 | Mời thành viên | Đã triển khai: thêm tài khoản ACTIVE đã tồn tại, thông báo transaction; email mời và Owner gửi lại qua hộp thư thử | 4, 8 |
| UC09 | Xóa thành viên khỏi Workspace | Đã triển khai: giữ Owner cuối cùng, chặn nếu còn PM hoặc Task chưa DONE; xóa membership Project thường, giữ assignee lịch sử DONE | 4, 5, 6 |
| UC10 | Quản lý vai trò thành viên | Đã triển khai: chỉ Owner, vai trò Owner/Member, kiểm tra Owner cuối cùng | 4 |
| UC11 | Xem danh sách thành viên | Đã triển khai: chỉ thành viên Workspace, không lộ mật khẩu/phiên | 4 |
| UC12 | Tạo Project | Đã triển khai: Owner, đúng Workspace, tên/mô tả/ngày tháng | 5 |
| UC13 | Phân công Project Manager | Đã triển khai: Owner chọn thành viên ACTIVE của Workspace, tự thêm ProjectMember, xác nhận PM hiện tại, thông báo | 5 |
| UC14 | Cập nhật Project | Đã triển khai: PM hiện tại, kiểm tra ngày tháng và trạng thái đóng | 5 |
| UC15 | Đóng Project | Đã triển khai: PM, chặn khi còn Task chưa DONE hoặc Sprint ACTIVE, giữ dữ liệu CLOSED/thông báo | 5, 6, 9 |
| UC16 | Quản lý thành viên Project | Đã triển khai: PM thêm/xóa thành viên Workspace, chặn xóa PM/người còn Task chưa DONE | 5, 6 |
| UC17 | Xem Project | Đã triển khai: Owner của Workspace hoặc thành viên Project; PM được thêm vào Project | 5 |
| UC18 | Xem chi tiết Task | Đã triển khai: quyền Project, thuộc tính, assignee và cảnh báo dependency | 6 |
| UC19 | Tạo Task | Cơ bản: PM, TODO, thuộc tính/effort/assignee, thông báo cùng transaction; sprintId null, chọn Sprint bổ sung ở bước 9 | 6, 9 |
| UC20 | Cập nhật Task | Đã triển khai: PM, tên/mô tả/priority/ngày/effort; kiểm tra dữ liệu cũ+mới | 6 |
| UC21 | Xóa Task | Đã triển khai: PM, xác nhận UI, chặn Task đang được Task khác phụ thuộc | 6 |
| UC22 | Gán / thay đổi người phụ trách | Đã triển khai: PM, thành viên Project ACTIVE, cho phép bỏ phân công, thông báo nguyên tử | 6 |
| UC23 | Cập nhật trạng thái Task | Cơ bản: PM/assignee, chuyển tuần tự, kiểm tra dependency và xác nhận BLOCKED; Dashboard/Progress tích hợp sau | 6, 10 |
| UC24 | Đặt Priority và Deadline | Đã triển khai: LOW/MEDIUM/HIGH/URGENT, ngày hợp lệ, deadline không trước ngày bắt đầu | 6 |
| UC25 | Bình luận và @mention | Đã triển khai: bình luận có phân trang, mention thành viên ACTIVE trong Project, thông báo transaction; lựa chọn chi tiết xem bước 8 | 8 |
| UC26 | Đính kèm tệp vào Task | Đã triển khai: upload/download có quyền theo Task, PostgreSQL BYTEA, giới hạn 10 MiB, xóa bởi người tải lên/PM; lựa chọn chi tiết xem bước 8 | 8 |
| UC27 | Xem My Tasks | Đã triển khai: công việc của chính mình trong các Project còn membership | 6 |
| UC28 | Xem Kanban Board | Đã triển khai: bốn cột trạng thái, lọc và phân trang; đổi trạng thái trong chi tiết, chưa kéo thả | 6 |
| UC29 | Xem List/Table | Đã triển khai: danh sách thẻ công việc, dùng cùng dữ liệu/bộ lọc với Kanban | 6 |
| UC30 | Xem Calendar | Chưa triển khai | 10 |
| UC31 | Tìm kiếm, lọc và sắp xếp Task | Đã triển khai: tìm title/description, status/priority/assignee, sort và phân trang phía API | 6 |
| UC32 | Xem và quản lý thông báo | Cơ bản: riêng tư, đếm/đánh dấu đọc, sự kiện Workspace/Project/giao Task/mention/bắt đầu Sprint; chưa sự kiện hoàn thành Sprint | 4, 5, 6, 8, 9 |
| UC33 | Xem Dashboard cá nhân | Chưa triển khai; trang hiện tại chưa có chỉ số công việc | 10 |
| UC34 | Xem Dashboard Project | Chưa triển khai | 10 |
| UC35 | Thiết lập Effort và Capacity | Cơ bản: Task effort 1/2/3/5/8; chưa Capacity và Workload | 6, 10 |
| UC36 | Quản lý Task Dependency | Chưa có API/UI quản lý; đã có bảng và kiểm tra BLOCKED, FK cùng Project, không tự phụ thuộc; kiểm tra chu trình khi tạo ở bước 10 | 10 |
| UC37 | Xem Workload thành viên | Chưa triển khai | 10 |
| UC38 | Xem Project Risk | Chưa triển khai | 10 |
| UC39 | Xem đề xuất điều phối | Chưa triển khai | 10 |
| UC40 | Xem danh sách người dùng hệ thống | Chưa triển khai | 10 |
| UC41 | Khóa / mở khóa tài khoản | Chưa triển khai API/giao diện quản trị; auth đã từ chối tài khoản LOCKED | 10 |
| UC42 | Xem danh sách Workspace | Chưa triển khai | 10 |
| UC43 | Xem thống kê hệ thống | Chưa triển khai | 10 |
| UC44 | Xem Product Backlog | Đã triển khai: Task cùng Project có sprintId null, phân quyền và phân trang | 9 |
| UC45 | Tạo Sprint | Đã triển khai: PM, PLANNED, tên/Goal/ngày bắt buộc, kiểm tra khoảng ngày | 9 |
| UC46 | Lập Sprint Backlog | Cơ bản: chọn nhiều Task, preview Effort/dependency/cảnh báo, xác nhận, cùng Project, return khi PLANNED; chưa Capacity/Workload/Risk | 9, 10 |
| UC47 | Bắt đầu Sprint | Cơ bản: PM, PLANNED, Goal/Backlog, tối đa một ACTIVE, cảnh báo/xác nhận và thông báo atomic; chưa Workload/Risk | 9, 10 |
| UC48 | Theo dõi Sprint | Cơ bản: thành viên Project, Dashboard toàn Sprint, Board/danh sách phân trang/lọc, mở Task, BLOCKED/overdue/ngày còn lại, Daily Update; chưa Workload/Risk | 9, 10 |
| UC49 | Cập nhật Daily Update | Đã có: thành viên Project gửi progress/next plan/blocker trong Sprint ACTIVE; lưu riêng từng lần, lịch sử phân trang và thời gian Việt Nam | 9 |
| UC50 | Thực hiện Sprint Review | Đã có: PM lưu/sửa summary và feedback trước COMPLETED; một bản ghi/Sprint, snapshot DONE/chưa DONE, chống ghi đè dữ liệu cũ; thành viên xem | 9 |
| UC51 | Thực hiện Sprint Retrospective | Đã có: thành viên/PM cập nhật bản chung trước COMPLETED, went well/needs improvement/action items, chống ghi đè bản cũ và giữ nội dung sau khi đóng | 9 |
| UC52 | Kết thúc Sprint | Đã có: PM xem trước/hủy/xác nhận, chuyển toàn bộ Task chưa DONE về Backlog hoặc Sprint PLANNED cùng Project, COMPLETED/lịch sử/thông báo atomically | 9 |

Một Use Case trải qua nhiều bước chỉ được nghiệm thu đầy đủ khi đã tích hợp cả phần phụ thuộc; không đánh dấu xong ở bước đầu tiên chỉ vì đã có thao tác chính.

## Đối chiếu phần tài khoản

- UC02 đối chiếu với bảng gốc [image33](assets/so-do/image33.png): email/mật khẩu, kiểm tra dữ liệu/tài khoản/hash, từ chối tài khoản khóa, tạo phiên và chuyển trang; lỗi hệ thống không cấp cookie phiên và báo thử lại sau.
- UC01, UC03, UC05 được liệt kê trong [sơ đồ tài khoản](assets/so-do/image2.png); tài liệu không có bảng chi tiết riêng cho ba UC này. Phạm vi thực tế được ghi trong bảng trên thay vì suy diễn thêm trường hồ sơ.
- User có `status` và `systemRole` phù hợp [Class Diagram](assets/so-do/image27.png), [ERD](assets/so-do/image29.png) và ghi chú mô hình. System Admin là quyền trên User; không có thực thể Admin riêng.
- Lớp HTTP → service → repository → PostgreSQL phù hợp mục 6 của đặc tả. Bảng Session là hạ tầng để hiện thực hóa token/session của UC02; không thay thế thực thể nghiệp vụ trong ERD.
- Module A chưa đầy đủ vì UC04 chưa có. Việc bước 3 của lộ trình đã hoàn thành chỉ nói đến đợt triển khai tài khoản cơ bản.

## Lựa chọn triển khai ngoài chi tiết đặc tả

Task bước 6 đối chiếu image38/image39/image40/image52. Quyền đổi trạng thái PM hoặc assignee, chỉ chuyển bước kế tiếp, cảnh báo BLOCKED cần xác nhận, phân trang 20, priority mặc định MEDIUM và giữ assignee DONE sau xóa membership là lựa chọn triển khai ghi tại [bước 6](buoc-6.md). UC23 chưa nghiệm thu đầy đủ vì Dashboard/Progress chưa có; UC19 chưa chọn Sprint.

Project bước 5 đối chiếu UC12/UC13 chi tiết (image36/image37), sequence image17, ERD image29 và quy ước image51. UC14–UC17 chỉ có danh mục/quy tắc chung. Trạng thái ACTIVE/CLOSED, ngày tùy chọn, đóng chặn thay đổi nội dung, Owner vẫn chuyển PM sau đóng, PM tự vào Project, PM cũ giữ membership, phạm vi xem Member theo membership Project và giới hạn trường là lựa chọn triển khai ghi tại [bước 5](buoc-5.md).

React + Node.js + PostgreSQL do người dùng chọn. TypeScript, Express, Prisma, scrypt, cookie HttpOnly, thời hạn phiên 7 ngày, giới hạn 20 yêu cầu/15 phút và độ dài mật khẩu 15–128 ký tự là lựa chọn triển khai; tài liệu không quy định các công nghệ hoặc con số này. Chúng không phải yêu cầu nghiệp vụ trích nguyên từ tài liệu và có thể được điều chỉnh nếu cần.

## Các quy tắc bắt buộc cho những bước tiếp theo

- Workspace tạo cùng membership Owner trong transaction; Owner quản lý thành viên/vai trò và tạo Project.
- PM quản lý Project được giao; Owner không tự có quyền quản lý Task nếu thiếu quyền tương ứng.
- Assignee là thành viên Project; ngày kết thúc/deadline không trước ngày bắt đầu.
- Task TODO → IN_PROGRESS → REVIEW → DONE; BLOCKED là đánh giá dependency, không tự thêm thành trạng thái thay thế bộ trạng thái gốc.
- Sprint PLANNED → ACTIVE → COMPLETED; tối đa một ACTIVE mỗi Project; Sprint/Task cùng Project, không sao chép Task, giữ lịch sử.
- Effort thuộc 1, 2, 3, 5, 8; Capacity dương theo thành viên/Project/kỳ; Workload theo công thức đặc tả.
- Dependency cùng Project, không tự phụ thuộc hoặc chu trình. Điều phối chỉ đề xuất theo quy tắc; PM quyết định, hệ thống không tự phân công lại.
- Thông báo là phần hỗ trợ nghiệp vụ và phải được tích hợp vào các luồng nguồn yêu cầu, dù triển khai ở bước sau.
