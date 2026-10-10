import { useEffect, useState } from 'react';
import { ApiError, notificationApi, projectApi, type Notification } from '../api';

export function Notifications({ onExpired, onWorkspace, onProject }: { onExpired: () => void; onWorkspace: (id: string) => void; onProject: (workspaceId: string, projectId: string) => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không thể tải thông báo.');
  }
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    notificationApi.list().then((result) => { if (active) { setItems(result.items); setUnread(result.unreadCount); } })
      .catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  async function read(item: Notification) {
    setBusy(item.id); setError('');
    try { await notificationApi.read(item.id); setAttempt((value) => value + 1); }
    catch (failure) { failed(failure); } finally { setBusy(''); }
  }
  async function openProject(id: string) {
    setBusy(id); setError('');
    try { const result = await projectApi.detail(id); onProject(result.project.workspaceId, id); }
    catch (failure) { failed(failure); } finally { setBusy(''); }
  }
  return <section className="workspace-panel">
    <div className="panel-heading"><div><span className="eyebrow">CẬP NHẬT CỦA BẠN</span><h1>Thông báo</h1></div><button className="refresh-button" disabled={loading || Boolean(busy)} onClick={() => setAttempt((value) => value + 1)}>Làm mới</button></div>
    <p>{unread} thông báo chưa đọc · Hiển thị 50 thông báo gần nhất.</p>{error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p role="status">Đang tải thông báo…</p> : <ul className="notification-list">{items.map((item) => <li className={item.readAt ? '' : 'unread'} key={item.id}>
      <h2>{item.title}</h2><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString('vi-VN')}</small>
      <div className="member-actions">{!item.readAt && <button className="refresh-button" disabled={Boolean(busy)} onClick={() => void read(item)}>{busy === item.id ? 'Đang lưu…' : 'Đánh dấu đã đọc'}</button>}
      {item.relatedEntityType === 'WORKSPACE' && <button className="primary-button" disabled={Boolean(busy)} onClick={() => onWorkspace(item.relatedEntityId)}>Mở Workspace</button>}
      {item.relatedEntityType === 'PROJECT' && <button className="primary-button" disabled={Boolean(busy)} onClick={() => void openProject(item.relatedEntityId)}>Mở Project</button>}</div>
    </li>)}</ul>}{!loading && !error && !items.length && <p>Bạn chưa có thông báo.</p>}
  </section>;
}
