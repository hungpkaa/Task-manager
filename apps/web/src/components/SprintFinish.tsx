import { useState } from 'react';
import { ApiError, sprintApi, type Sprint } from '../api';
import { StyledSelect } from './StyledSelect';

export function SprintFinish({ projectId, sprint, sprints, onFinished, onExpired }: { projectId: string; sprint: Sprint; sprints: Sprint[]; onFinished: () => void; onExpired: () => void }) {
  const [preview, setPreview] = useState<{ snapshot: string; doneCount: number; incompleteCount: number } | null>(null);
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(confirm: boolean) {
    setBusy(true); setError('');
    try {
      if (confirm && preview) { await sprintApi.finish(projectId, sprint.id, preview.snapshot, preview.incompleteCount ? destination || null : null); onFinished(); }
      else setPreview(await sprintApi.finishPreview(projectId, sprint.id));
    } catch (value) { setPreview(null); if (value instanceof ApiError && value.status === 401) onExpired(); else setError(value instanceof Error ? value.message : 'Không thể kết thúc Sprint.'); }
    finally { setBusy(false); }
  }
  return <div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!preview && <button className="primary-button" disabled={busy} onClick={() => void run(false)}>Kết thúc Sprint</button>}
    {preview && <div role="group" aria-label="Xác nhận kết thúc Sprint" className="confirm-panel">
      <h4>Kết thúc “{sprint.name}”?</h4><p>DONE {preview.doneCount} · Chưa DONE {preview.incompleteCount}</p>
      {preview.incompleteCount > 0 && <label>Chuyển toàn bộ Task chưa DONE đến<StyledSelect aria-label="Nơi nhận Task chưa DONE" disabled={busy} value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Product Backlog</option>{sprints.filter((item) => item.id !== sprint.id && item.status === 'PLANNED').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</StyledSelect></label>}
      <p>Task DONE ở lại Sprint. Các Task chuyển tiếp giữ nguyên trạng thái. Sprint sẽ chuyển COMPLETED và nhóm nhận thông báo.</p>
      <button className="primary-button" disabled={busy} onClick={() => void run(true)}>Xác nhận kết thúc Sprint</button> <button className="refresh-button" disabled={busy} onClick={() => setPreview(null)}>Hủy kết thúc Sprint</button>
    </div>}
  </div>;
}
