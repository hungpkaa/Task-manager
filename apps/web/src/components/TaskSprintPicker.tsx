import { useEffect, useState } from 'react';
import { ApiError, sprintApi, type Sprint } from '../api';
import { StyledSelect } from './StyledSelect';

export function TaskSprintPicker({ projectId, value, onChange, disabled, onExpired }: { projectId: string; value: string; onChange: (value: string) => void; disabled: boolean; onExpired: () => void }) {
  const [page, setPage] = useState(1);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selected, setSelected] = useState<Sprint | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    sprintApi.list(projectId, page).then((result) => { if (active) { setSprints(result.items); setTotal(result.total); } }).catch((failure: unknown) => { if (active) { if (failure instanceof ApiError && failure.status === 401) onExpired(); else setError(failure instanceof Error ? failure.message : 'Không thể tải Sprint.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, page, revision]);
  return <div className="form-field task-sprint-picker">
    <label>Sprint khi tạo Task<StyledSelect aria-label="Sprint khi tạo Task" disabled={disabled || loading} value={value} onChange={(event) => { onChange(event.target.value); setSelected(sprints.find((item) => item.id === event.target.value) ?? null); }}>
      <option value="">Product Backlog (chưa thuộc Sprint)</option>
      {value && selected && !sprints.some((item) => item.id === value) && <option value={value}>{selected.name} · {selected.status}</option>}
      {sprints.filter((item) => item.status !== 'COMPLETED').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}
    </StyledSelect></label>
    {loading && <p role="status">Đang tải Sprint để chọn…</p>}{error && <p role="alert" className="form-error">{error}</p>}
    {(total > 20 || sprints.length > 0) && <div className="inline-fields sprint-picker-pagination"><button type="button" className="refresh-button" disabled={disabled || loading || page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button type="button" className="refresh-button" disabled={disabled || loading || page * 20 >= total} onClick={() => setPage(page + 1)}>Sau</button><button type="button" className="refresh-button" disabled={disabled || loading} onClick={() => setRevision((value) => value + 1)}>Làm mới</button></div>}
  </div>;
}
