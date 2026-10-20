import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, workspaceApi, type Workspace, type WorkspaceMember, type WorkspaceInvitation } from '../api';
import { Projects, type ProjectView } from './Projects';
export type WorkspaceView = 'overview' | 'members' | 'projects';
function emailNotice(delivery: WorkspaceMember['emailDelivery']) {
  return delivery === 'LOCAL' ? 'Email mời đã được tạo trong hộp thư thử.' : delivery === 'SENT' ? 'Email mời đã gửi đến dịch vụ email.' : delivery === 'FAILED' ? 'Chưa gửi được email mời. Bạn có thể gửi lại từ danh sách lời mời đang chờ.' : 'Gửi email chưa được cấu hình.';
}

export function Workspaces({ userId, initialId, initialProjectId, onExpired, onSelected, workspaceView, onWorkspaceViewChange, projectView, onProjectViewChange }: { userId: string; initialId?: string; initialProjectId?: string; onExpired: () => void; onSelected?: (id: string | undefined) => void; workspaceView: WorkspaceView; onWorkspaceViewChange: (view: WorkspaceView) => void; projectView: ProjectView; onProjectViewChange: (view: ProjectView) => void }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const [items, setItems] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [myInvitations, setMyInvitations] = useState<Awaited<ReturnType<typeof workspaceApi.myInvitations>>['invitations']>([]);
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInvitation[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'CLOSED' | 'ALL'>('ACTIVE');
  const [pending, setPending] = useState<{ member?: WorkspaceMember; role?: WorkspaceMember['role']; kind?: 'close' | 'reopen' } | null>(null);

  useEffect(() => { onSelected?.(selected || undefined); onWorkspaceViewChange('overview'); onProjectViewChange('overview'); }, [selected, onSelected, onWorkspaceViewChange, onProjectViewChange]);

  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không thể xử lý yêu cầu.');
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setWorkspace(null); setMembers([]); setPendingInvites([]); setPending(null);
    const load = selected
      ? Promise.all([
          workspaceApi.detail(selected),
          workspaceApi.members(selected),
          workspaceApi.pendingInvitations(selected).catch(() => ({ invitations: [] })),
        ]).then(([detail, result, inviteResult]) => {
          if (active) {
            setWorkspace(detail.workspace);
            setMembers(result.members);
            setPendingInvites(inviteResult.invitations);
            setName(detail.workspace.name);
            setDescription(detail.workspace.description);
          }
        })
      : Promise.all([workspaceApi.list(), workspaceApi.myInvitations().catch(() => ({ invitations: [] }))]).then(([wsResult, invResult]) => {
          if (active) {
            setItems(wsResult.workspaces);
            setMyInvitations(invResult.invitations);
            setName('');
            setDescription('');
          }
        });
    load.catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, attempt]);

  async function mutate(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setPending(null); setAttempt((value) => value + 1); }
    catch (failure) {
      failed(failure);
      // Refresh authority after another owner changes this user's membership.
      if (selected && failure instanceof ApiError && failure.status === 403) {
        setWorkspace(null); setMembers([]); setPendingInvites([]);
      }
    } finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void mutate(async () => {
      if (selected) { await workspaceApi.update(selected, { name, description }); setNotice('Đã cập nhật Workspace.'); }
      else { const result = await workspaceApi.create({ name, description }); setCreating(false); setSelected(result.workspace.id); setNotice('Đã tạo Workspace. Bạn là Owner của không gian này.'); }
    });
  }
  const owner = workspace?.myRole === 'OWNER';
  const ownerCount = members.filter((member) => member.role === 'OWNER').length;
  const isClosed = workspace?.status === 'CLOSED';
  const displayedItems = items.filter((item) => statusFilter === 'ALL' || item.status === statusFilter);

  return <section className={`workspace-panel${selected ? ` is-detail workspace-view-${workspaceView}` : ''}`} aria-busy={loading || busy}>
    <div className="panel-heading"><div><span className="eyebrow">KHÔNG GIAN CỦA NHÓM</span><h1>{selected ? workspace?.name ?? 'Workspace' : 'Workspace của bạn'}</h1></div>{selected && <button className="refresh-button" disabled={busy} onClick={() => { setSelected(''); setNotice(''); }}>← Danh sách</button>}</div>
    {error && <div role="alert" className="form-error"><p>{error}</p><button className="refresh-button" onClick={() => setAttempt((value) => value + 1)} disabled={busy}>Thử lại</button></div>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải Workspace…</p> : <>
      {!selected && <>
        {myInvitations.length > 0 && (
          <div className="pending-invitations-banner">
            <h2>Lời mời tham gia Workspace ({myInvitations.length})</h2>
            <p className="intro">Bạn nhận được lời mời tham gia các Workspace dưới đây. Hãy chọn chấp nhận hoặc từ chối:</p>
            <ul className="member-list">
              {myInvitations.map((inv) => (
                <li key={inv.id}>
                  <div>
                    <strong>{inv.workspace?.name}</strong>
                    <span>Mời bởi: {inv.inviter?.displayName} ({inv.inviter?.email}) · {new Date(inv.createdAt).toLocaleDateString('vi-VN')}</span>
                    {inv.workspace?.description && <p className="invitation-desc">{inv.workspace.description}</p>}
                  </div>
                  <div className="member-actions">
                    <button type="button" className="primary-button" disabled={busy} onClick={() => void mutate(async () => {
                      const res = await workspaceApi.acceptInvitation(inv.id);
                      setSelected(res.workspace.id);
                      setNotice(`Bạn đã tham gia Workspace “${res.workspace.name}”.`);
                    })}>Chấp nhận</button>
                    <button type="button" className="danger-button" disabled={busy} onClick={() => void mutate(async () => {
                      await workspaceApi.declineInvitation(inv.id);
                      setNotice('Đã từ chối lời mời tham gia Workspace.');
                    })}>Từ chối</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="intro">Các không gian bạn đang tham gia. Tạo một không gian mới để kết nối nhóm.</p>
        <div className="workspace-list-toolbar"><div className="task-view-tabs" role="group" aria-label="Lọc trạng thái Workspace">
          <button type="button" className={statusFilter === 'ACTIVE' ? 'primary-button' : 'refresh-button'} aria-pressed={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')}>Đang hoạt động</button>
          <button type="button" className={statusFilter === 'CLOSED' ? 'primary-button' : 'refresh-button'} aria-pressed={statusFilter === 'CLOSED'} onClick={() => setStatusFilter('CLOSED')}>Đã đóng / Lưu trữ</button>
          <button type="button" className={statusFilter === 'ALL' ? 'primary-button' : 'refresh-button'} aria-pressed={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>Tất cả ({items.length})</button>
        </div>{!creating && <button type="button" className="primary-button workspace-create-trigger" onClick={() => { setCreating(true); setName(''); setDescription(''); }}>+ Tạo Workspace</button>}</div>
        <div className="workspace-grid">{displayedItems.map((item) => <button className="workspace-card" key={item.id} onClick={() => { setSelected(item.id); setNotice(''); }}><strong>{item.name}</strong><p>{item.description || 'Chưa có mô tả.'}</p><span>{item.status === 'CLOSED' ? 'Đã đóng · ' : ''}{item.myRole === 'OWNER' ? 'Owner' : 'Member'} · {item.memberCount} thành viên</span></button>)}</div>
        {displayedItems.length === 0 && !error && <p>{statusFilter === 'CLOSED' ? 'Chưa có Workspace nào đã đóng.' : statusFilter === 'ACTIVE' ? 'Bạn không có Workspace nào đang hoạt động.' : 'Bạn chưa tham gia Workspace nào.'}</p>}
      </>}
      {workspace && <>
        <div className="workspace-overview-card" id="workspace-summary">
          <span className="workspace-symbol" aria-hidden="true">{workspace.name.trim().slice(0, 1).toLocaleUpperCase('vi-VN') || 'W'}</span>
          <div className="workspace-overview-copy"><span className="eyebrow">TỔNG QUAN WORKSPACE</span><p>{workspace.description || 'Chưa có mô tả cho không gian này.'}</p>
            <div className="workspace-meta"><span className={`workspace-status-chip${isClosed ? ' is-closed' : ''}`}><i />{isClosed ? 'Đã đóng · Lưu trữ' : 'Đang hoạt động'}</span><span className="workspace-role-chip">Vai trò: <strong>{owner ? 'Owner' : 'Member'}</strong></span><span className="workspace-member-count">{members.length} thành viên</span></div>
          </div>
        </div>
        {isClosed && <p className="form-notice">Workspace này đã được đóng và chuyển sang chế độ chỉ xem. Các dự án và công việc vẫn được giữ để tra cứu lịch sử.</p>}
      </>}
      {((!selected && creating) || (selected && owner && !isClosed)) && <form className="account-form workspace-form" onSubmit={save}><div className="workspace-form-title"><h2>{selected ? 'Thông tin Workspace' : 'Tạo Workspace'}</h2>{!selected && <button type="button" className="refresh-button" disabled={busy} onClick={() => { setCreating(false); setName(''); setDescription(''); }}>Hủy</button>}</div><fieldset disabled={busy}><div className="form-field"><label htmlFor="workspace-name">Tên Workspace</label><input id="workspace-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-field"><label htmlFor="workspace-description">Mô tả</label><textarea id="workspace-description" maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></div><button className="primary-button">{busy ? 'Đang xử lý…' : selected ? 'Lưu thay đổi' : 'Tạo Workspace'}</button></fieldset></form>}
      {workspace && owner && <div className="workspace-lifecycle-actions">
        {!isClosed ? (
          <button type="button" className="danger-button" disabled={busy} onClick={() => setPending({ kind: 'close' })}>Xóa Workspace</button>
        ) : (
          <button type="button" className="primary-button" disabled={busy} onClick={() => setPending({ kind: 'reopen' })}>Mở lại Workspace</button>
        )}
      </div>}
      {workspace && <div className="members-panel" id="workspace-members">
        <div className="members-panel-heading"><div><span className="eyebrow">NHÓM CỦA BẠN</span><h2>Thành viên <span className="members-count">{members.length}</span></h2></div></div>
        {owner && !isClosed && (
          <form className="invite-form" onSubmit={(event) => {
            event.preventDefault();
            void mutate(async () => {
              const result = await workspaceApi.invite(selected, email);
              setEmail('');
              setNotice(`Đã gửi lời mời tham gia Workspace. ${emailNotice(result.member.emailDelivery)}`);
            });
          }}>
            <label htmlFor="invite-email">Mời bằng email đã đăng ký</label>
            <div className="inline-fields">
              <input id="invite-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} placeholder="nhap.email@example.com" />
              <button className="primary-button" disabled={busy}>Gửi lời mời</button>
            </div>
            <p className="field-help">Người nhận sẽ nhận được thông báo/email và có thể chọn Chấp nhận hoặc Từ chối trước khi chính thức vào Workspace.</p>
          </form>
        )}
        {owner && !isClosed && (
          <div className="pending-invites-section">
            <h3>Lời mời đang chờ phản hồi <span className="members-count">{pendingInvites.length}</span></h3>
            {pendingInvites.length > 0 ? (
              <ul className="member-list">
                {pendingInvites.map((inv) => (
                  <li key={inv.id}>
                    <div>
                      <strong>{inv.invitee?.displayName ?? 'Người dùng'}</strong>
                      <span>{inv.invitee?.email} · Gửi lúc {new Date(inv.createdAt).toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="member-actions">
                      <button type="button" className="refresh-button" disabled={busy || inv.invitee?.status !== 'ACTIVE'} onClick={() => void mutate(async () => {
                        const result = await workspaceApi.resendInvitation(selected, inv.id);
                        setNotice(emailNotice(result.delivery));
                      })}>Gửi lại email mời</button>
                      <button type="button" className="danger-button" disabled={busy} onClick={() => void mutate(async () => {
                        await workspaceApi.cancelInvitation(selected, inv.id);
                        setNotice('Đã hủy lời mời.');
                      })}>Hủy lời mời</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-help">Không có lời mời nào đang chờ phản hồi.</p>
            )}
          </div>
        )}
        <h3 className="official-members-heading">Thành viên chính thức</h3>
        <ul className="member-list">{members.map((member) => {
          const lastOwner = member.role === 'OWNER' && ownerCount === 1;
          return <li key={member.userId}>
            <div>
              <strong>{member.user.displayName}{member.userId === userId ? ' (bạn)' : ''}</strong>
              <span>{member.user.email} · {member.role === 'OWNER' ? 'Owner' : 'Member'}{member.user.status === 'LOCKED' ? ' · Đang bị khóa' : ''}</span>
              {owner && !isClosed && lastOwner && <small>Owner cuối cùng: hãy cấp quyền Owner cho thành viên khác trước.</small>}
            </div>
            {owner && !isClosed && <div className="member-actions">
              <button className="refresh-button" disabled={busy || lastOwner} onClick={() => setPending({ member, role: member.role === 'OWNER' ? 'MEMBER' : 'OWNER' })}>{member.role === 'OWNER' ? 'Đổi thành Member' : 'Cấp quyền Owner'}</button>
              <button className="danger-button" disabled={busy || lastOwner} onClick={() => setPending({ member })}>Xóa khỏi nhóm</button>
            </div>}
          </li>;
        })}</ul>
      {pending && <div className="confirm-panel" role="group" aria-label="Xác nhận thao tác Workspace">
        {pending.kind === 'close' ? (
          <><p>Xóa (đóng) Workspace “{workspace?.name}”? Workspace sẽ được chuyển vào mục lưu trữ và ẩn khỏi danh sách chính. Mọi Project phải được hoàn thành trước khi xóa.</p><button type="button" className="danger-button" disabled={busy} onClick={() => void mutate(async () => { await workspaceApi.close(selected); setSelected(''); setNotice('Đã xóa Workspace và chuyển vào mục lưu trữ.'); })}>Xác nhận xóa</button> <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></>
        ) : pending.kind === 'reopen' ? (
          <><p>Mở lại Workspace “{workspace?.name}”? Workspace sẽ hoạt động trở lại để tiếp tục quản lý các dự án.</p><button type="button" className="primary-button" disabled={busy} onClick={() => void mutate(async () => { await workspaceApi.reopen(selected); setNotice('Đã mở lại Workspace thành công.'); })}>Xác nhận mở lại</button> <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></>
        ) : pending.member ? (
          <><p>{pending.role ? `Đổi vai trò của ${pending.member.user.displayName} thành ${pending.role === 'OWNER' ? 'Owner' : 'Member'}? Owner có thể sửa Workspace và quản lý thành viên.` : `Xóa ${pending.member.user.displayName} khỏi Workspace? Người này sẽ mất quyền truy cập không gian.`}</p><button type="button" className="primary-button" disabled={busy} onClick={() => void mutate(async () => { if (pending.role) await workspaceApi.role(selected, pending.member!.userId, pending.role); else await workspaceApi.remove(selected, pending.member!.userId); if (!pending.role && pending.member!.userId === userId) setSelected(''); setNotice('Đã cập nhật thành viên.'); })}>Xác nhận</button> <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></>
        ) : null}
      </div>}
      </div>}
      {workspace && <Projects key={workspace.id} workspaceId={workspace.id} owner={owner && !isClosed} initialId={workspace.id === initialId ? initialProjectId : undefined} onExpired={onExpired} activeView={projectView} onViewChange={onProjectViewChange} />}
    </>}
  </section>;
}
