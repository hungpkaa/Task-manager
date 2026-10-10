import { useEffect, useState, type FormEvent } from 'react';
import { Comments } from './Comments';
import { ApiError, projectApi, taskApi, taskStatuses, taskPriorities, type Task, type TaskInput, type TaskPage, type TaskPriority, type TaskStatus, type ProjectMember } from '../api';

export const statusLabels: Record<TaskStatus, string> = { TODO: 'Cần làm', IN_PROGRESS: 'Đang làm', REVIEW: 'Chờ duyệt', DONE: 'Hoàn thành' };
const priorityLabels: Record<TaskPriority, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' };
const empty: TaskInput = { title: '', description: '', priority: 'MEDIUM', startDate: null, dueDate: null, effort: null };

export function Tasks({ projectId, canCreate = false, initialId, onExpired }: { projectId?: string; canCreate?: boolean; initialId?: string; onExpired: () => void }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const [creating, setCreating] = useState(false);
  const [pageData, setPageData] = useState<TaskPage>({ tasks: [], total: 0, page: 1, pageSize: 20 });
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [input, setInput] = useState<TaskInput>(empty);
  const [assigneeId, setAssigneeId] = useState('');
  const [query, setQuery] = useState({ q: '', status: '', priority: '', assigneeId: '', sort: 'updatedAt', direction: 'desc' });
  const [filters, setFilters] = useState(query);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<'delete' | 'blocked' | null>(null);
  function failed(failure: unknown) { if (failure instanceof ApiError && failure.status === 401) onExpired(); else setError(failure instanceof Error ? failure.message : 'Không thể xử lý công việc.'); }
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setTask(null); setPending(null);
    async function load() {
      if (selected) {
        const result = await taskApi.detail(selected);
        const membership = result.task.canEdit ? await projectApi.members(result.task.projectId) : { members: [] };
        if (active) { setTask(result.task); setMembers(membership.members); setInput({ title: result.task.title, description: result.task.description, priority: result.task.priority, startDate: result.task.startDate?.slice(0, 10) ?? null, dueDate: result.task.dueDate?.slice(0, 10) ?? null, effort: result.task.effort }); setAssigneeId(result.task.assigneeId ?? ''); }
      } else if (creating && projectId) {
        const result = await projectApi.members(projectId);
        if (active) { setMembers(result.members); setInput(empty); setAssigneeId(''); }
      } else {
        if (active) setPageData({ tasks: [], total: 0, page, pageSize: 20 });
        const params = new URLSearchParams({ page: String(page), pageSize: '20' });
        for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
        const result = projectId ? await taskApi.list(projectId, params) : await taskApi.mine(params);
        const membership = projectId ? await projectApi.members(projectId) : { members: [] };
        if (active) { setPageData(result); setMembers(membership.members); }
      }
    }
    void load().catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, selected, creating, page, filters, attempt]);
  async function mutate(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setPending(null); setAttempt((value) => value + 1); }
    catch (failure) { failed(failure); if (failure instanceof ApiError && failure.status === 403) { setTask(null); setMembers([]); setPending(null); } }
    finally { setBusy(false); }
  }
  function open(id: string) { setSelected(id); setCreating(false); setNotice(''); }
  function back() { setSelected(''); setCreating(false); setNotice(''); }
  function save(event: FormEvent) { event.preventDefault(); void mutate(async () => {
    if (selected) { await taskApi.update(selected, input); setNotice('Đã lưu công việc.'); }
    else if (projectId) { const result = await taskApi.create(projectId, { ...input, assigneeId: assigneeId || null }); setCreating(false); setSelected(result.task.id); setNotice('Đã tạo công việc.'); }
  }); }
  const nextStatus = task ? taskStatuses[taskStatuses.indexOf(task.status) + 1] : undefined;
  function advance(acknowledgeBlocked = false) { if (task && nextStatus) void mutate(async () => { const result = await taskApi.status(task.id, nextStatus, task.status, acknowledgeBlocked); setNotice(result.warning ?? 'Đã cập nhật trạng thái.'); }); }
  const showForm = creating || task?.canEdit;
  return <section className="tasks-panel" aria-busy={loading || busy}>
    <div className="panel-heading"><div><span className="eyebrow">{projectId ? 'CÔNG VIỆC DỰ ÁN' : 'CÔNG VIỆC CỦA BẠN'}</span><h2>{selected ? task?.title ?? 'Chi tiết Task' : creating ? 'Tạo công việc' : projectId ? 'Task' : 'My Tasks'}</h2></div><div className="member-actions">{selected || creating ? <button className="refresh-button" disabled={busy} onClick={back}>← Danh sách</button> : canCreate && <button className="primary-button" disabled={busy} onClick={() => { setCreating(true); setNotice(''); }}>+ Tạo Task</button>}<button className="refresh-button" disabled={busy || loading} onClick={() => setAttempt((value) => value + 1)}>Tải lại</button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải công việc…</p> : <>
    {!selected && !creating && <><form className="task-filters" onSubmit={(event) => { event.preventDefault(); setFilters({ ...query }); setPage(1); }}>
      <label>Tìm kiếm<input value={query.q} maxLength={200} placeholder="Tiêu đề hoặc mô tả" onChange={(event) => setQuery({ ...query, q: event.target.value })} /></label>
      <label>Trạng thái<select value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}><option value="">Tất cả</option>{taskStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <label>Ưu tiên<select value={query.priority} onChange={(event) => setQuery({ ...query, priority: event.target.value })}><option value="">Tất cả</option>{taskPriorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label>
      {projectId && <label>Phân công<select value={query.assigneeId} onChange={(event) => setQuery({ ...query, assigneeId: event.target.value })}><option value="">Tất cả</option><option value="unassigned">Chưa phân công</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.user.displayName}</option>)}</select></label>}
      <label>Sắp xếp<select value={query.sort} onChange={(event) => setQuery({ ...query, sort: event.target.value })}><option value="updatedAt">Cập nhật</option><option value="dueDate">Deadline</option><option value="priority">Ưu tiên</option><option value="title">Tiêu đề</option></select></label>
      <label>Thứ tự<select value={query.direction} onChange={(event) => setQuery({ ...query, direction: event.target.value })}><option value="desc">Giảm dần</option><option value="asc">Tăng dần</option></select></label><button className="primary-button">Áp dụng</button>
    </form><div className="task-view-tabs" role="group" aria-label="Cách xem công việc"><button className={view === 'list' ? 'primary-button' : 'refresh-button'} aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button><button className={view === 'board' ? 'primary-button' : 'refresh-button'} aria-pressed={view === 'board'} onClick={() => setView('board')}>Kanban</button></div>
    <p>{pageData.total} công việc · Trang {page}/{Math.max(1, Math.ceil(pageData.total / 20))} · Tối đa 20 công việc mỗi trang, áp dụng cho cả Kanban.</p>
    {!pageData.tasks.length && !error && <p>{pageData.total ? 'Trang này không còn công việc. Quay lại trang trước.' : 'Chưa có công việc phù hợp.'}</p>}
    {view === 'board' ? <div className="kanban-board">{taskStatuses.map((status) => <div className="kanban-column" key={status}><h3>{statusLabels[status]} <span>{pageData.tasks.filter((item) => item.status === status).length}</span></h3>{pageData.tasks.filter((item) => item.status === status).map((item) => <TaskCard key={item.id} task={item} open={open} />)}</div>)}</div> : <div className="task-list">{pageData.tasks.map((item) => <TaskCard key={item.id} task={item} open={open} />)}</div>}
    <div className="member-actions task-pagination"><button className="refresh-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trang trước</button><button className="refresh-button" disabled={page * 20 >= pageData.total} onClick={() => setPage((value) => value + 1)}>Trang sau →</button></div></>}
    {task && <div className="task-detail"><p className="project-description">{task.description || 'Chưa có mô tả.'}</p><dl><dt>Project</dt><dd>{task.project.name}</dd><dt>Trạng thái</dt><dd>{statusLabels[task.status]}</dd><dt>Ưu tiên</dt><dd>{priorityLabels[task.priority]}</dd><dt>Người phụ trách</dt><dd>{task.assignee?.displayName ?? 'Chưa phân công'}</dd><dt>Thời gian</dt><dd>{task.startDate?.slice(0, 10) ?? 'Chưa đặt'} → {task.dueDate?.slice(0, 10) ?? 'Chưa đặt'}</dd><dt>Effort</dt><dd>{task.effort ?? 'Chưa đặt'}</dd></dl>
      {task.blocked && <div className="form-notice"><strong>BLOCKED: còn công việc phụ thuộc chưa hoàn thành.</strong><ul>{task.blockingTasks.map((blocking) => <li key={blocking.id}>{blocking.title} · {statusLabels[blocking.status]}</li>)}</ul></div>}
      {task.project.status === 'CLOSED' && <p className="form-notice">Project đã đóng, công việc chỉ được xem.</p>}
      {task.canChangeStatus && nextStatus && <button className="primary-button" disabled={busy} onClick={() => task.blocked ? setPending('blocked') : advance()}>Chuyển sang {statusLabels[nextStatus]}</button>}
    </div>}
    {showForm && <form className="account-form workspace-form" onSubmit={save}><h3>{creating ? 'Thông tin công việc' : 'Sửa công việc'}</h3><fieldset disabled={busy}>
      <div className="form-field"><label htmlFor="task-title">Tiêu đề</label><input id="task-title" required maxLength={200} value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="task-description">Mô tả</label><textarea id="task-description" rows={4} maxLength={10000} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} /></div>
      <div className="project-dates"><div className="form-field"><label htmlFor="task-start">Ngày bắt đầu</label><input id="task-start" type="date" value={input.startDate ?? ''} onChange={(event) => setInput({ ...input, startDate: event.target.value || null })} /></div><div className="form-field"><label htmlFor="task-due">Deadline</label><input id="task-due" type="date" min={input.startDate ?? undefined} value={input.dueDate ?? ''} onChange={(event) => setInput({ ...input, dueDate: event.target.value || null })} /></div></div>
      <div className="task-filters"><label>Ưu tiên<select value={input.priority} onChange={(event) => setInput({ ...input, priority: event.target.value as TaskPriority })}>{taskPriorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label><label>Effort<select value={input.effort ?? ''} onChange={(event) => setInput({ ...input, effort: event.target.value ? Number(event.target.value) : null })}><option value="">Chưa đặt</option>{[1, 2, 3, 5, 8].map((effort) => <option key={effort}>{effort}</option>)}</select></label>
      {creating && <label>Người phụ trách<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Chưa phân công</option>{members.filter((member) => member.user.status === 'ACTIVE').map((member) => <option key={member.userId} value={member.userId}>{member.user.displayName} · {member.user.email}</option>)}</select></label>}</div>
      <button className="primary-button">{busy ? 'Đang lưu…' : creating ? 'Tạo Task' : 'Lưu thay đổi'}</button>
    </fieldset></form>}
    {task?.canEdit && <><form className="workspace-form" onSubmit={(event) => { event.preventDefault(); void mutate(async () => { await taskApi.assign(task.id, assigneeId || null); setNotice('Đã cập nhật người phụ trách.'); }); }}><h3>Phân công công việc</h3><div className="form-field"><label htmlFor="task-assignee">Thành viên Project</label><select id="task-assignee" disabled={busy} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Chưa phân công</option>{task.assignee && !members.some((member) => member.userId === task.assigneeId) && <option value={task.assigneeId!} disabled>{task.assignee.displayName} · Không còn trong Project</option>}{members.filter((member) => member.user.status === 'ACTIVE' || member.userId === task.assigneeId).map((member) => <option key={member.userId} value={member.userId} disabled={member.user.status !== 'ACTIVE'}>{member.user.displayName} · {member.user.email}</option>)}</select></div><button className="primary-button" disabled={busy}>Lưu phân công</button></form><button className="danger-button" disabled={busy} onClick={() => setPending('delete')}>Xóa Task</button></>}
    {pending && task && <div className="confirm-panel" role="group" aria-label="Xác nhận thay đổi công việc"><p>{pending === 'delete' ? `Xóa công việc “${task.title}”? Thao tác này xóa dữ liệu công việc.` : 'Còn dependency chưa DONE. Bạn đã xem cảnh báo và vẫn muốn chuyển trạng thái?'}</p><button className="primary-button" disabled={busy} onClick={() => pending === 'blocked' ? advance(true) : void mutate(async () => { await taskApi.remove(task.id); setSelected(''); setPage(1); setNotice('Đã xóa công việc.'); })}>Xác nhận</button> <button className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></div>}
    {task && <Comments key={task.id} taskId={task.id} projectId={task.projectId} onExpired={onExpired} />}
    </>}
  </section>;
}
function TaskCard({ task, open }: { task: Task; open: (id: string) => void }) {
  return <button className="task-card" onClick={() => open(task.id)}><strong>{task.title}</strong><span>{statusLabels[task.status]} · {priorityLabels[task.priority]}</span><span>{task.assignee?.displayName ?? 'Chưa phân công'} · {task.dueDate ? `Hạn ${task.dueDate.slice(0, 10)}` : 'Chưa đặt deadline'}</span><small>{task.project.name}{task.blocked ? ' · BLOCKED' : ''}</small></button>;
}
