import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, taskStatuses, type DashboardResult } from '../api';
import { Tasks, statusLabels } from './Tasks';
import { ProjectRisk } from './ProjectRisk';
import { PersonalDashboardView } from './PersonalDashboardView';
import { DatePicker } from './DatePicker';
import { Icon } from './Icon';
import type { TaskFilter } from './PersonalDashboardView';

function currentPeriod() {
  const start = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7) + '-01'; const end = new Date(`${start}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { start, end: end.toISOString().slice(0, 10) };
}
export function Dashboard({ projectId, onExpired, onWorkspace, onTasksFilter }: { projectId?: string; onExpired: () => void; onWorkspace?: () => void; onTasksFilter?: (filter: TaskFilter) => void }) {
  const open = true; const [period, setPeriod] = useState(currentPeriod); const [draft, setDraft] = useState(period);
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
    <div className="panel-heading"><div><span className="eyebrow">{projectId ? 'BÁO CÁO DỰ ÁN' : 'TỔNG QUAN CÔNG VIỆC'}</span><h3>{title}</h3></div><button type="button" className={`dashboard-refresh${loading ? ' is-loading' : ''}`} aria-label={loading ? 'Đang tải Dashboard' : 'Tải lại Dashboard'} title={loading ? 'Đang tải…' : 'Tải lại Dashboard'} disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" /></button></div>
    {open && <>
      {projectId && <p>Chỉ số tiến độ tính toàn Project; kỳ dưới đây áp dụng cho Workload và Risk.</p>}
      {projectId && <form className="workspace-form dashboard-period-form" onSubmit={apply}><fieldset disabled={loading}><div className="project-dates dashboard-period-fields"><DatePicker id="dashboard-start" label="Từ ngày" value={draft.start} disabled={loading} onChange={(start) => setDraft({ ...draft, start })} /><DatePicker id="dashboard-end" label="Đến ngày" value={draft.end} min={draft.start} disabled={loading} onChange={(end) => setDraft({ ...draft, end })} /></div><button className="primary-button">Xem Dashboard theo kỳ</button></fieldset></form>}
      {error && <div className="dashboard-error" role="alert"><span>{error}</span><button className="refresh-button" onClick={() => setRevision((value) => value + 1)}>Thử lại</button></div>}
      {loading && !data && <DashboardSkeleton />}
      {data && !projectId ? <PersonalDashboardView data={data} onTask={setTaskId} onWorkspace={onWorkspace} onTasksFilter={onTasksFilter} /> : data && <>
        <div className="dashboard-project-context"><span>Ngày đánh giá <strong>{data.today}</strong> · Giờ Việt Nam</span>{data.projectStatus === 'CLOSED' && <span className="project-status-chip is-closed"><i />Project đã đóng · Chỉ xem</span>}</div>
        <div className="dashboard-metrics">
          <div><strong>{data.total}</strong><span>Tổng Task</span></div><div><strong>{data.progressPercent === null ? 'Chưa có dữ liệu' : `${data.progressPercent}%`}</strong><span>Tiến độ · {data.counts.DONE} Task DONE</span></div>
          <div><strong>{data.overdueCount}</strong><span>Task quá hạn</span></div><div><strong>{data.blockedCount}</strong><span>Task BLOCKED</span></div><div><strong>{data.dueSoonCount}</strong><span>Đến hạn hôm nay → 7 ngày tới</span></div>
        </div>
        {data.progressPercent !== null && <progress aria-label={`Tiến độ ${title}`} max={100} value={data.progressPercent} />}
        <div className="dashboard-progress-context"><span>Tiến độ tính theo Task hoàn thành</span><span>{data.activeCount} Task đang mở · {data.activeKnownEffort} Effort đã biết</span></div>
        <ul className="dashboard-statuses">{taskStatuses.map((status) => <li key={status}>{statusLabels[status]}: {data.counts[status]}</li>)}</ul>
        <details className="dashboard-details dashboard-data-quality"><summary>Chất lượng dữ liệu</summary><p>{data.missingEffortCount} Task thiếu Effort · {data.missingDeadlineCount} Task thiếu hạn · {data.unassignedCount} Task chưa phân công. BLOCKED và quá hạn có thể cùng một Task.</p></details>
        {data.sprintCounts && <div className="dashboard-sprint-summary"><div className="dashboard-sprint-counts"><span><strong>{data.memberCount}</strong> thành viên</span><span><strong>{data.sprintCounts.PLANNED}</strong> Sprint dự kiến</span><span><strong>{data.sprintCounts.ACTIVE}</strong> đang chạy</span><span><strong>{data.sprintCounts.COMPLETED}</strong> hoàn thành</span></div>{data.activeSprint ? <p><strong>{data.activeSprint.name}</strong><span>{data.activeSprint.startDate.slice(0, 10)} → {data.activeSprint.endDate.slice(0, 10)}</span><small>{data.activeSprint.goal}</small></p> : <p className="dashboard-no-sprint">Chưa có Sprint đang chạy.</p>}</div>}
        {data.workload && <section className="sprint-workload dashboard-workload-summary"><div className="dashboard-section-title"><h4>Workload trong kỳ</h4><span>{period.start} → {period.end}</span></div><div className="dashboard-mini-metrics"><div><strong>{data.workload.taskCount}</strong><span>Task trong kỳ</span></div><div><strong>{data.workload.knownEffort}</strong><span>Effort đã biết</span></div><div><strong>{data.workload.overloadedCount}</strong><span>Quá tải</span></div></div><details><summary>Chất lượng Capacity & Workload</summary><p>{data.workload.missingEffortCount} Task thiếu Effort · {data.workload.missingCapacityCount} người thiếu Capacity · {data.workload.unassignedCount} Task chưa phân công · {data.workload.unavailableAssigneeCount} người phụ trách không khả dụng.</p><p>Mở Capacity & Workload để xem tải từng người hoặc thiết lập Capacity khớp kỳ.</p></details></section>}
        {data.risk && <ProjectRisk data={data.risk} />}
        <div className="dashboard-section-title dashboard-attention-heading"><h4>Task cần chú ý</h4><details><summary>Tiêu chí</summary><p>Tối đa 10 Task chưa DONE bị chặn hoặc đến hạn trong 7 ngày tới, gồm quá hạn; ưu tiên hạn sớm.</p></details></div>
        <div className="task-list">{data.attention.map((task) => <button className="task-card" key={task.id} onClick={() => setTaskId(task.id)}><strong>{task.title}</strong><span>{task.project.name} · {statusLabels[task.status]} · Hạn: {task.dueDate?.slice(0, 10) ?? 'Chưa đặt'}</span>{task.dependencies.length > 0 && <small>BLOCKED</small>}{task.dueDate && task.dueDate.slice(0, 10) < data.today && <small>Quá hạn</small>}</button>)}</div>
        {!data.attention.length && <p>Không có Task cần chú ý theo các tiêu chí này.</p>}
      </>}
    </>}
  </section>;
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton" aria-label="Đang tải Dashboard" role="status">
    <div className="skeleton-stats">{Array.from({ length: 4 }, (_, index) => <div className="skeleton-block skeleton-stat" key={index} />)}</div>
    <div className="skeleton-panels"><div className="skeleton-block skeleton-attention" /><div className="skeleton-block skeleton-distribution" /></div>
  </div>;
}
