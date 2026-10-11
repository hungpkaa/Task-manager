import { useState } from 'react';
import type { SprintWorkloadResult } from '../api';

export function SprintWorkload({ data }: { data: SprintWorkloadResult }) {
  const [requestedPage, setPage] = useState(1);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(data.rows.length / 20)));
  const percent = (value: number | null) => value === null ? 'Chưa tính được' : `${value}%`;
  return <section aria-label="Capacity/Workload Sprint" className="sprint-workload">
    <h4>Capacity/Workload Sprint</h4>
    <p>Kỳ {data.periodStart} → {data.periodEnd}. Capacity phải khớp đúng kỳ Sprint.</p>
    <p>{data.summary.taskCount} Task chưa DONE trong Sprint · {data.summary.knownEffort} Effort đã biết · {data.summary.missingEffortCount} thiếu Effort · {data.summary.unassignedCount} chưa phân công.</p>
    <p>{data.summary.missingCapacityCount} người thiếu Capacity · {data.summary.sprintOverloadedCount} quá tải Sprint · {data.summary.projectOverloadedCount} quá tải Project.</p>
    <p>Tải Sprint gồm Backlog hiện có và Task đang chọn khi lập kế hoạch. Tổng Project gồm Task chưa DONE giao với kỳ và mọi Task cam kết trong Sprint; mỗi Task chỉ tính một lần. Task thiếu ngày không giới hạn đầu/cuối khoảng. Thiếu Effort có thể làm tỷ lệ thấp hơn thực tế.</p>
    <ul className="member-list workload-list">{data.rows.slice((page - 1) * 20, page * 20).map((row) => <li key={row.user.id}><div><strong>{row.user.displayName}</strong><p>Capacity: {row.capacityPoints ?? 'Chưa thiết lập'} · {row.sprintTaskCount} Task Sprint</p><p>Tải Sprint: {row.sprintEffort} Effort · {percent(row.sprintPercent)}{row.sprintOverloaded ? ' · Quá tải' : ''}</p><p>Tổng tải Project: {row.projectEffort} Effort · {percent(row.projectPercent)}{row.projectOverloaded ? ' · Quá tải' : ''}</p>{(row.sprintMissingEffort > 0 || row.projectMissingEffort > 0) && <p>Thiếu Effort: Sprint {row.sprintMissingEffort} · Project {row.projectMissingEffort}</p>}{(!row.currentMember || row.user.status !== 'ACTIVE') && <p className="form-notice">Người phụ trách đã rời Project hoặc tài khoản khóa.</p>}</div></li>)}</ul>
    {!data.rows.length && <p>Chưa có người được phân công Task chưa DONE trong Sprint.</p>}
    <p>{data.rows.length} người phụ trách · Trang {page}/{Math.max(1, Math.ceil(data.rows.length / 20))}. Tổng quan tính toàn Sprint.</p><div className="inline-fields"><button className="refresh-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Tải Sprint trước</button><button className="refresh-button" disabled={page * 20 >= data.rows.length} onClick={() => setPage(page + 1)}>Tải Sprint sau</button></div>
  </section>;
}
