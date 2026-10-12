import { useEffect, useState } from 'react';
import { ApiError, notificationApi, projectApi, workspaceApi, type Notification } from '../api';

export function Notifications({ onExpired, onWorkspace, onProject, onTask }: { onExpired: () => void; onWorkspace: (id: string) => void; onProject: (workspaceId: string, projectId: string) => void; onTask: (id: string) => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không thể tải thông báo.');
  }
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setItems([]);
    notificationApi.list(page, filter).then((result) => { if (active) { setItems(result.items); setUnread(result.unreadCount); setTotal(result.total); if (page > 1 && (page - 1) * result.pageSize >= result.total) setPage(Math.max(1, Math.ceil(result.total / result.pageSize))); } })
      .catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, page, filter]);
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
  async function acceptInvite(item: Notification) {
    setBusy(item.id); setError('');
    try {
      const result = await workspaceApi.acceptInvitation(item.relatedEntityId);
      await notificationApi.read(item.id);
      onWorkspace(result.workspace.id);
    } catch (failure) { failed(failure); } finally { setBusy(''); }
  }
  async function declineInvite(item: Notification) {
    setBusy(item.id); setError('');
    try {
      await workspaceApi.declineInvitation(item.relatedEntityId);
      await notificationApi.read(item.id);
      setAttempt((value) => value + 1);
    } catch (failure) { failed(failure); } finally { setBusy(''); }
  }
  return <section className="workspace-panel notifications-panel" aria-label="Lịch sử thông báo" aria-busy={loading}>
    <div className="panel-heading"><div><span className="eyebrow">CẬP NHẬT CỦA BẠN</span><h1>Thông báo</h1></div><button className="refresh-button" disabled={loading || Boolean(busy)} onClick={() => setAttempt((value) => value + 1)}>Làm mới</button></div>
    <p>{unread} thông báo chưa đọc trong toàn bộ lịch sử.</p>
    <div className="notification-toolbar"><label>Lọc thông báo<select aria-label="Lọc thông báo" disabled={loading || Boolean(busy)} value={filter} onChange={(event) => { setFilter(event.target.value as 'all' | 'unread'); setPage(1); }}><option value="all">Tất cả</option><option value="unread">Chưa đọc</option></select></label>
    {!loading && !error && <div className="notification-pagination"><p role="status">{total} thông báo trong bộ lọc · Trang {page}/{Math.max(1, Math.ceil(total / 50))}</p><div className="member-actions"><button className="refresh-button" disabled={Boolean(busy) || page <= 1} onClick={() => setPage(page - 1)}>Thông báo trước</button><button className="refresh-button" disabled={Boolean(busy) || page * 50 >= total} onClick={() => setPage(page + 1)}>Thông báo sau</button></div></div>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p role="status">Đang tải thông báo…</p> : <ul className="notification-list">{items.map((item) => <li className={item.readAt ? '' : 'unread'} key={item.id}>
      <div className="notification-heading"><h2>{item.title}</h2><span className={`notification-state ${item.readAt ? 'is-read' : ''}`}>{item.readAt ? 'Đã đọc' : 'Chưa đọc'}</span></div><p>{item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</time>
      <div className="member-actions">{!item.readAt && <button className="refresh-button" disabled={Boolean(busy)} onClick={() => void read(item)}>{busy === item.id ? 'Đang lưu…' : 'Đánh dấu đã đọc'}</button>}
      {item.relatedEntityType === 'WORKSPACE_INVITATION' && <>
        <button className="primary-button" disabled={Boolean(busy)} onClick={() => void acceptInvite(item)}>Chấp nhận lời mời</button>
        <button className="danger-button" disabled={Boolean(busy)} onClick={() => void declineInvite(item)}>Từ chối lời mời</button>
      </>}
      {item.relatedEntityType === 'WORKSPACE' && <button className="primary-button" disabled={Boolean(busy)} onClick={() => onWorkspace(item.relatedEntityId)}>Mở Workspace</button>}
      {item.relatedEntityType === 'PROJECT' && <button className="primary-button" disabled={Boolean(busy)} onClick={() => void openProject(item.relatedEntityId)}>Mở Project</button>}
      {item.relatedEntityType === 'TASK' && <button className="primary-button" disabled={Boolean(busy)} onClick={() => onTask(item.relatedEntityId)}>Mở công việc</button>}</div>
    </li>)}</ul>}{!loading && !error && !items.length && <p>{filter === 'unread' ? 'Bạn không có thông báo chưa đọc.' : 'Bạn chưa có thông báo.'}</p>}
  </section>;
}
