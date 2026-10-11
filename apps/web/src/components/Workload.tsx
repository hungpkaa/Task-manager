import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, type CapacityPage, type WorkloadPage } from '../api';

function currentPeriod() {
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  return { start: `${today.slice(0, 7)}-01`, end: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10) };
}
export function Workload({ projectId, onExpired }: { projectId: string; onExpired: () => void }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(currentPeriod); const [draft, setDraft] = useState(period);
  const [page, setPage] = useState(1); const [historyPage, setHistoryPage] = useState(1); const [revision, setRevision] = useState(0);
  const [data, setData] = useState<WorkloadPage | null>(null); const [history, setHistory] = useState<CapacityPage | null>(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ userId: string; name: string; points: string; expectedUpdatedAt: string | null } | null>(null);
  function fail(value: unknown) { if (value instanceof ApiError && value.status === 401) onExpired(); else setError(value instanceof Error ? value.message : 'Không thể tải điều phối.'); }
  useEffect(() => {
    if (!open) return;
    let active = true; setLoading(true); setError(''); setEditing(null); setData(null); setHistory(null);
    Promise.all([projectApi.workload(projectId, period.start, period.end, page), projectApi.capacities(projectId, historyPage)])
      .then(([result, records]) => { if (active) { setData(result); setHistory(records); } })
      .catch((value: unknown) => { if (active) fail(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, open, period.start, period.end, page, historyPage, revision]);
  function selectPeriod(start: string, end: string) { setPeriod({ start, end }); setDraft({ start, end }); setPage(1); setNotice(''); setRevision((value) => value + 1); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return; setBusy(true); setError(''); setNotice('');
    try { await projectApi.saveCapacity(projectId, { userId: editing.userId, periodStart: period.start, periodEnd: period.end, capacityPoints: Number(editing.points), expectedUpdatedAt: editing.expectedUpdatedAt }); setNotice('Đã lưu Capacity và tính lại Workload.'); setHistoryPage(1); setRevision((value) => value + 1); }
    catch (value) { fail(value); } finally { setBusy(false); }
  }
  return <section className="sprints-panel" aria-label="Capacity và Workload" aria-busy={loading || busy}>
    <div className="panel-heading"><h3>Capacity và Workload</h3><button className="refresh-button" disabled={busy} onClick={() => setOpen(!open)}>{open ? 'Thu gọn điều phối' : 'Mở Capacity & Workload'}</button></div>
    {open && <>
      <p>Workload = Effort Task chưa DONE giao với kỳ / Capacity × 100%. Task thiếu ngày vẫn được tính; Capacity phải khớp đúng kỳ, không chia tỷ lệ theo ngày. Thiếu Effort có thể làm số liệu thấp hơn thực tế.</p>
      <p>Đặt Effort 1, 2, 3, 5, 8 trong chi tiết Task, sau đó tải lại Workload.</p>
      <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); selectPeriod(draft.start, draft.end); }}><fieldset disabled={busy || loading}><div className="project-dates"><label>Từ ngày<input aria-label="Kỳ Workload bắt đầu" type="date" required value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label><label>Đến ngày<input aria-label="Kỳ Workload kết thúc" type="date" min={draft.start} required value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label></div><button className="primary-button">Xem Workload</button></fieldset></form>
      <button className="refresh-button" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>Tải lại Workload</button>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">Đang tải Workload…</p>}
      {data && <>
        <p>Kỳ đang xem: {data.periodStart} → {data.periodEnd}. {data.summary.taskCount} Task chưa DONE · {data.summary.knownEffort} Effort đã biết.</p>
        <p className="form-notice">{data.summary.missingEffortCount} Task thiếu Effort · {data.summary.unassignedCount} Task chưa phân công ({data.summary.unassignedEffort} Effort).</p>
        {!data.canEdit && <p>Project đã đóng; chỉ xem dữ liệu.</p>}
        <ul className="member-list workload-list">{data.items.map((item) => <li key={item.user.id}><div><strong>{item.user.displayName}</strong><span>{item.user.email}{item.user.status === 'LOCKED' ? ' · Tài khoản khóa' : ''}</span><p>{item.taskCount} Task · {item.knownEffort} Effort · Capacity: {item.capacity?.capacityPoints ?? 'Chưa thiết lập'}</p><p>Workload: {item.percent === null ? 'Chưa tính được' : `${item.percent}%`}{item.overloaded ? ' · Quá tải' : ''}{!item.complete ? ' · Dữ liệu chưa đầy đủ' : ''}</p>{item.missingEffortCount > 0 && <p>{item.missingEffortCount} Task thiếu Effort.</p>}</div>{data.canEdit && item.user.status === 'ACTIVE' && <button className="refresh-button" disabled={busy} onClick={() => { setEditing({ userId: item.user.id, name: item.user.displayName, points: String(item.capacity?.capacityPoints ?? ''), expectedUpdatedAt: item.capacity?.updatedAt ?? null }); setNotice(''); }}>Thiết lập Capacity</button>}</li>)}</ul>
        <p>{data.total} thành viên · Trang {page}/{Math.max(1, Math.ceil(data.total / 20))}</p><div className="inline-fields"><button disabled={busy || loading || page <= 1} onClick={() => setPage(page - 1)}>Workload trước</button><button disabled={busy || loading || page * 20 >= data.total} onClick={() => setPage(page + 1)}>Workload sau</button></div>
        {editing && data.canEdit && <form className="workspace-form" aria-label="Thiết lập Capacity" onSubmit={(event) => void save(event)}><h4>Capacity: {editing.name}</h4><p>{period.start} → {period.end}</p><label>Capacity (điểm)<input aria-label="Capacity (điểm)" type="number" required min={1} max={1000000} step={1} disabled={busy} value={editing.points} onChange={(event) => setEditing({ ...editing, points: event.target.value })} /></label><button className="primary-button" disabled={busy}>Lưu Capacity</button> <button type="button" disabled={busy} onClick={() => setEditing(null)}>Hủy sửa Capacity</button></form>}
      </>}
      {history && <div><h4>Capacity đã lưu</h4><p>Các kỳ của cùng thành viên không được chồng nhau. Chọn kỳ đã lưu để xem/cập nhật. Lịch sử vẫn được giữ khi thành viên rời Project.</p><ul className="dependency-list">{history.items.map((item) => <li key={item.id}><strong>{item.user.displayName}</strong> · {item.periodStart.slice(0, 10)} → {item.periodEnd.slice(0, 10)} · {item.capacityPoints} điểm <button className="refresh-button" disabled={busy || loading} onClick={() => selectPeriod(item.periodStart.slice(0, 10), item.periodEnd.slice(0, 10))}>Xem kỳ này</button></li>)}</ul>{!history.items.length && <p>Chưa có Capacity.</p>}<p>{history.total} bản ghi · Trang {historyPage}/{Math.max(1, Math.ceil(history.total / 20))}</p><div className="inline-fields"><button disabled={busy || loading || historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>Capacity trước</button><button disabled={busy || loading || historyPage * 20 >= history.total} onClick={() => setHistoryPage(historyPage + 1)}>Capacity sau</button></div></div>}
    </>}
  </section>;
}
