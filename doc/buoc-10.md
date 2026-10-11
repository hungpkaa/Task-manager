# Bước 10 — Điều phối, báo cáo và quản trị

## Tiến độ UC36 — Task Dependency

Đã có API và giao diện quản lý dependency trong chi tiết Task. PM hiện tại của Project ACTIVE được thêm/xóa; người có quyền xem Task được đọc danh sách phân trang 20. Owner không tự có quyền quản lý Task.

- `GET /tasks/:id/dependencies?page=1`: đọc danh sách và quyền chỉnh sửa.
- `POST /tasks/:id/dependencies`: JSON `{ dependsOnTaskId }`, thêm liên kết.
- `DELETE /tasks/:id/dependencies/:dependsOnTaskId`: JSON `{}`, xóa liên kết.

Hai Task phải cùng Project; từ chối tự phụ thuộc, liên kết trùng và chu trình trực tiếp/nhiều tầng. Kiểm tra đường đi dùng truy vấn recursive; thao tác ghi dùng cùng khóa Workspace với các thao tác Task để hai yêu cầu đồng thời không tạo chu trình. Thêm/xóa cập nhật phiên bản Task để vô hiệu hóa preview Sprint cũ. Dùng bảng dependency hiện có, không cần migration mới.

BLOCKED được đánh giá từ dependency chưa DONE, không tự thay đổi trạng thái Task. Giao diện tải lại chi tiết sau khi thêm/xóa; xóa có xác nhận/hủy. Project CLOSED giữ lịch sử để xem và chặn ghi. Risk được tính động từ dependency hiện tại; PM tải lại điều phối/Sprint để xem đánh giá mới.

## UC35–37 — Capacity và Workload

PM mở điều phối trong Project để chọn kỳ và thiết lập/cập nhật Capacity cho thành viên hiện tại có tài khoản ACTIVE. Effort đã được quản lý trong chi tiết Task theo thang 1/2/3/5/8. Capacity là số nguyên dương, tối đa 1.000.000 điểm; hai ngày bắt buộc, ngày kết thúc không trước ngày bắt đầu.

- `GET /projects/:id/workload?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD&page=1`: báo cáo theo kỳ, phân trang 20 thành viên; tổng quan tính toàn Project.
- `GET /projects/:id/capacities?page=1`: lịch sử phân trang 20.
- `PUT /projects/:id/capacities`: JSON `userId`, `periodStart`, `periodEnd`, `capacityPoints`, `expectedUpdatedAt` (null khi tạo; timestamp đã đọc khi sửa).

Chỉ PM hiện tại đọc/ghi điều phối; Owner/Member/System Admin không tự có quyền này. Ghi dùng khóa Workspace cùng các thao tác quản lý Task/thành viên/PM; từ chối cập nhật bản cũ và kỳ chồng nhau của cùng thành viên. Project CLOSED chỉ đọc. Capacity gắn Project/User để giữ lịch sử khi membership bị xóa, và chỉ thiết lập cho thành viên hiện tại.

Lựa chọn triển khai do đặc tả chưa định nghĩa chi tiết kỳ: tính Task TODO/IN_PROGRESS/REVIEW có khoảng ngày giao với kỳ (biên inclusive), ngày thiếu được xem là không giới hạn đầu/cuối. Task thiếu cả hai ngày được tính ở mọi kỳ. Không chia Effort theo ngày; Capacity phải khớp chính xác kỳ truy vấn, không cộng hoặc chia tỷ lệ các kỳ khác. Tỷ lệ = Effort đã biết / Capacity × 100, làm tròn hai chữ số thập phân; trên 100% là quá tải. Thiếu Capacity trả tỷ lệ null; thiếu Effort báo dữ liệu chưa đầy đủ. Task chưa phân công được báo riêng. Báo cáo đọc dữ liệu hiện tại, không phải snapshot lịch sử của Task.

Migration thứ 15 `20261011160000_member_capacities` thêm bảng, FK Project/User, unique thành viên/kỳ và CHECK Capacity dương/ngày hợp lệ. API kiểm tra kỳ chồng nhau dưới khóa chung.

## Tích hợp Capacity/Workload vào UC46–48

Preview lập kế hoạch và bắt đầu Sprint hiển thị tải từng người phụ trách, Capacity khớp đúng ngày Sprint, tải Sprint và tổng tải Project. Tải Sprint gồm Task chưa DONE đã thuộc Sprint và Task đang chọn; tổng tải Project gồm Task chưa DONE giao với kỳ cùng mọi Task cam kết vào Sprint dù ngày nằm ngoài kỳ. Backlog đã nằm trong tổng Project nên không cộng thêm lần nữa. Task DONE không tính tải. Không chia điểm theo ngày và không sử dụng Capacity của kỳ gần nhất/tháng bao trùm. Thiếu Capacity/Effort/assignee hoặc tài khoản khóa được cảnh báo riêng; PM vẫn quyết định xác nhận.

`POST .../plan` và `POST .../start` trả `snapshot` và `workload`. Khi xác nhận `confirmed: true`, client phải gửi `expectedSnapshot` đã nhận; thiếu hoặc không khớp trả 409, không ghi. Hash gồm Sprint, Task liên quan (cả công việc khác trong Project cùng kỳ), dependency/trạng thái đích, Capacity và membership. Backend tính lại dưới khóa Workspace trước khi ghi, nên thay đổi từ người khác sau preview buộc PM kiểm tra lại cảnh báo. API start vẫn nhận `expectedUpdatedAt`, API plan vẫn nhận phiên bản từng Task.

Theo dõi Sprint tính tải toàn Sprint, độc lập bộ lọc/trang Task. PM thấy bảng tải và cảnh báo cập nhật khi tải lại hoặc trở về từ Task; thành viên vẫn xem tiến độ/Board nhưng `workload: null`, không nhận tổng tải Project. Danh sách người phụ trách trên UI phân trang 20, tổng quan tính toàn bộ; API đánh giá mọi người tham gia để không bỏ sót người ở trang sau. Số liệu COMPLETED là tải hiện tại, lịch sử kết thúc vẫn là snapshot riêng. Không thêm migration trong đợt tích hợp này.

## UC38 — Project Risk

`GET /projects/:id/risk?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` dành cho PM hiện tại, kể cả khi Project CLOSED. Không có tác động ghi. Kỳ bắt buộc, dữ liệu/ngày không hợp lệ hoặc query ngoài phạm vi bị từ chối. Risk cũng nằm trong response Workload, kế hoạch/bắt đầu và theo dõi Sprint của PM; thành viên nhận `risk: null`. Đọc trong transaction RepeatableRead để các số liệu cùng một snapshot DB.

Ngưỡng dưới đây là lựa chọn triển khai vì đặc tả chỉ yêu cầu đánh giá theo quy tắc, không quy định ngưỡng số:

| Mức | Điều kiện |
| --- | --- |
| HIGH / Cao | Có Task chưa DONE quá hạn, người phụ trách quá tải trên 100%, Sprint ACTIVE hết hạn còn Task chưa DONE, hoặc Project qua ngày kết thúc còn Task chưa DONE |
| MEDIUM / Trung bình | Không có tín hiệu HIGH, có Task BLOCKED hoặc Sprint ACTIVE có tỷ lệ Task DONE thấp hơn tỷ lệ ngày đã qua |
| UNKNOWN / Chưa đủ dữ liệu | Không có tín hiệu HIGH/MEDIUM và thiếu Effort/deadline/Capacity/phân công, người phụ trách không khả dụng, hoặc Project chưa có Task |
| LOW / Thấp | Không có tín hiệu HIGH/MEDIUM và không thiếu dữ liệu theo tiêu chí đang kiểm tra |

Độ đầy đủ tách riêng khỏi mức Risk: HIGH/MEDIUM vẫn có thể `INCOMPLETE`. Không lấy dữ liệu thiếu làm 0 để kết luận thấp. Task DONE không tạo blocked/overdue/thiếu dữ liệu/tải; Project/Sprint toàn DONE không bị cảnh báo trễ. Rule tiến độ so sánh tỷ lệ chính xác trước làm tròn: `DONE / tổng Task` với số ngày đã đi vào Sprint (tính cả ngày hiện tại, giới hạn 0..tổng ngày) / tổng ngày inclusive. Đây là tín hiệu kiểm tra kế hoạch, không dự đoán velocity hay ngày hoàn thành.

Blocked, overdue, thiếu Effort/deadline/phân công và tiến độ tính toàn Project, độc lập bộ lọc/trang thành viên. Quá tải và Capacity tính các Task giao với kỳ theo quy tắc Workload; trong preview/Sprint còn tính Task cam kết ngoài ngày kỳ, không cộng trùng. Người ngoài Project/tài khoản khóa trong nhóm assignee của kỳ được báo riêng. Ngày đánh giá theo Việt Nam, deadline đúng hôm nay chưa tính quá hạn. LOW chỉ là không phát hiện tín hiệu theo các quy tắc/kỳ hiện tại.

UI hiển thị lý do, số lượng, ngày/kỳ và mục **Cách đánh giá Risk**. Lưu Capacity tải lại Risk; thay Task/dependency thì dùng tải lại điều phối/Sprint. Không realtime hoặc cache lịch sử Risk, không tự đổi assignee/trạng thái. Preview snapshot Sprint bao gồm kết quả Risk và ngày đánh giá; thay đổi làm cảnh báo khác (kể cả đổi ngày kết thúc Project hoặc qua ngày mới) buộc kiểm tra lại trước khi xác nhận. Không thêm migration.

## UC39 — Đề xuất điều phối

PM mở **Đề xuất điều phối** trong Capacity & Workload. `GET /projects/:id/recommendations?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD&page=1` đọc trong RepeatableRead, chỉ cho PM hiện tại; Project CLOSED vẫn được xem. Danh sách phân trang 20 Task chưa DONE, gồm thiếu Effort/deadline/phân công, overdue, blocked, assignee không khả dụng và quá tải trong kỳ. Lời khuyên tổng quan lấy từ Risk toàn Project. Không thêm migration, không tự sửa Task, phân công hay gửi notification.

Task TODO giao với kỳ, có Effort, không có dependency chưa DONE và cần phân công/cân bằng tải được gợi ý tối đa 3 người. Người nhận phải là thành viên hiện tại ACTIVE, có Capacity khớp đúng kỳ, mọi Task chưa DONE giao kỳ đã có Effort và tổng Effort sau khi nhận không vượt Capacity. Sắp theo tỷ lệ tải dự kiến tăng dần. Task IN_PROGRESS/REVIEW chỉ có lời khuyên xem phạm vi/hỗ trợ và cân nhắc bàn giao. Thiếu dữ liệu thì không tạo gợi ý định lượng.

Đây là quy tắc theo tải, chưa xét kỹ năng hay dự đoán thời gian. Mỗi Task tính riêng; không cộng nhiều đề xuất thành một kế hoạch đồng thời. PM mở Task để xem/sửa bằng quyền hiện có, trở về thì đề xuất tải lại. Nếu chỉnh Task ở nơi khác, dùng **Tải lại đề xuất** hoặc **Tải lại Workload**. Đề xuất chỉ xuất hiện trong điều phối Project, chưa có bảng riêng trong Sprint.

## Kiểm chứng

Kiểm thử API bao gồm phân quyền, Task khác Project, dữ liệu sai, chu trình nhiều tầng, hai liên kết ngược chiều đồng thời, phân trang, BLOCKED và Project CLOSED. Luồng trình duyệt Sprint kiểm tra thêm/xóa/hủy xóa và BLOCKED trên desktop/mobile, kèm kiểm tra không tràn ngang.

Build và typecheck web/API thành công. `npm.cmd run test:db`: 50/50 kiểm thử tích hợp PostgreSQL thành công. UC38 kiểm tra phân quyền/query/Project CLOSED, dependency thêm/xóa, cập nhật Capacity, thiếu dữ liệu, bỏ qua DONE/Project khác, ranh giới ngày Việt Nam, tiến độ chính xác, hạn Sprint/Project và dữ liệu ngoài trang thành viên đầu. Snapshot Sprint kiểm tra thêm trường hợp đổi hạn Project làm Risk thay đổi; Member không nhận Risk. 15 migration đã chạy thành công trên DB mới ở đợt trước; đợt Risk không thay schema, không chạy lại migration mới.

`npm.cmd run test:e2e -- --grep Sprint`: 2/2 luồng desktop/mobile thành công, gồm Risk Cao khi quá tải, lý do/thiếu dữ liệu, mở cách đánh giá, Risk trong preview/bắt đầu, snapshot cũ và ẩn Risk với Member. Ảnh `project-risk.png`, `task-dependencies.png`, `capacity-workload.png` và `sprint-workload.png` nằm trong `.local/e2e-results`; báo cáo tại `.local/e2e-report`. Đợt này chạy hai luồng Sprint, không chạy lại toàn bộ bộ trình duyệt.

## UC30 — Calendar

Calendar nằm trong Project, dành cho các tài khoản có quyền xem Project (Workspace Owner hoặc thành viên Project, gồm PM). `GET /projects/:id/calendar?month=YYYY-MM&page=1&sprintPage=1` nhận thêm `day=YYYY-MM-DD` thuộc tháng để xem riêng ngày. Query nghiêm ngặt, ngày/tháng không hợp lệ bị từ chối. API đọc trong RepeatableRead, không ghi và không cần migration.

Lịch hiển thị các Task/Sprint có khoảng ngày giao với tháng/ngày, hai biên inclusive. Task thiếu một ngày được xem là không giới hạn đầu/cuối; thiếu cả hai ngày không đưa vào lịch và được đếm riêng toàn Project. Đây là lựa chọn triển khai cho dữ liệu ngày chưa đầy đủ. Lịch giữ Task DONE/Sprint COMPLETED và cho xem Project CLOSED. Task và Sprint phân trang độc lập 20, tổng đếm toàn kỳ. Ngày hiển thị giữ nguyên ngày nghiệp vụ; hôm nay/quá hạn theo Việt Nam.

UI có bộ chọn tháng, lưới ngày bắt đầu từ thứ Hai, chọn ngày hoặc cả tháng, tải lại, danh sách Task và Sprint. Mở Task dùng màn hình chi tiết hiện có, trở về tải lại lịch. Calendar chỉ xem, không kéo/thả thay ngày; chỉnh Task trong chi tiết theo quyền sẵn có. Sprint hiển thị tên/Goal/trạng thái/ngày; thao tác quản lý nằm trong Sprint & Backlog.

Đợt UC39: build/typecheck thành công; 51/51 kiểm thử tích hợp và 2/2 luồng Sprint desktop/mobile qua. Test bổ sung kiểm tra quyền PM/query, người nhận đủ Capacity, thiếu Effort, quá tải, tài khoản khóa/rời Project, dependency, Task đã bắt đầu, phân trang, Project CLOSED và không thay Task/notification khi đọc. Luồng trình duyệt kiểm tra lý do, trường hợp không có người phù hợp, mở Task/trở về và giữ nguyên phân công. Đã xem ảnh `recommendations.png` trên mobile; không tràn ngang trong luồng kiểm thử. Không chạy lại toàn bộ bộ trình duyệt.

Đợt Calendar: build/typecheck thành công, 52/52 kiểm thử tích hợp và 2/2 luồng desktop/mobile qua. API kiểm tra scope, query, giao kỳ inclusive, Task/Sprint lịch sử, dữ liệu thiếu ngày, phân trang và thu hồi quyền. Trình duyệt kiểm tra chọn tháng/ngày, ngày không có Task, mở Task/trở về và không tràn ngang. Ảnh `calendar.png` nằm trong `.local/e2e-results`, đã xem bản mobile. Không chạy lại toàn bộ bộ trình duyệt.

## UC33–34 — Dashboard cá nhân và Project

`GET /dashboard/mine` tổng hợp Task được giao cho người đăng nhập, trong Project còn membership như My Tasks. Không nhận userId hoặc query khác; không tiết lộ Task thuộc Project đã rời, kể cả assignee lịch sử DONE. Dashboard cá nhân nằm ở **Tổng quan** và không có Workload/Risk Project.

`GET /projects/:id/dashboard?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` chỉ cho PM hiện tại. Owner/Member/System Admin không tự có quyền. Project CLOSED vẫn xem được. Response có tổng Task, các trạng thái, tiến độ, overdue/BLOCKED, hạn từ hôm nay đến 7 ngày tới inclusive, thiếu Effort/deadline/phân công, Effort chưa DONE đã biết, số thành viên/Sprint và Sprint ACTIVE. Workload/Risk dùng đúng kỳ đã chọn với các quy tắc UC35–38. Chỉ số tiến độ tính toàn Project và độc lập kỳ Workload.

Tiến độ = số Task DONE / tổng Task × 100, làm tròn hai chữ số; Project/cá nhân chưa có Task trả null, không kết luận hoàn thành. Đây là tiến độ theo số Task, không theo Effort hay dự báo thời gian. Task DONE không tính overdue/BLOCKED/tải/thiếu dữ liệu. Ngày đánh giá theo Việt Nam, deadline đúng hôm nay chưa quá hạn. Các nhóm cảnh báo có thể giao nhau.

Danh sách cần chú ý giới hạn 10 Task chưa DONE có dependency chưa DONE hoặc hạn không sau 7 ngày tới, gồm quá hạn; sắp theo hạn sớm rồi ID, ngày thiếu ở cuối. Tổng quan tính mọi Task trong scope, không bị giới hạn theo danh sách. Mở Task dùng màn hình hiện có; trở về tải lại Dashboard. Thay trạng thái/dependency ở nơi khác thì dùng **Tải lại Dashboard** hoặc mở lại trang. API đọc trong RepeatableRead từ dữ liệu hiện tại, không lưu bộ đếm/snapshot báo cáo và không realtime; không cần migration.

## Phần còn lại

Đợt Dashboard: build/typecheck web/API thành công; 53/53 kiểm thử tích hợp PostgreSQL và toàn bộ 12/12 luồng trình duyệt desktop/mobile qua. API kiểm tra quyền PM/scope cá nhân, query, Project CLOSED, thu hồi membership, dữ liệu trống, trạng thái/tiến độ thay đổi, dependency DONE, hạn 7 ngày inclusive, Workload/Risk, Sprint ACTIVE và tổng số liệu ngoài danh sách 10 Task. Trình duyệt kiểm tra Dashboard cá nhân, Dashboard Project, chọn kỳ, mở Task/đổi trạng thái/trở về và không tràn ngang, cùng các luồng hồi quy đăng ký/phiên/mật khẩu/nhóm/công việc. Đã xem ảnh `personal-dashboard.png` và `project-dashboard.png` trên desktop/mobile trong `.local/e2e-results`; báo cáo tại `.local/e2e-report`.

UC40–43 System Admin. Bước 10 chưa hoàn thành toàn bộ.
