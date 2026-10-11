# Hướng dẫn sử dụng phiên bản đầu

Mở http://127.0.0.1:5173 sau khi ứng dụng và PostgreSQL đã chạy theo README. Nhóm có thể dùng ba tài khoản riêng để thử Owner, Project Manager (PM) và Member. Mỗi người đăng ký tên, email và mật khẩu 15–128 ký tự; dùng cửa sổ riêng hoặc đăng xuất khi đổi tài khoản.

## Tạo nhóm và dự án

1. Owner vào **Workspace**, tạo không gian làm việc. Người tạo tự trở thành Owner.
2. Mở Workspace và thêm email các tài khoản đã đăng ký. Người được thêm xem **Thông báo** và Workspace của mình. Phiên bản này chưa gửi email mời cho người chưa có tài khoản.
3. Owner mở **Project**, tạo dự án rồi chọn và xác nhận PM từ thành viên Workspace.
4. PM mở Project, thêm thành viên từ Workspace vào dự án. Vai trò Owner của Workspace không tự cấp quyền quản lý Task; muốn quản lý nội dung dự án cần được phân công PM.

## Giao và xử lý công việc

PM mở Project → **Task → Tạo Task**. Nhập tiêu đề, mô tả, priority, ngày bắt đầu/deadline và effort nếu cần; chọn người phụ trách thuộc Project hoặc để chưa phân công. Deadline phải từ ngày bắt đầu trở đi.

Người được giao mở **My Tasks** hoặc **Thông báo** để vào chi tiết. Người phụ trách và PM có thể chuyển tuần tự **Cần làm → Đang làm → Chờ duyệt → Hoàn thành**. PM sửa thông tin, phân công lại hoặc xóa với xác nhận. Nếu dependency chưa hoàn thành, hệ thống cảnh báo và yêu cầu xác nhận tiếp tục; giao diện quản lý dependency thuộc giai đoạn sau.

Trong Project, đổi giữa **Danh sách/Kanban**, tìm kiếm hoặc lọc theo trạng thái, priority, người phụ trách; bấm **Áp dụng** để cập nhật. Danh sách và Kanban cùng dùng dữ liệu phân trang: dùng Trang trước/Trang sau để xem đủ công việc. Trên điện thoại, cuộn ngang bên trong Kanban để xem các cột còn lại.

## Chuyển giao và kết thúc

Task chưa Hoàn thành phải được chuyển giao hoặc bỏ phân công trước khi xóa thành viên khỏi Project/Workspace. Thành viên đang là PM phải được thay PM trước khi xóa khỏi Workspace. Workspace luôn giữ ít nhất một Owner.

PM chỉ đóng Project khi mọi Task đã DONE và không còn Sprint ACTIVE. Dự án đóng và Task bên trong chỉ đọc; Owner vẫn có thể đổi PM để chuyển giao trách nhiệm. Lịch sử người phụ trách của Task đã hoàn thành được giữ lại.

## Điều hướng và xử lý lỗi

Bấm **Workspace** hoặc **My Tasks** ở menu để về danh sách, kể cả khi đang xem chi tiết. Tải lại trang giữ phiên đăng nhập nhưng không giữ đường dẫn chi tiết; ứng dụng hiện điều hướng bằng trạng thái trong trang. **Hồ sơ cá nhân** cho phép đổi tên hiển thị; **Đăng xuất** thu hồi phiên hiện tại.

Nếu lỗi mạng, kiểm tra API/PostgreSQL rồi bấm **Thử lại** nơi có nút. Khi phiên hết hạn, đăng nhập lại. Nếu thao tác bị từ chối do quyền hoặc dữ liệu đã đổi, tải lại danh sách và liên hệ Owner/PM của nhóm để chuyển giao đúng vai trò.

Trong chi tiết Task, thành viên Project có thể nhập **Nội dung bình luận**, chọn **Nhắc thành viên (@mention)** rồi **Gửi bình luận**. Người được nhắc nhận thông báo và mở Task từ đó. Chọn thành viên sẽ chèn `@{email}` vào nội dung; giữ ký hiệu này để gửi mention. Có thể gửi bình luận không mention; lịch sử mới nhất trước, 20 bình luận mỗi trang. Project đã đóng chỉ cho xem lịch sử.

Trong chi tiết Task → **Tệp đính kèm**, chọn tệp rồi **Đính kèm tệp**. Mỗi tệp có nội dung và tối đa 10 MB; hỗ trợ PDF, PNG/JPG, TXT, CSV, MD, ZIP, DOCX/XLSX/PPTX. Bấm **Tải xuống** để lưu về máy. Người tải lên hoặc PM có thể **Xóa tệp** với xác nhận; bấm Hủy giữ lại tệp. Tải lại trang vẫn xem và tải xuống được tệp đã lưu. Project đóng chỉ cho tải xuống, không tải lên/xóa; người ngoài Project không tự có quyền từ đường dẫn tệp.

Nếu quên mật khẩu, ở màn hình đăng nhập chọn **Quên mật khẩu?**, nhập email tài khoản và gửi yêu cầu. Hiện email đi vào hộp thư thử cục bộ: người chạy dự án dùng `npm.cmd run mail:preview -- email-cua-ban@example.com` để xem rồi mở liên kết. Nhập và xác nhận mật khẩu mới 15–128 ký tự; đổi xong đăng nhập lại. Mọi phiên cũ bị thu hồi. Liên kết dùng một lần/30 phút; khi cần yêu cầu lại, chờ ít nhất 60 giây và dùng email mới nhất. Nếu tải lại form reset, mở lại liên kết từ email.

Thêm thành viên Workspace cũng tạo email mời trong hộp thư thử. Owner có thể **Gửi lại email mời**; gửi lại không thêm thành viên lần nữa. Nếu tạo email lỗi, thông báo và thành viên đã thêm vẫn còn. Chế độ thử chưa gửi đến hộp thư Internet.

Trong Project, bấm **Mở Sprint & Backlog**. PM nhập tên, Sprint Goal và ngày để **Tạo Sprint PLANNED**; chọn Task từ **Product Backlog** → **Kiểm tra kế hoạch** → đọc cảnh báo → **Xác nhận đưa vào Sprint**. Chuyển **Sprint Backlog** để xem hoặc đưa Task về Product Backlog trước khi Sprint bắt đầu; thao tác đưa về cần xác nhận. Thành viên và Owner xem được nhưng chỉ PM lập kế hoạch. Task/Sprint phân trang 20; lựa chọn Task chỉ giữ trên trang hiện tại. Khi sửa Task ở khu vực Task, bấm **Tải lại Sprint & Backlog** để lấy dữ liệu mới.

PM chọn Sprint PLANNED → **Bắt đầu Sprint** → xem cảnh báo → xác nhận. Cần có Goal, ít nhất một Task và chưa có Sprint ACTIVE trong Project. Bắt đầu tạo thông báo cho thành viên Project và mở trang theo dõi. Thành viên Project có thể chọn Sprint → **Theo dõi Sprint** để xem Goal, tiến độ, Task BLOCKED/quá hạn và Board/danh sách. Lọc theo trạng thái, priority, người phụ trách; số liệu tổng vẫn tính toàn Sprint. Bấm Task để mở chi tiết; **Về theo dõi Sprint** tải lại tiến độ sau khi sửa. Board phân trang 20, dùng nút trang để xem đủ Task. Khi có thay đổi từ người khác, bấm **Tải lại tiến độ Sprint**.

Owner chưa được thêm vào Project xem Backlog, nhưng cần membership Project để mở Dashboard Sprint. PM xem được Capacity/Workload trong kế hoạch, bước bắt đầu và theo dõi Sprint; Risk còn chờ tích hợp. Calendar và Dashboard phân tích chưa hoàn thiện. Xem [bảng Use Case](doi-chieu-use-case.md), [bước 9](buoc-9.md) và [bước 10](buoc-10.md) để biết phạm vi hiện tại.

## Daily Update trong Sprint

Mở Project → **Mở Sprint & Backlog** → chọn Sprint → **Theo dõi Sprint**. Khi Sprint ACTIVE, nhập **Tiến độ đã thực hiện**, **Kế hoạch tiếp theo**, **Blocker** rồi chọn **Gửi Daily Update**. Blocker có thể để trống. Mỗi lần gửi được giữ riêng theo thời gian; nhóm xem lịch sử ngay bên dưới, dùng **Tải lại Daily Update** để lấy cập nhật mới. Daily Update không thay thế cập nhật trạng thái Task.

## Sprint Review

Trong **Theo dõi Sprint**, PM nhập **Tổng kết Sprint** và **Phản hồi Sprint**, chọn **Lưu Sprint Review**. Có thể sửa trước khi Sprint hoàn thành; mỗi trường bắt buộc, tối đa 4000 ký tự. Thành viên Project xem bản đã lưu cùng người cập nhật và số Task DONE/chưa DONE tại lần lưu. Số liệu hiện tại hiển thị riêng. Nếu Review đã thay đổi ở cửa sổ khác, bản sửa cũ bị từ chối; dùng **Tải lại Sprint Review** để lấy bản mới (thao tác này thay nội dung đang nhập bằng bản đã lưu).

## Sprint Retrospective

Thành viên và PM mở **Theo dõi Sprint** → phần **Sprint Retrospective**, nhập **Điều làm tốt**, **Điều cần cải thiện**, **Việc sẽ thực hiện** rồi chọn **Lưu Retrospective**. Đây là bản tổng hợp chung của nhóm, có thể sửa trước khi Sprint hoàn thành; cả ba trường bắt buộc, tối đa 4000 ký tự. Nếu có người vừa sửa, bản cũ bị từ chối và nội dung đang nhập vẫn giữ nguyên. Sao chép các ý cần giữ trước khi chọn **Tải lại Retrospective**, vì thao tác này lấy bản mới và thay nội dung đang nhập. Sau khi đóng Sprint/Project, chỉ xem bản đã lưu.

## Kết thúc Sprint

PM chọn Sprint ACTIVE → **Kết thúc Sprint**, xem số Task DONE/chưa DONE. Chọn Product Backlog hoặc một Sprint PLANNED cùng Project để nhận toàn bộ Task chưa DONE, rồi **Xác nhận kết thúc Sprint**; có thể chọn **Hủy kết thúc Sprint** để tiếp tục làm việc. Task giữ nguyên trạng thái và Task DONE ở lại Sprint. Nếu dữ liệu vừa thay đổi, kiểm tra kết thúc lại. Sau khi thành công, Sprint COMPLETED và thành viên nhận thông báo. Mở **Theo dõi Sprint** → **Kết quả khi kết thúc Sprint** để xem lịch sử chuyển tiếp.

## Chọn Sprint khi tạo Task

PM mở Project → **+ Tạo Task** → **Sprint khi tạo Task**, chọn Sprint PLANNED/ACTIVE hoặc giữ mặc định **Product Backlog**. Dùng nút trang trước/sau để tìm Sprint và **Tải lại lựa chọn Sprint** để cập nhật danh sách. Kiểm tra Effort, assignee và deadline trước khi tạo. Nếu Sprint vừa hoàn thành, chọn Sprint khác hoặc Product Backlog rồi gửi lại. Task đã tạo sẽ xuất hiện trong Sprint Backlog được chọn; nhấn tải lại Sprint & Backlog nếu đang mở màn hình đó.

## Task Dependency

Mở chi tiết Task → **Task Dependency**. PM tìm Task cùng Project, chọn **Task phụ thuộc** rồi **Thêm dependency**. Task hiện tại sẽ BLOCKED khi Task được chọn chưa DONE. Hệ thống từ chối liên kết trùng, tự phụ thuộc và chu trình nhiều tầng. Trạng thái Task vẫn do người có quyền cập nhật.

Chọn **Xóa dependency** rồi xác nhận hoặc hủy; thao tác chỉ xóa liên kết. Danh sách dependency và Task lựa chọn phân trang 20. Thành viên/Owner xem được; chỉ PM quản lý trong Project ACTIVE. Khi Task khác thay đổi, chọn **Tải lại dependency** để cập nhật cả BLOCKED. Risk sẽ được tích hợp ở phần tiếp theo của bước 10.

## Capacity và Workload

PM mở Project → **Mở Capacity & Workload**, nhập ngày bắt đầu/kết thúc kỳ rồi **Xem Workload**. Chọn **Thiết lập Capacity** ở thành viên, nhập điểm nguyên dương → **Lưu Capacity**; có thể hủy sửa. Kết quả được tính lại sau khi lưu. Chọn **Xem kỳ này** trong lịch sử để mở đúng kỳ và sửa Capacity đã có. Nếu có người vừa thay đổi, tải lại Workload rồi nhập lại.

Workload dùng tổng Effort Task TODO/IN_PROGRESS/REVIEW có thời gian giao với kỳ, chia Capacity của đúng thành viên/Project/kỳ. Ngày thiếu được xem là đầu/cuối không giới hạn; Task thiếu cả hai ngày được tính vào mọi kỳ. Không chia Effort hoặc Capacity theo số ngày. Quá tải khi trên 100%; nếu thiếu Capacity thì chưa tính tỷ lệ, thiếu Effort thì tỷ lệ chỉ dựa trên phần đã biết. Task chưa phân công được báo riêng. Đặt Effort trong chi tiết Task rồi **Tải lại Workload**.

Các kỳ Capacity của cùng thành viên không được chồng nhau (cả hai ngày biên thuộc kỳ). Kỳ mới cần bắt đầu sau kỳ trước. Capacity/lịch sử giữ lại khi thành viên rời Project; người đã rời không còn trong danh sách tải hiện tại. Project CLOSED chỉ xem. Chỉ PM có quyền mở điều phối; Owner cần được phân công PM. Risk còn chờ tích hợp.

## Capacity/Workload trong Sprint

Thiết lập Capacity với ngày bắt đầu/kết thúc khớp chính xác Sprint. Khi **Kiểm tra kế hoạch** hoặc **Bắt đầu Sprint**, PM đọc phần **Capacity/Workload Sprint**: tải Sprint gồm Task hiện có + Task đang chọn; tổng Project còn tính công việc khác trong kỳ, mỗi Task một lần. Task cam kết vào Sprint vẫn được tính tải dù ngày nằm ngoài kỳ. Thiếu Effort hoặc Capacity được báo rõ; cảnh báo quá tải không tự thay quyết định của PM.

Nếu xác nhận báo dữ liệu đã thay đổi, chọn kiểm tra kế hoạch/bắt đầu lại và đọc cảnh báo mới. Capacity, dependency hoặc công việc khác trong Project thay đổi cũng có thể làm preview cũ hết hiệu lực. Trong **Theo dõi Sprint**, PM thấy tải toàn Sprint dù đang lọc Task; dùng **Tải lại tiến độ Sprint** để lấy dữ liệu mới. Danh sách người phụ trách phân trang 20. Thành viên vẫn xem tiến độ/Board, phần tổng tải Project chỉ hiển thị cho PM.
