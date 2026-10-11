import { useEffect, useState } from 'react';
import { ApiError, projectApi, type CalendarPage } from '../api';
import { Tasks, statusLabels } from './Tasks';

export function Calendar({ projectId, onExpired }: { projectId: string; onExpired: () => void }) {
  const [open, setOpen] = useState(false); const [month, setMonth] = useState(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7));
  const [day, setDay] = useState(''); const [page, setPage] = useState(1); const [sprintPage, setSprintPage] = useState(1); const [revision, setRevision] = useState(0);
  const [data, setData] = useState<CalendarPage | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [taskId, setTaskId] = useState('');
  useEffect(() => {
    if (!open || !month || taskId) { setLoading(false); if (!month) setData(null); return; }
    let active = true; setLoading(true); setData(null); setError('');
    const query = new URLSearchParams({ month, page: String(page), sprintPage: String(sprintPage) }); if (day) query.set('day', day);
    projectApi.calendar(projectId, query).then((result) => { if (active) setData(result); }).catch((value: unknown) => {
      if (!active) return; if (value instanceof ApiError && value.status === 401) onExpired(); else setError(value instanceof Error ? value.message : 'Không thể tải Calendar.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, open, month, day, page, sprintPage, revision, taskId]);
  function selectDay(value: string) { setDay(value); setPage(1); setSprintPage(1); }
  function back() { setTaskId(''); setRevision((value) => value + 1); }
  if (taskId) return <section aria-label="Calendar"><button className="refresh-button" onClick={back}>← Về Calendar</button><Tasks key={taskId} initialId={taskId} onExpired={onExpired} onBack={back} /></section>;
  const first = new Date(`${month}-01T00:00:00Z`); const offset = (first.getUTCDay() + 6) % 7; const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1, 0); const days = last.getUTCDate();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  return <section className="sprints-panel" aria-label="Calendar" aria-busy={loading}>
    <div className="panel-heading"><h3>Calendar</h3><button className="refresh-button" onClick={() => setOpen(!open)}>{open ? 'Thu gọn Calendar' : 'Mở Calendar'}</button></div>
    {open && <>
      <label>Tháng Calendar<input aria-label="Tháng Calendar" type="month" required value={month} onChange={(event) => { setMonth(event.target.value); selectDay(''); }} /></label>
      <p>Lịch theo ngày Việt Nam. Chọn ngày để xem Task/Sprint có khoảng ngày giao với ngày đó; chọn cả tháng để xem toàn kỳ.</p>
      <p>Task thiếu một ngày được xem là chưa giới hạn đầu/cuối; thiếu cả hai ngày không nằm trên lịch. Lịch gồm cả Task DONE và Sprint COMPLETED.</p>
      <div className="calendar-grid" aria-label="Chọn ngày Calendar">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label) => <strong key={label}>{label}</strong>)}
        {month && Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
        {month && Array.from({ length: days }, (_, index) => { const date = `${month}-${String(index + 1).padStart(2, '0')}`; return <button key={date} aria-label={`Xem ngày ${date}`} aria-pressed={date === day} aria-current={date === today ? 'date' : undefined} onClick={() => selectDay(date)}>{index + 1}</button>; })}
      </div>
      <div className="inline-fields"><button className="refresh-button" onClick={() => selectDay('')}>Xem cả tháng</button><button className="refresh-button" disabled={loading || !month} onClick={() => setRevision((value) => value + 1)}>Tải lại Calendar</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}{loading && <p role="status">Đang tải Calendar…</p>}
      {data && <>
        <p>Đang xem: {data.day ?? data.month} · {data.undatedCount} Task chưa có ngày.</p>
        <h4>Task trên lịch</h4><div className="task-list">{data.tasks.map((task) => <button className="task-card" key={task.id} onClick={() => setTaskId(task.id)}><strong>{task.title}</strong><span>{statusLabels[task.status]} · {task.assignee?.displayName ?? 'Chưa phân công'}</span><span>{task.startDate?.slice(0, 10) ?? 'Chưa đặt ngày bắt đầu'} → {task.dueDate?.slice(0, 10) ?? 'Chưa đặt hạn'}</span>{task.status !== 'DONE' && task.dueDate && task.dueDate.slice(0, 10) < today && <small>Quá hạn</small>}</button>)}</div>
        {!data.taskTotal && <p>Không có Task trên lịch trong kỳ này.</p>}
        <p>{data.taskTotal} Task · Trang {page}/{Math.max(1, Math.ceil(data.taskTotal / 20))}</p><div className="inline-fields"><button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Lịch Task trước</button><button disabled={loading || page * 20 >= data.taskTotal} onClick={() => setPage(page + 1)}>Lịch Task sau</button></div>
        <h4>Sprint trên lịch</h4><ul className="dependency-list">{data.sprints.map((sprint) => <li key={sprint.id}><strong>{sprint.name}</strong><p>{sprint.startDate.slice(0, 10)} → {sprint.endDate.slice(0, 10)} · {sprint.status}</p><p>{sprint.goal}</p></li>)}</ul>
        {!data.sprintTotal && <p>Không có Sprint trên lịch trong kỳ này.</p>}
        <p>{data.sprintTotal} Sprint · Trang {sprintPage}/{Math.max(1, Math.ceil(data.sprintTotal / 20))}</p><div className="inline-fields"><button disabled={loading || sprintPage <= 1} onClick={() => setSprintPage(sprintPage - 1)}>Lịch Sprint trước</button><button disabled={loading || sprintPage * 20 >= data.sprintTotal} onClick={() => setSprintPage(sprintPage + 1)}>Lịch Sprint sau</button></div>
      </>}
    </>}
  </section>;
}
