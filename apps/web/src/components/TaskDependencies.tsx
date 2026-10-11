import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, taskApi, type DependencyPage, type TaskPage } from '../api';

export function TaskDependencies({ taskId, projectId, onExpired, onChanged }: { taskId: string; projectId: string; onExpired: () => void; onChanged: () => void }) {
  const [data, setData] = useState<DependencyPage | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidates, setCandidates] = useState<TaskPage | null>(null);
  const [finding, setFinding] = useState(false);
  const [candidateError, setCandidateError] = useState('');
  const [selected, setSelected] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  function failure(value: unknown) {
    if (value instanceof ApiError && value.status === 401) onExpired();
    else setError(value instanceof Error ? value.message : 'Không thể xử lý dependency.');
  }
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    taskApi.dependencies(taskId, page).then((result) => { if (active) setData(result); }).catch((value: unknown) => { if (active) failure(value); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId, page, revision]);
  useEffect(() => {
    if (!data?.canEdit) return;
    let active = true; setFinding(true); setCandidateError(''); setSelected('');
    taskApi.list(projectId, new URLSearchParams({ q: query, page: String(candidatePage), pageSize: '20', sort: 'title', direction: 'asc' })).then((result) => { if (active) setCandidates(result); }).catch((value: unknown) => { if (active) { if (value instanceof ApiError && value.status === 401) onExpired(); else setCandidateError(value instanceof Error ? value.message : 'Không thể tìm Task.'); } }).finally(() => { if (active) setFinding(false); });
    return () => { active = false; };
  }, [projectId, query, candidatePage, data?.canEdit, revision]);
  async function mutate(removeId?: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (removeId) await taskApi.removeDependency(taskId, removeId); else await taskApi.addDependency(taskId, selected);
      setNotice(removeId ? 'Đã xóa dependency.' : 'Đã thêm dependency.'); setRemoving(null); setSelected(''); setPage(1); setRevision((value) => value + 1); onChanged();
    } catch (value) { failure(value); }
    finally { setBusy(false); }
  }
  function find(event: FormEvent) { event.preventDefault(); setCandidatePage(1); setQuery(search.trim()); }
  return <section aria-label="Task Dependency" aria-busy={loading || busy}>
    <div className="panel-heading"><h3>Task Dependency</h3><button className="refresh-button" disabled={busy || loading} onClick={() => { setRevision((value) => value + 1); onChanged(); }}>Tải lại dependency</button></div>
    <p>Task này phụ thuộc vào các Task bên dưới. Dependency chưa DONE tạo cảnh báo BLOCKED; trạng thái công việc không tự thay đổi. PM tải lại điều phối hoặc theo dõi Sprint để xem Project Risk sau khi thay đổi dependency.</p>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">Đang tải dependency…</p>}
    {data && <>
      {!data.items.length && <p>Chưa có dependency.</p>}
      <ul className="dependency-list">{data.items.map((item) => <li key={item.dependsOnTaskId}><strong>{item.dependsOnTask.title}</strong> · {item.dependsOnTask.status}{item.dependsOnTask.status !== 'DONE' ? ' · Chưa hoàn thành' : ''}{data.canEdit && <button className="refresh-button" disabled={busy} onClick={() => setRemoving(item.dependsOnTaskId)}>Xóa dependency</button>}</li>)}</ul>
      <p>{data.total} dependency · Trang {page}/{Math.max(1, Math.ceil(data.total / 20))}</p><div className="inline-fields"><button className="refresh-button" disabled={busy || loading || page <= 1} onClick={() => setPage(page - 1)}>Dependency trước</button><button className="refresh-button" disabled={busy || loading || page * 20 >= data.total} onClick={() => setPage(page + 1)}>Dependency sau</button></div>
      {data.canEdit && <div className="workspace-form"><form onSubmit={find} className="form-field"><label>Tìm Task phụ thuộc<input aria-label="Tìm Task phụ thuộc" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} disabled={busy} /></label><button className="refresh-button" disabled={busy || finding}>Tìm Task</button></form>
        {candidateError && <p role="alert" className="form-error">{candidateError}</p>}{finding && <p role="status">Đang tìm Task…</p>}
        <div className="form-field task-sprint-picker"><label>Task phụ thuộc<select aria-label="Task phụ thuộc" disabled={busy || finding} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Chọn Task</option>{candidates?.tasks.filter((item) => item.id !== taskId).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label></div>
        <p>Trang Task {candidatePage}/{Math.max(1, Math.ceil((candidates?.total ?? 0) / 20))}. Task hiện tại được loại khỏi lựa chọn.</p><div className="inline-fields"><button className="refresh-button" disabled={busy || finding || candidatePage <= 1} onClick={() => setCandidatePage(candidatePage - 1)}>Task phụ thuộc trước</button><button className="refresh-button" disabled={busy || finding || candidatePage * 20 >= (candidates?.total ?? 0)} onClick={() => setCandidatePage(candidatePage + 1)}>Task phụ thuộc sau</button></div>
        <button className="primary-button" disabled={busy || loading || finding || !selected} onClick={() => void mutate()}>Thêm dependency</button>
      </div>}
      {removing && data.canEdit && <div className="confirm-panel" role="group" aria-label="Xác nhận xóa dependency"><p>Xóa liên kết phụ thuộc? Hai Task vẫn được giữ lại.</p><button className="primary-button" disabled={busy} onClick={() => void mutate(removing)}>Xác nhận xóa dependency</button> <button className="refresh-button" disabled={busy} onClick={() => setRemoving(null)}>Hủy xóa dependency</button></div>}
    </>}
  </section>;
}
