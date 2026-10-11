import type { ProjectRiskResult } from '../api';

const levels = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', UNKNOWN: 'Chưa đủ dữ liệu' };
export function ProjectRisk({ data }: { data: ProjectRiskResult }) {
  return <section className="sprint-workload" aria-label="Project Risk">
    <h4>Project Risk: {levels[data.level]}</h4>
    <p>Dữ liệu: {data.confidence === 'COMPLETE' ? 'Đầy đủ theo các tiêu chí đang kiểm tra' : 'Chưa đầy đủ; mức cảnh báo chỉ dựa trên phần đã biết'}.</p>
    <p>Ngày đánh giá {data.today} (Việt Nam) · Kỳ Workload {data.periodStart} → {data.periodEnd}.</p>
    <p>Toàn Project: {data.metrics.doneCount}/{data.metrics.totalTaskCount} Task DONE ({data.metrics.progressPercent}%) · BLOCKED {data.metrics.blockedCount} · Quá hạn {data.metrics.overdueCount}.</p>
    <p>{data.metrics.overloadedCount} người quá tải trong kỳ · {data.metrics.lateActiveSprintCount} Sprint ACTIVE hết hạn · {data.metrics.behindSprintCount} Sprint chậm theo thời gian.</p>
    {data.signals.length ? <ul className="dependency-list">{data.signals.map((signal) => <li key={signal.code}><strong>{signal.severity === 'DATA' ? 'Thiếu dữ liệu' : signal.severity === 'HIGH' ? 'Cao' : 'Trung bình'}</strong>: {signal.message}</li>)}</ul> : <p>Chưa phát hiện tín hiệu rủi ro theo các quy tắc hiện tại.</p>}
    <details><summary>Cách đánh giá Risk</summary><p>Cao khi có Task/Project/Sprint quá hạn hoặc Workload trên 100%; trung bình khi có BLOCKED hoặc tỷ lệ Task DONE của Sprint ACTIVE thấp hơn tỷ lệ ngày đã qua. Thiếu Effort/deadline/Capacity/phân công thì không kết luận thấp. Đây là tín hiệu theo quy tắc, không phải dự đoán chắc chắn ngày hoàn thành.</p><p>BLOCKED, quá hạn và tiến độ tính toàn Project, không phụ thuộc trang/bộ lọc Task. Quá tải tính theo kỳ Capacity đang chọn{data.includesSprintCommitments ? ', có tính cả Task cam kết vào Sprint ngoài khoảng ngày' : ''}. Task DONE không tạo cảnh báo. Dùng nút tải lại ở khu vực đang xem sau khi dữ liệu thay đổi.</p></details>
  </section>;
}
