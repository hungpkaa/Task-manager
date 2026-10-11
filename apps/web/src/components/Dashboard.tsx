import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, taskStatuses, type DashboardResult } from '../api';
import { Tasks, statusLabels } from './Tasks';
import { ProjectRisk } from './ProjectRisk';
import { PersonalDashboardView } from './PersonalDashboardView';

function currentPeriod() {
  const start = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7) + '-01'; const end = new Date(`${start}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { start, end: end.toISOString().slice(0, 10) };
}
export function Dashboard({ projectId, onExpired, onWorkspace }: { projectId?: string; onExpired: () => void; onWorkspace?: () => void }) {
  const [open, setOpen] = useState(!projectId); const [period, setPeriod] = useState(currentPeriod); const [draft, setDraft] = useState(period);
  const [revision, setRevision] = useState(0); const [data, setData] = useState<DashboardResult | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [taskId, setTaskId] = useState('');
  const title = projectId ? 'Dashboard Project' : 'Dashboard cá nhân';
  useEffect(() => {
    if (!open || taskId) return;
    let active = true; setLoading(true); setError(''); setData(null);
    (projectId ? projectApi.dashboard(projectId, period.start, period.end) : projectApi.personalDashboard()).then((result) => { if (active) setData(result); }).catch((value: unknown) => {
      if (!active) return; if (value instanceof ApiError && value.status === 401) onExpired(); else setError(value instanceof Error ? value.message : 'Không thể tải Dashboard.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, period.start, period.end, revision, open, taskId]);
  function back() { setTaskId(''); setRevision((value) => value + 1); }
  function apply(event: FormEvent) { event.preventDefault(); setPeriod(draft); setRevision((value) => value + 1); }
  if (taskId) return <section aria-label={title}><button className="refresh-button" onClick={back}>← Về {title}</button><Tasks key={taskId} initialId={taskId} onExpired={onExpired} onBack={back} /></section>;
  return <section className={`sprints-panel ${projectId ? '' : 'personal-dashboard'}`} aria-label={title} aria-busy={loading}>
    <div className="panel-heading"><h3>{title}</h3>{projectId && <button className="refresh-button" onClick={() => setOpen(!open)}>{open ? 'Thu gọn Dashboard' : 'Mở Dashboard Project'}</button>}</div>
    {open && <>
      {projectId && <p>Chỉ số tiến độ tính toàn Project; kỳ dưới đây áp dụng cho Workload và Risk.</p>}
      {projectId && <form className="workspace-form" onSubmit={apply}><fieldset disabled={loading}><div className="project-dates"><label>Từ ngày<input aria-label="Kỳ Dashboard bắt đầu" type="date" required value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label><label>Đến ngày<input aria-label="Kỳ Dashboard kết thúc" type="date" required min={draft.start} value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label></div><button className="primary-button">Xem Dashboard theo kỳ</button></fieldset></form>}
      <button className="refresh-button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Tải lại Dashboard</button>
      {error && <p className="form-error" role="alert">{error}</p>}{loading && <p role="status">Đang tải Dashboard…</p>}
      {data && !projectId ? <PersonalDashboardView data={data} onTask={setTaskId} onWorkspace={onWorkspace} /> : data && <>
        <p>Ngày đánh giá: {data.today} (Việt Nam). Số liệu hiện tại, tải lại sau khi thay đổi công việc.</p>
        {data.projectStatus === 'CLOSED' && <p>Project đã đóng; chỉ xem dữ liệu.</p>}
        <div className="dashboard-metrics">
          <div><strong>{data.total}</strong><span>Tổng Task</span></div><div><strong>{data.progressPercent === null ? 'Chưa có dữ liệu' : `${data.progressPercent}%`}</strong><span>Tiến độ · {data.counts.DONE} Task DONE</span></div>
          <div><strong>{data.overdueCount}</strong><span>Task quá hạn</span></div><div><strong>{data.blockedCount}</strong><span>Task BLOCKED</span></div><div><strong>{data.dueSoonCount}</strong><span>Đến hạn hôm nay → 7 ngày tới</span></div>
        </div>
        {data.progressPercent !== null && <progress aria-label={`Tiến độ ${title}`} max={100} value={data.progressPercent} />}
        <p>Tiến độ = số Task DONE / tổng Task; không tính theo Effort. Chưa DONE: {data.activeCount} Task · {data.activeKnownEffort} Effort đã biết.</p>
        <ul className="dashboard-statuses">{taskStatuses.map((status) => <li key={status}>{statusLabels[status]}: {data.counts[status]}</li>)}</ul>
        <p>{data.missingEffortCount} Task chưa DONE thiếu Effort · {data.missingDeadlineCount} thiếu hạn · {data.unassignedCount} chưa phân công. BLOCKED và quá hạn có thể cùng một Task.</p>
        {data.sprintCounts && <><p>{data.memberCount} thành viên Project · Sprint: {data.sprintCounts.PLANNED} dự kiến, {data.sprintCounts.ACTIVE} đang chạy, {data.sprintCounts.COMPLETED} hoàn thành.</p>{data.activeSprint ? <p>Sprint đang chạy: <strong>{data.activeSprint.name}</strong> · {data.activeSprint.startDate.slice(0, 10)} → {data.activeSprint.endDate.slice(0, 10)} · {data.activeSprint.goal}</p> : <p>Chưa có Sprint đang chạy.</p>}</>}
        {data.workload && <div className="sprint-workload"><h4>Workload trong kỳ {period.start} → {period.end}</h4><p>{data.workload.taskCount} Task chưa DONE giao kỳ · {data.workload.knownEffort} Effort đã biết · {data.workload.overloadedCount} người quá tải.</p><p>{data.workload.missingEffortCount} Task thiếu Effort · {data.workload.missingCapacityCount} người thiếu Capacity · {data.workload.unassignedCount} Task chưa phân công · {data.workload.unavailableAssigneeCount} người phụ trách không khả dụng.</p><p>Mở Capacity & Workload để xem tải từng người hoặc thiết lập Capacity khớp kỳ.</p></div>}
        {data.risk && <ProjectRisk data={data.risk} />}
        <h4>Task cần chú ý</h4><p>Tối đa 10 Task chưa DONE bị chặn hoặc đến hạn trong 7 ngày tới, gồm quá hạn; ưu tiên hạn sớm, không thay thế danh sách Task đầy đủ.</p>
        <div className="task-list">{data.attention.map((task) => <button className="task-card" key={task.id} onClick={() => setTaskId(task.id)}><strong>{task.title}</strong><span>{task.project.name} · {statusLabels[task.status]} · Hạn: {task.dueDate?.slice(0, 10) ?? 'Chưa đặt'}</span>{task.dependencies.length > 0 && <small>BLOCKED</small>}{task.dueDate && task.dueDate.slice(0, 10) < data.today && <small>Quá hạn</small>}</button>)}</div>
        {!data.attention.length && <p>Không có Task cần chú ý theo các tiêu chí này.</p>}
      </>}
    </>}
  </section>;
}
