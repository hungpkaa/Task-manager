# Task Manager — Đặc tả hệ thống quản lý công việc nhóm

Hệ thống hỗ trợ quản lý Workspace, Project, Task và quy trình Agile/Scrum theo Sprint.

> Nguồn: `sơ đồ (1).docx`. Tài liệu gốc gồm 54 ảnh. Bản Markdown viết lại danh mục chức năng, quy tắc nghiệp vụ và kiến trúc; các sơ đồ và bảng đặc tả gốc được giữ ở cuối tài liệu để đối chiếu chi tiết. Đây là tài liệu thiết kế, không phải xác nhận các chức năng đã được triển khai.

## Mục lục

- [1. Phạm vi và tác nhân](#1-phạm-vi-và-tác-nhân)
- [2. Danh mục Use Case](#2-danh-mục-use-case)
- [3. Quy tắc nghiệp vụ](#3-quy-tắc-nghiệp-vụ)
- [4. Các luồng nghiệp vụ trọng yếu](#4-các-luồng-nghiệp-vụ-trọng-yếu)
- [5. Mô hình dữ liệu và ràng buộc](#5-mô-hình-dữ-liệu-và-ràng-buộc)
- [6. Kiến trúc hệ thống](#6-kiến-trúc-hệ-thống)
- [7. Sơ đồ và đặc tả gốc](#7-sơ-đồ-và-đặc-tả-gốc)

## 1. Phạm vi và tác nhân

Tài liệu mô tả 4 tác nhân, 9 nhóm chức năng và 52 Use Case.

| Tác nhân | Vai trò |
| --- | --- |
| Member | Người sử dụng hệ thống; thực hiện đăng ký, đăng nhập, quên mật khẩu và các chức năng sau xác thực. |
| Workspace Owner | Người có quyền quản lý cao nhất trong Workspace. |
| Project Manager | Người được phân quyền quản lý một Project. |
| System Admin | Người quản trị ở cấp nền tảng. |

Trong Use Case Diagram, các tác nhân được biểu diễn độc lập, không nối tác nhân với tác nhân và không dùng quan hệ kế thừa/generalization. Liên kết tác nhân với Use Case dùng nét liền không mũi tên; chỉ dùng `include` hoặc `extend` khi có quan hệ rõ ràng.

## 2. Danh mục Use Case

### A. Xác thực và tài khoản

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC01 | Đăng ký tài khoản | Member |
| UC02 | Đăng nhập | Member |
| UC03 | Đăng xuất | Member |
| UC04 | Quên / đặt lại mật khẩu | Member |
| UC05 | Cập nhật hồ sơ cá nhân | Member |

### B. Quản lý Workspace và thành viên

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC06 | Tạo Workspace | Member |
| UC07 | Cập nhật Workspace | Workspace Owner |
| UC08 | Mời thành viên | Workspace Owner |
| UC09 | Xóa thành viên khỏi Workspace | Workspace Owner |
| UC10 | Quản lý vai trò thành viên | Workspace Owner |
| UC11 | Xem danh sách thành viên | Member / Workspace Owner |

### C. Quản lý Project

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC12 | Tạo Project | Workspace Owner |
| UC13 | Phân công Project Manager | Workspace Owner |
| UC14 | Cập nhật Project | Project Manager |
| UC15 | Đóng Project | Project Manager |
| UC16 | Quản lý thành viên Project | Project Manager |
| UC17 | Xem Project | Member / Project Manager / Workspace Owner |

### D. Quản lý Task và cộng tác

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC18 | Xem chi tiết Task | Member / Project Manager |
| UC19 | Tạo Task | Project Manager |
| UC20 | Cập nhật Task | Project Manager |
| UC21 | Xóa Task | Project Manager |
| UC22 | Gán / thay đổi người phụ trách | Project Manager |
| UC23 | Cập nhật trạng thái Task | Member |
| UC24 | Đặt Priority và Deadline | Project Manager |
| UC25 | Bình luận và @mention | Member |
| UC26 | Đính kèm tệp vào Task | Member |

UC32 cũng xuất hiện trong sơ đồ Task và cộng tác vì thông báo hỗ trợ các hoạt động nghiệp vụ này.

### E. Hiển thị và tổ chức công việc

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC27 | Xem My Tasks | Member |
| UC28 | Xem Kanban Board | Member |
| UC29 | Xem List/Table | Member |
| UC30 | Xem Calendar | Member |
| UC31 | Tìm kiếm, lọc và sắp xếp Task | Member |

### F. Thông báo, Dashboard và báo cáo tiến độ

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC32 | Xem và quản lý thông báo | Member |
| UC33 | Xem Dashboard cá nhân | Member |
| UC34 | Xem Dashboard Project | Project Manager |

Tài liệu gốc trình bày thông báo thành một sơ đồ riêng. Trong phân rã chức năng và quy ước đặc tả, thông báo là chức năng hỗ trợ quản lý Task/cộng tác, không trở thành module nghiệp vụ chính độc lập.

### G. Phân tích và hỗ trợ điều phối

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC35 | Thiết lập Effort và Capacity | Project Manager |
| UC36 | Quản lý Task Dependency | Project Manager |
| UC37 | Xem Workload thành viên | Project Manager |
| UC38 | Xem Project Risk | Project Manager |
| UC39 | Xem đề xuất điều phối | Project Manager |

### H. Quản trị hệ thống

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC40 | Xem danh sách người dùng hệ thống | System Admin |
| UC41 | Khóa / mở khóa tài khoản | System Admin |
| UC42 | Xem danh sách Workspace | System Admin |
| UC43 | Xem thống kê hệ thống | System Admin |

### I. Agile/Scrum và quản lý Sprint

| Mã | Chức năng | Tác nhân chính |
| --- | --- | --- |
| UC44 | Xem Product Backlog | Member / Project Manager |
| UC45 | Tạo Sprint | Project Manager |
| UC46 | Lập Sprint Backlog | Project Manager |
| UC47 | Bắt đầu Sprint | Project Manager |
| UC48 | Theo dõi Sprint | Member / Project Manager |
| UC49 | Cập nhật Daily Update | Member |
| UC50 | Thực hiện Sprint Review | Project Manager |
| UC51 | Thực hiện Sprint Retrospective | Member / Project Manager |
| UC52 | Kết thúc Sprint | Project Manager |

## 3. Quy tắc nghiệp vụ

### Trạng thái và Backlog

- Trạng thái Task: `TODO → IN_PROGRESS → REVIEW → DONE`.
- Trạng thái Sprint: `PLANNED → ACTIVE → COMPLETED`.
- Task có `sprint_id = NULL` nằm trong Product Backlog.
- Sprint tổ chức các Task hiện có theo chu kỳ; không thay thế Task hoặc tạo bản sao Task.
- Mỗi Project có tối đa một Sprint `ACTIVE` tại cùng thời điểm.
- Task có thể chưa được gán assignee hoặc chưa thuộc Sprint.
- Task `DONE` không tự động bị xóa. Sprint `COMPLETED` được giữ lại làm lịch sử.

### Phân quyền và dữ liệu

- Workspace Owner tạo Project và phân công Project Manager.
- Project Manager quản lý Task trong Project được giao. Workspace Owner chỉ quản lý Task khi có quyền tương ứng.
- Người phụ trách Task phải là thành viên của Project.
- Chỉ thành viên trong Project mới được phân công Task.
- Khi có cả hai ngày, `due_date >= start_date`.
- Sprint có `end_date >= start_date`.

### Điều phối

- Effort dùng thang `1, 2, 3, 5, 8` theo đặc tả UC35.
- Capacity phải lớn hơn 0 và được quản lý theo Project, thành viên và khoảng thời gian.
- `Workload (%) = Tổng Effort của Task đang hoạt động / Capacity × 100`.
- Dependency chỉ liên kết Task trong cùng Project; không tự phụ thuộc và không tạo chu trình.
- Task bị đánh giá `BLOCKED` khi có dependency chưa `DONE`. Khi cập nhật trạng thái, hệ thống kiểm tra quyền và dependency, đồng thời cảnh báo nếu bị chặn.
- Workload, Project Risk và Recommendation được tính theo quy tắc (rule-based).
- Recommendation chỉ đưa ra đề xuất; Project Manager quyết định việc điều phối.
- Coordination Analysis chỉ đọc và đánh giá dữ liệu, không tự động thay đổi Task.

### Quy trình xử lý chung

**Xem dữ liệu:** kiểm tra quyền truy cập → nhận bộ lọc/ID → truy vấn dữ liệu → tổng hợp/biến đổi → trả kết quả.

**Cập nhật hoặc xóa:** xác thực tác nhân → kiểm tra quyền → kiểm tra bản ghi tồn tại → kiểm tra quy tắc nghiệp vụ → cập nhật/xóa → ghi nhận kết quả và thông báo.

## 4. Các luồng nghiệp vụ trọng yếu

Phần này viết lại luồng chính và điều kiện quan trọng của 18 Use Case được đặc tả trong tài liệu nguồn. Bảng gốc ở phần 7 giữ đầy đủ tiền điều kiện, hậu điều kiện, luồng thay thế và ngoại lệ.

### UC02 — Đăng nhập

Member mở màn hình đăng nhập, nhập email và mật khẩu. Hệ thống kiểm tra định dạng, tìm tài khoản, kiểm tra mật khẩu và trạng thái tài khoản, sau đó tạo token/session và chuyển đến trang sau đăng nhập. Sai thông tin đăng nhập hoặc tài khoản bị khóa sẽ bị từ chối. Mật khẩu được lưu dưới dạng hash.

### UC06 — Tạo Workspace

Member đã đăng nhập chọn tạo Workspace, nhập tên và thông tin cơ bản. Hệ thống kiểm tra dữ liệu, lưu Workspace và quan hệ thành viên với vai trò Owner. Người tạo tự động trở thành Workspace Owner. Dữ liệu không hợp lệ được yêu cầu nhập lại; lỗi lưu phải được báo, không để dữ liệu thành viên dang dở.

### UC08 — Mời thành viên vào Workspace

Workspace Owner mở danh sách thành viên, nhập email người được mời. Hệ thống kiểm tra quyền, tìm hoặc tạo membership theo cơ chế triển khai, lưu và gửi thông báo. Người đã là thành viên không được tạo bản ghi trùng; email không tồn tại hoặc không hợp lệ bị từ chối. Chỉ Owner được quản lý thành viên và vai trò ở phạm vi Workspace.

### UC12 — Tạo Project

Workspace Owner mở Workspace, chọn tạo Project và nhập tên, mô tả, dữ liệu cần thiết. Hệ thống kiểm tra quyền, kiểm tra dữ liệu, lưu và hiển thị Project. Project luôn thuộc một Workspace. Workspace không tồn tại hoặc người dùng không có quyền sẽ bị từ chối.

### UC13 — Phân công Project Manager

Owner mở Project và chọn thành viên phù hợp làm Project Manager. Hệ thống kiểm tra quyền và membership, cập nhật `manager_user_id`, sau đó thông báo kết quả. Có thể yêu cầu xác nhận trước khi thay thế Manager hiện tại. Người được chọn phải thuộc Workspace; Project Manager là Member có thêm quyền quản lý Project.

### UC19 — Tạo Task

Project Manager mở Project, nhập tiêu đề, mô tả và có thể thiết lập priority, ngày tháng, effort, assignee. Hệ thống kiểm tra quyền và dữ liệu, lưu Task và gửi thông báo khi có phân công. Task mới mặc định `TODO`; có thể chưa có assignee hoặc Sprint. Deadline trước ngày bắt đầu hoặc assignee ngoài Project bị từ chối.

### UC22 — Gán hoặc thay đổi người phụ trách Task

Project Manager mở Task, xem danh sách thành viên Project và chọn assignee. Hệ thống kiểm tra membership, cập nhật và gửi thông báo. Nếu được phép có thể bỏ assignee. Người ngoài Project bị từ chối; đề xuất điều phối không tự động thực hiện phân công.

### UC23 — Cập nhật trạng thái Task

Member có quyền truy cập mở Task và chọn trạng thái mới. Hệ thống kiểm tra quyền và dependency, cảnh báo nếu `BLOCKED`, cập nhật trạng thái và dữ liệu Dashboard. Trạng thái không hợp lệ hoặc thiếu quyền bị từ chối.

### UC35 — Thiết lập Effort và Capacity

Project Manager mở phần điều phối, thiết lập Effort cho Task và Capacity cho thành viên theo kỳ. Hệ thống kiểm tra dữ liệu, lưu và tính lại Workload. Có thể cập nhật Capacity khi kỳ làm việc thay đổi. Capacity không dương hoặc Effort ngoài tập giá trị được phép bị từ chối.

### UC36 — Quản lý Task Dependency

Project Manager chọn Task và Task phụ thuộc trong cùng Project. Hệ thống kiểm tra quyền, membership của Task, tự phụ thuộc và chu trình; lưu dependency rồi cập nhật đánh giá `BLOCKED`/Risk. Có thể xóa dependency hiện có. Liên kết khác Project, tự phụ thuộc hoặc tạo chu trình bị từ chối.

### UC45 — Tạo Sprint

Project Manager nhập tên Sprint, Sprint Goal, ngày bắt đầu và ngày kết thúc. Hệ thống kiểm tra quyền và dữ liệu, lưu Sprint ở trạng thái `PLANNED`. Sprint có thể được tạo trước để lập kế hoạch; ngày kết thúc trước ngày bắt đầu bị từ chối.

### UC46 — Lập Sprint Backlog

Project Manager mở Sprint chưa `COMPLETED`, xem Product Backlog và chọn Task. Hệ thống kiểm tra Effort, Workload/Capacity và Dependency, hiển thị cảnh báo nếu có rủi ro. Sau xác nhận, hệ thống cập nhật `sprint_id` và Sprint Backlog. Khi Sprint bắt đầu, Task có thể được đưa về Product Backlog. Task phải cùng Project và chỉ thuộc tối đa một Sprint tại một thời điểm; cảnh báo không tự động quyết định thay PM.

### UC47 — Bắt đầu Sprint

Project Manager mở Sprint `PLANNED` và chọn bắt đầu. Hệ thống kiểm tra Sprint Goal, Sprint Backlog có ít nhất một Task và Project chưa có Sprint `ACTIVE` khác. Khi hợp lệ, chuyển Sprint sang `ACTIVE` và hiển thị Dashboard/Board. Cảnh báo Workload hoặc Risk được hiển thị để PM cân nhắc.

### UC48 — Theo dõi Sprint

Member hoặc Project Manager thuộc Project mở Sprint. Hệ thống tải Sprint Goal, thời gian, Sprint Backlog, tổng hợp trạng thái Task và thời gian còn lại, hiển thị `BLOCKED`/overdue và cảnh báo liên quan. Người dùng có thể mở Task hoặc lọc theo assignee, status, priority. Dashboard có thể dùng Workload, Dependency và Project Risk.

### UC49 — Cập nhật Daily Update

Member thuộc Project/Sprint mở Sprint `ACTIVE`, chọn Daily Update và nhập tiến độ, kế hoạch, blocker. Hệ thống kiểm tra và lưu cập nhật. Có thể cho phép sửa cập nhật trong ngày tùy quy định triển khai. Daily Update hỗ trợ Daily Scrum và trao đổi nhóm, không thay thế cập nhật trạng thái Task.

### UC50 — Thực hiện Sprint Review

Project Manager mở Sprint, xem tổng hợp Task `DONE`/chưa `DONE`, nhập summary và feedback. Hệ thống kiểm tra quyền, lưu bản ghi Review. Có thể cập nhật Review trước khi Sprint được chốt. Review tập trung vào kết quả và phản hồi, khác với Retrospective.

### UC51 — Thực hiện Sprint Retrospective

Member hoặc Project Manager thuộc Project mở phần Retrospective, ghi điều làm tốt, điều cần cải thiện và action items. Hệ thống kiểm tra quyền, lưu và hiển thị nội dung. Có thể cập nhật trước khi Sprint được đóng nếu policy cho phép. Retrospective tập trung vào cách làm việc và cải tiến quy trình.

### UC52 — Kết thúc Sprint

Project Manager mở Sprint `ACTIVE` và chọn kết thúc. Hệ thống tổng hợp Task `DONE`/chưa `DONE`; PM quyết định cách xử lý Task chưa hoàn thành. Hệ thống chuyển Task về Product Backlog hoặc sang Sprint phù hợp, cập nhật liên kết Task, chuyển Sprint sang `COMPLETED` và lưu kết quả/lịch sử. Nếu còn Task chưa hoàn thành, PM có thể hủy thao tác để xử lý tiếp. Không được chuyển Task sang Sprint thuộc Project khác.

## 5. Mô hình dữ liệu và ràng buộc

### Các nhóm thực thể

| Nhóm | Thực thể / bảng chính |
| --- | --- |
| Identity | User / USERS, PasswordResetToken / PASSWORD_RESET_TOKENS, Notification / NOTIFICATIONS |
| Workspace | Workspace / WORKSPACES, WorkspaceMember / WORKSPACE_MEMBERS |
| Project | Project / PROJECTS, ProjectMember / PROJECT_MEMBERS, MemberCapacity / MEMBER_CAPACITIES |
| Sprint | Sprint / SPRINTS, DailyUpdate / DAILY_UPDATES, SprintReview / SPRINT_REVIEWS, SprintRetrospective / SPRINT_RETROSPECTIVES |
| Task và cộng tác | Task / TASKS, TaskDependency / TASK_DEPENDENCIES, Comment / COMMENTS, CommentMention / COMMENT_MENTIONS, Attachment / TASK_ATTACHMENTS |

- User chứa `systemRole`; System Admin được biểu diễn bằng quyền hệ thống, không phải thực thể riêng.
- `Task.sprintId` cho phép `NULL`: không thuộc Sprint nghĩa là nằm trong Product Backlog.
- MemberCapacity gắn với Project, User và khoảng thời gian để phù hợp Capacity theo kỳ làm việc.
- TaskDependency có hai vai trò `task` và `dependsOnTask`, cùng tham chiếu Task.
- CommentMention biểu diễn quan hệ nhiều–nhiều giữa Comment và User được @mention.
- Các FK `user_id`, `assignee_id`, `uploaded_by`, `manager_user_id`, `created_by` tham chiếu USERS.
- AnalysisEngine tính Workload, Project Risk và Recommendation theo quy tắc; không bắt buộc lưu như thực thể.

### Ràng buộc cần thực thi

| Nhóm | Quy tắc |
| --- | --- |
| Ngày tháng Task | `CHECK due_date >= start_date` khi cả hai có giá trị. |
| Ngày tháng Sprint | `CHECK end_date >= start_date`. |
| Sprint ACTIVE | Mỗi Project tối đa một Sprint ACTIVE; thực thi bằng service hoặc unique partial index nếu DB hỗ trợ. |
| Task–Sprint | Nếu `tasks.sprint_id != NULL`, Sprint phải thuộc cùng `tasks.project_id`. |
| Assignee | `assignee_id` phải là thành viên Project tương ứng. |
| Project Manager | `manager_user_id` phải thuộc Workspace/Project theo quy tắc nghiệp vụ. |
| Dependency | `UNIQUE(task_id, depends_on_task_id)`; hai ID khác nhau, cùng Project và không tạo chu trình. |
| CommentMention | Khóa ghép `(comment_id, user_id)` tránh một User bị mention lặp trong cùng Comment. |
| Review / Retrospective | `sprint_id` UNIQUE ở mỗi bảng; mỗi Sprint có tối đa một bản ghi tổng hợp trong từng bảng. |
| Capacity | `capacity_points > 0`; `period_end >= period_start`. |

### Ghi chú triển khai

- Project Risk và Recommendation có thể được tính động hoặc cache; không bắt buộc có bảng riêng.
- NOTIFICATIONS dùng `related_entity_type` và `related_entity_id` để tham chiếu Task, Workspace, Project hoặc Sprint.
- PASSWORD_RESET_TOKENS là hạ tầng phục vụ UC04.
- Không tạo quan hệ System Admin sở hữu Users/Workspaces chỉ vì Admin có quyền quản trị; quyền truy cập là logic authorization.

## 6. Kiến trúc hệ thống

Luồng xử lý chuẩn:

```mermaid
flowchart LR
    UI[Web Client] --> API[REST API / Controller]
    API --> Service[Domain Service / Component]
    Service --> Repo[Repository]
    Repo --> DB[(Database)]
```

UI không truy cập trực tiếp Database. Dữ liệu đi qua service/component và lớp truy cập dữ liệu.

| Component | Trách nhiệm |
| --- | --- |
| Identity & Account | Đăng ký, đăng nhập, hồ sơ, đặt lại mật khẩu và trạng thái tài khoản. |
| Workspace Management | Workspace, thành viên và vai trò trong Workspace. |
| Project Management | Project, thành viên Project và phân công Project Manager. |
| Sprint Management | Product Backlog, Sprint, Sprint Backlog, bắt đầu/kết thúc Sprint, Daily Update, Review và Retrospective. |
| Task Management | CRUD Task, assignee, status, priority, deadline, effort và liên kết Sprint. |
| Collaboration | Comment, @mention và attachment. |
| Coordination Analysis | Workload, Dependency/BLOCKED, Project Risk và Recommendation theo quy tắc. |
| Notification | Tạo, lưu và đánh dấu đã đọc các thông báo nghiệp vụ. |
| Dashboard & Reporting | Tổng hợp dữ liệu cá nhân/Project/Sprint và chỉ số tiến độ. |
| System Administration | Danh sách user/workspace, khóa/mở khóa tài khoản và thống kê. |

Sprint Management sử dụng Task Management để tổ chức Task qua `sprint_id`. Notification nhận sự kiện nghiệp vụ từ Task, Collaboration và Sprint; cơ chế giao thông báo cụ thể được chốt khi triển khai.

## 7. Sơ đồ và đặc tả gốc

Các ảnh dưới đây được trích nguyên bản từ tài liệu Word, giữ đúng thứ tự. Mở ảnh để xem đầy đủ nhãn quan hệ, trường dữ liệu và bảng đặc tả.

### 7.1. Use Case tổng quát

#### Use Case tổng quát

![Use Case tổng quát](assets/so-do/image1.png)

### 7.2. Use Case theo module

#### Xác thực và tài khoản

![Xác thực và tài khoản](assets/so-do/image2.png)

#### Workspace và thành viên

![Workspace và thành viên](assets/so-do/image3.png)

#### Quản lý Project

![Quản lý Project](assets/so-do/image4.png)

#### Task và cộng tác

![Task và cộng tác](assets/so-do/image5.png)

#### Hiển thị và tổ chức công việc

![Hiển thị và tổ chức công việc](assets/so-do/image6.png)

#### Thông báo

![Thông báo](assets/so-do/image7.png)

#### Dashboard và báo cáo tiến độ

![Dashboard và báo cáo tiến độ](assets/so-do/image8.png)

#### Phân tích và hỗ trợ điều phối

![Phân tích và hỗ trợ điều phối](assets/so-do/image9.png)

#### Quản trị hệ thống

![Quản trị hệ thống](assets/so-do/image10.png)

#### Agile/Scrum và Sprint

![Agile/Scrum và Sprint](assets/so-do/image11.png)

### 7.3. Phân rã chức năng

#### Phân rã chức năng — phần 1

![Phân rã chức năng — phần 1](assets/so-do/image12.png)

#### Phân rã chức năng — phần 2

![Phân rã chức năng — phần 2](assets/so-do/image13.png)

### 7.4. Sequence Diagram

#### SEQ-A — Đăng nhập (UC02)

![SEQ-A — Đăng nhập (UC02)](assets/so-do/image14.png)

#### SEQ-B1 — Tạo Workspace (UC06)

![SEQ-B1 — Tạo Workspace (UC06)](assets/so-do/image15.png)

#### SEQ-B2 — Mời thành viên (UC08)

![SEQ-B2 — Mời thành viên (UC08)](assets/so-do/image16.png)

#### SEQ-C — Tạo Project và phân công Project Manager (UC12, UC13)

![SEQ-C — Tạo Project và phân công Project Manager (UC12, UC13)](assets/so-do/image17.png)

#### SEQ-D — Tạo, phân công và cập nhật Task (UC19, UC22, UC23, UC24)

![SEQ-D — Tạo, phân công và cập nhật Task (UC19, UC22, UC23, UC24)](assets/so-do/image18.png)

#### SEQ-E — Xem/lọc công việc (UC27–UC31)

![SEQ-E — Xem/lọc công việc (UC27–UC31)](assets/so-do/image19.png)

#### SEQ-F — Bình luận, mention và thông báo (UC25, UC32)

![SEQ-F — Bình luận, mention và thông báo (UC25, UC32)](assets/so-do/image20.png)

#### SEQ-G — Dashboard Project (UC34)

![SEQ-G — Dashboard Project (UC34)](assets/so-do/image21.png)

#### SEQ-H — Workload, Dependency, Risk và Recommendation (UC35–UC39)

![SEQ-H — Workload, Dependency, Risk và Recommendation (UC35–UC39)](assets/so-do/image22.png)

#### SEQ-I — Khóa/mở khóa tài khoản (UC41)

![SEQ-I — Khóa/mở khóa tài khoản (UC41)](assets/so-do/image23.png)

#### SEQ-J1 — Product Backlog, tạo Sprint và Sprint Backlog (UC44–UC46)

![SEQ-J1 — Product Backlog, tạo Sprint và Sprint Backlog (UC44–UC46)](assets/so-do/image24.png)

#### SEQ-J2 — Bắt đầu và theo dõi Sprint (UC47, UC48)

![SEQ-J2 — Bắt đầu và theo dõi Sprint (UC47, UC48)](assets/so-do/image25.png)

#### SEQ-J3 — Review, Retrospective và kết thúc Sprint (UC50–UC52)

![SEQ-J3 — Review, Retrospective và kết thúc Sprint (UC50–UC52)](assets/so-do/image26.png)

### 7.5. UML Class Diagram

#### UML Class Diagram toàn hệ thống

![UML Class Diagram toàn hệ thống](assets/so-do/image27.png)

#### Ghi chú Class Diagram

![Ghi chú Class Diagram](assets/so-do/image28.png)

### 7.6. ERD

#### ERD toàn hệ thống

![ERD toàn hệ thống](assets/so-do/image29.png)

#### Ràng buộc dữ liệu và ghi chú triển khai

![Ràng buộc dữ liệu và ghi chú triển khai](assets/so-do/image30.png)

### 7.7. Quy ước đặc tả Use Case

#### Quy ước chung và danh sách đặc tả — phần 1

![Quy ước chung và danh sách đặc tả — phần 1](assets/so-do/image31.png)

#### Danh sách đặc tả — phần 2

![Danh sách đặc tả — phần 2](assets/so-do/image32.png)

### 7.8. Đặc tả Use Case trọng yếu

#### UC02 — Đăng nhập

![UC02 — Đăng nhập](assets/so-do/image33.png)

#### UC06 — Tạo Workspace

![UC06 — Tạo Workspace](assets/so-do/image34.png)

#### UC08 — Mời thành viên

![UC08 — Mời thành viên](assets/so-do/image35.png)

#### UC12 — Tạo Project

![UC12 — Tạo Project](assets/so-do/image36.png)

#### UC13 — Phân công Project Manager

![UC13 — Phân công Project Manager](assets/so-do/image37.png)

#### UC19 — Tạo Task

![UC19 — Tạo Task](assets/so-do/image38.png)

#### UC22 — Gán/thay đổi người phụ trách Task

![UC22 — Gán/thay đổi người phụ trách Task](assets/so-do/image39.png)

#### UC23 — Cập nhật trạng thái Task

![UC23 — Cập nhật trạng thái Task](assets/so-do/image40.png)

#### UC35 — Thiết lập Effort và Capacity

![UC35 — Thiết lập Effort và Capacity](assets/so-do/image41.png)

#### UC36 — Quản lý Task Dependency

![UC36 — Quản lý Task Dependency](assets/so-do/image42.png)

#### UC45 — Tạo Sprint

![UC45 — Tạo Sprint](assets/so-do/image43.png)

#### UC46 — Lập Sprint Backlog

![UC46 — Lập Sprint Backlog](assets/so-do/image44.png)

#### UC47 — Bắt đầu Sprint

![UC47 — Bắt đầu Sprint](assets/so-do/image45.png)

#### UC48 — Theo dõi Sprint

![UC48 — Theo dõi Sprint](assets/so-do/image46.png)

#### UC49 — Daily Update

![UC49 — Daily Update](assets/so-do/image47.png)

#### UC50 — Sprint Review

![UC50 — Sprint Review](assets/so-do/image48.png)

#### UC51 — Sprint Retrospective

![UC51 — Sprint Retrospective](assets/so-do/image49.png)

#### UC52 — Kết thúc Sprint

![UC52 — Kết thúc Sprint](assets/so-do/image50.png)

### 7.9. Ghi chú cho các Use Case còn lại

#### Ghi chú áp dụng cho các Use Case còn lại

![Ghi chú áp dụng cho các Use Case còn lại](assets/so-do/image51.png)

### 7.10. Activity Diagram — Tạo Task

#### Activity Diagram — Tạo Task và bảng quy tắc

![Activity Diagram — Tạo Task và bảng quy tắc](assets/so-do/image52.png)

### 7.11. Component Diagram — Kiến trúc hệ thống

#### Component Diagram

![Component Diagram](assets/so-do/image53.png)

#### Trách nhiệm component và nguyên tắc đồng bộ

![Trách nhiệm component và nguyên tắc đồng bộ](assets/so-do/image54.png)
