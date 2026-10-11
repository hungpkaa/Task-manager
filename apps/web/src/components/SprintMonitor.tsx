import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, sprintApi, taskStatuses, taskPriorities, type SprintMonitorResult, type TaskStatus } from '../api';
import { DailyUpdates } from './DailyUpdates';
import { SprintReview } from './SprintReview';
import { SprintRetrospective } from './SprintRetrospective';
import { Tasks, statusLabels } from './Tasks';
export function SprintMonitor({ projectId, sprintId, onExpired }: { projectId: string; sprintId: string; onExpired: () => void }) {
  const [data, setData] = useState<SprintMonitorResult | null>(null);
  const [query, setQuery] = useState({ status: '', priority: '', assigneeId: '' });
  const [filters, setFilters] = useState(query);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'board'>('board');
  const [taskId, setTaskId] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setData(null);
    const params = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    sprintApi.monitor(projectId, sprintId, params).then((result) => { if (active) setData(result); }).catch((failure: unknown) => { if (active) { if (failure instanceof ApiError && failure.status === 401) onExpired(); else setError(failure instanceof Error ? failure.message : 'Không thể tải tiến độ Sprint.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, sprintId, page, filters, revision]);
  function apply(event: FormEvent) { event.preventDefault(); setPage(1); setFilters({ ...query }); }
  function back() { setTaskId(''); setRevision((value) => value + 1); }
  if (taskId) return <div><button className="refresh-button" onClick={back}>← Về theo dõi Sprint</button><Tasks key={taskId} initialId={taskId} onExpired={onExpired} onBack={back} /></div>;
  function card(task: SprintMonitorResult['items'][number]) {
    return <button className="task-card" key={task.id} onClick={() => setTaskId(task.id)}><strong>{task.title}</strong><span>{statusLabels[task.status as TaskStatus]} · {task.priority} · {task.assignee?.displayName ?? 'Chưa phân công'}</span><span>Effort: {task.effort ?? 'Chưa ước lượng'} · Hạn: {task.dueDate?.slice(0, 10) ?? 'Chưa đặt'}</span>{task.blocked && <small>BLOCKED · {task.blockingTasks.map((item) => item.title).join(', ')}</small>}{task.overdue && <small>Quá hạn</small>}</button>;
  }
  return <section className="sprint-monitor" aria-label="Theo dõi Sprint" aria-busy={loading}>
    <div className="panel-heading"><h3>Theo dõi Sprint</h3><button className="refresh-button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Tải lại tiến độ Sprint</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{loading && <p role="status">Đang tải tiến độ Sprint…</p>}
    {data && <><h4>{data.sprint.name} · {data.sprint.status}</h4><p>Goal: {data.sprint.goal}</p><p>{data.sprint.startDate.slice(0, 10)} → {data.sprint.endDate.slice(0, 10)} · Còn {data.summary.daysRemaining} ngày đến ngày kết thúc{data.summary.sprintOverdue ? ' · Sprint đã quá hạn' : ''}</p>
      <div className="sprint-summary"><p><strong>Tiến độ: {data.summary.progressPercent}%</strong> · {data.summary.counts.DONE}/{data.summary.total} Task DONE</p><progress aria-label="Tiến độ Sprint" max={100} value={data.summary.progressPercent} /><p>{taskStatuses.map((status) => `${statusLabels[status]}: ${data.summary.counts[status]}`).join(' · ')}</p><p>BLOCKED: {data.summary.blocked} · Quá hạn: {data.summary.overdue}</p><p>Số liệu toàn Sprint; danh sách bên dưới được lọc và phân trang. Ngày tính: {data.summary.today} (Việt Nam).</p></div>
      {data.warnings.map((warning) => <p className="form-notice" key={warning}>{warning}</p>)}
      {data.sprint.completion && <details><summary>Kết quả khi kết thúc Sprint</summary><p>DONE {data.sprint.completion.doneCount} · Chuyển tiếp {data.sprint.completion.incompleteCount}</p><p>Kết thúc: {data.sprint.completedAt ? new Date(data.sprint.completedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''} (Việt Nam)</p><ul>{data.sprint.completion.tasks.map((task) => <li key={task.id}>{task.title} · {task.status} · {task.status === 'DONE' ? 'Giữ trong Sprint' : task.destinationSprintId ? `Chuyển Sprint ${task.destinationSprintId}` : 'Về Product Backlog'}</li>)}</ul><p>Đây là lịch sử tại thời điểm kết thúc; số liệu hiện tại có thể khác.</p></details>}
      <DailyUpdates key={sprintId} projectId={projectId} sprintId={sprintId} onExpired={onExpired} />
      <SprintReview key={`review-${sprintId}`} projectId={projectId} sprintId={sprintId} onExpired={onExpired} />
      <SprintRetrospective key={`retro-${sprintId}`} projectId={projectId} sprintId={sprintId} onExpired={onExpired} />
      <form className="task-filters" onSubmit={apply}><label>Trạng thái Sprint Task<select aria-label="Trạng thái Sprint Task" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}><option value="">Tất cả</option>{taskStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label>Ưu tiên Sprint Task<select aria-label="Ưu tiên Sprint Task" value={query.priority} onChange={(event) => setQuery({ ...query, priority: event.target.value })}><option value="">Tất cả</option>{taskPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label>Người phụ trách Sprint Task<select aria-label="Người phụ trách Sprint Task" value={query.assigneeId} onChange={(event) => setQuery({ ...query, assigneeId: event.target.value })}><option value="">Tất cả</option><option value="unassigned">Chưa phân công</option>{data.assignees.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label><button className="primary-button">Lọc Sprint Task</button></form>
      <div className="inline-fields"><button className="refresh-button" aria-pressed={view === 'board'} onClick={() => setView('board')}>Board Sprint</button><button className="refresh-button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách Sprint Task</button></div><p>{data.total} Task phù hợp · Trang {page} / {Math.max(1, Math.ceil(data.total / 20))}. Board hiển thị Task của trang hiện tại.</p>
      {view === 'board' ? <div className="kanban-board">{taskStatuses.map((status) => <div className="kanban-column" key={status}><h4>{statusLabels[status]}</h4>{data.items.filter((task) => task.status === status).map(card)}</div>)}</div> : <div className="task-list">{data.items.map(card)}</div>}
      {!data.items.length && <p>Không có Task phù hợp.</p>}<div className="inline-fields"><button className="refresh-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang Sprint Task trước</button><button className="refresh-button" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Trang Sprint Task sau</button></div>
    </>}
  </section>;
}
