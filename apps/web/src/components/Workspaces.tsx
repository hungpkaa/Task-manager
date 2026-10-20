import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, workspaceApi, type Workspace, type WorkspaceMember, type WorkspaceInvitation } from '../api';
import { Projects } from './Projects';
function emailNotice(delivery: WorkspaceMember['emailDelivery']) {
  return delivery === 'LOCAL' ? 'Email mời đã được tạo trong hộp thư thử.' : delivery === 'SENT' ? 'Email mời đã gửi đến dịch vụ email.' : delivery === 'FAILED' ? 'Chưa gửi được email mời. Bạn có thể gửi lại từ danh sách lời mời đang chờ.' : 'Gửi email chưa được cấu hình.';
}

export function Workspaces({ userId, initialId, initialProjectId, onExpired, onWorkspaceChange, onProjectChange, onTaskChange, projectOpen, taskOpen }: { userId: string; initialId?: string; initialProjectId?: string; onExpired: () => void; onWorkspaceChange?: (data: { id: string; name: string } | null) => void; onProjectChange?: (data: { id: string; name: string } | null) => void; onTaskChange?: (name: string | null) => void; projectOpen?: boolean; taskOpen?: boolean }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const [items, setItems] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [myInvitations, setMyInvitations] = useState<Awaited<ReturnType<typeof workspaceApi.myInvitations>>['invitations']>([]);
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInvitation[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'CLOSED' | 'ALL'>('ACTIVE');
  const [pending, setPending] = useState<{ member?: WorkspaceMember; role?: WorkspaceMember['role']; kind?: 'close' | 'reopen' } | null>(null);
  const [editing, setEditing] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không thể xử lý yêu cầu.');
  }
  useEffect(() => {
    let active = true;
    if (!workspace) setLoading(true);
    setError(''); setPending(null);
    if (!selected) {
      setWorkspace(null);
      setMembers([]);
      setPendingInvites([]);
      setEditing(false);
      setMembersOpen(false);
    }
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
            onWorkspaceChange?.({ id: selected, name: detail.workspace.name });
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
      if (selected) {
        await workspaceApi.update(selected, { name, description });
        setNotice('Đã cập nhật Workspace.');
        setEditing(false);
      } else {
        const result = await workspaceApi.create({ name, description });
        setSelected(result.workspace.id);
        setNotice('Đã tạo Workspace. Bạn là Owner của không gian này.');
      }
    });
  }
  const owner = workspace?.myRole === 'OWNER';
  const ownerCount = members.filter((member) => member.role === 'OWNER').length;
  const isClosed = workspace?.status === 'CLOSED';
  const displayedItems = items.filter((item) => statusFilter === 'ALL' || item.status === statusFilter);

  return <section className="workspace-panel" aria-busy={loading || busy}>
    {!projectOpen && <>
    <div className="panel-heading">
      <div>
        <span className="eyebrow">KHÔNG GIAN CỦA NHÓM</span>
        <h1>{selected ? workspace?.name ?? 'Workspace' : 'Workspace của bạn'}</h1>
      </div>
      {selected && (
        <div className="member-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className={membersOpen ? 'primary-button' : 'refresh-button'}
            disabled={busy}
            onClick={() => setMembersOpen((val) => !val)}
            title="Xem và quản lý thành viên"
          >
            👥 {membersOpen ? 'Đóng thành viên' : `Thành viên (${members.length})`}
          </button>
          {owner && !isClosed && (
            <button
              type="button"
              className={editing ? 'primary-button' : 'refresh-button'}
              disabled={busy}
              onClick={() => setEditing((val) => !val)}
              title="Chỉnh sửa thông tin Workspace"
            >
              {editing ? '✕ Đóng sửa' : '✏️ Sửa Workspace'}
            </button>
          )}
          {owner && !isClosed && (
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={() => setPending({ kind: 'close' })}
            >
              Xóa Workspace
            </button>
          )}
          {owner && isClosed && (
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => setPending({ kind: 'reopen' })}
            >
              Mở lại Workspace
            </button>
          )}
          <button
            type="button"
            className="refresh-button"
            disabled={busy}
            onClick={() => {
              setSelected('');
              setEditing(false);
              setMembersOpen(false);
              setNotice('');
              onWorkspaceChange?.(null);
              onProjectChange?.(null);
              onTaskChange?.(null);
            }}
          >
            ← Danh sách
          </button>
        </div>
      )}
    </div>
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
        <div className="task-view-tabs" role="group" aria-label="Lọc trạng thái Workspace">
          <button type="button" className={statusFilter === 'ACTIVE' ? 'primary-button' : 'refresh-button'} aria-pressed={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')}>Đang hoạt động</button>
          <button type="button" className={statusFilter === 'CLOSED' ? 'primary-button' : 'refresh-button'} aria-pressed={statusFilter === 'CLOSED'} onClick={() => setStatusFilter('CLOSED')}>Đã đóng / Lưu trữ</button>
          <button type="button" className={statusFilter === 'ALL' ? 'primary-button' : 'refresh-button'} aria-pressed={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>Tất cả ({items.length})</button>
        </div>
        <div className="workspace-grid">{displayedItems.map((item) => <button className="workspace-card" key={item.id} onClick={() => { setSelected(item.id); setNotice(''); }}><strong>{item.name}</strong><p>{item.description || 'Chưa có mô tả.'}</p><span>{item.status === 'CLOSED' ? 'Đã đóng · ' : ''}{item.myRole === 'OWNER' ? 'Owner' : 'Member'} · {item.memberCount} thành viên</span></button>)}</div>
        {displayedItems.length === 0 && !error && <p>{items.length === 0 ? 'Bạn chưa tham gia Workspace nào.' : statusFilter === 'CLOSED' ? 'Chưa có Workspace nào đã đóng.' : 'Bạn không có Workspace nào đang hoạt động.'}</p>}
      </>}
      {workspace && <>
        <p className="intro">{workspace.description || 'Chưa có mô tả.'}</p>
        <p>Trạng thái: <strong>{isClosed ? 'Đã đóng (Lưu trữ)' : 'Đang hoạt động'}</strong> · Vai trò của bạn: <strong>{owner ? 'Owner' : 'Member'}</strong> · {members.length} thành viên</p>
        {isClosed && <p className="form-notice">Workspace này đã được đóng và chuyển sang chế độ chỉ xem. Các dự án và công việc vẫn được giữ để tra cứu lịch sử.</p>}
      </>}
      {pending && <div className="confirm-panel" role="group" aria-label="Xác nhận thao tác Workspace" style={{ margin: '16px 0' }}>
        {pending.kind === 'close' ? (
          <><p>Xóa (đóng) Workspace “{workspace?.name}”? Workspace sẽ được chuyển vào mục lưu trữ và ẩn khỏi danh sách chính. Mọi Project phải được hoàn thành trước khi xóa.</p><button type="button" className="danger-button" disabled={busy} onClick={() => void mutate(async () => { await workspaceApi.close(selected); setSelected(''); setEditing(false); setMembersOpen(false); setNotice('Đã xóa Workspace và chuyển vào mục lưu trữ.'); })}>Xác nhận xóa</button> <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></>
        ) : pending.kind === 'reopen' ? (
          <><p>Mở lại Workspace “{workspace?.name}”? Workspace sẽ hoạt động trở lại để tiếp tục quản lý các dự án.</p><button type="button" className="primary-button" disabled={busy} onClick={() => void mutate(async () => { await workspaceApi.reopen(selected); setNotice('Đã mở lại Workspace thành công.'); })}>Xác nhận mở lại</button> <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></>
        ) : pending.member ? (
          <><p>{pending.role ? `Đổi vai trò của ${pending.member.user.displayName} thành ${pending.role === 'OWNER' ? 'Owner' : 'Member'}? Owner có thể sửa Workspace và quản lý thành viên.` : `Xóa ${pending.member.user.displayName} khỏi Workspace? Người này sẽ mất quyền truy cập không gian.`}</p><button type="button" className="primary-button" disabled={busy} onClick={() => void mutate(async () => { if (pending.role) await workspaceApi.role(selected, pending.member!.userId, pending.role); else await workspaceApi.remove(selected, pending.member!.userId); if (!pending.role && pending.member!.userId === userId) { setSelected(''); setEditing(false); setMembersOpen(false); } setNotice('Đã cập nhật thành viên.'); })}>Xác nhận</button> <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></>
        ) : null}
      </div>}
      {(!selected || (owner && !isClosed && editing)) && (
        <form className="account-form workspace-form" onSubmit={save}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2>{selected ? 'Thông tin Workspace' : 'Tạo Workspace'}</h2>
            {selected && (
              <button type="button" className="refresh-button" onClick={() => setEditing(false)} style={{ padding: '3px 8px', fontSize: '11px' }}>
                ✕ Đóng
              </button>
            )}
          </div>
          <fieldset disabled={busy}>
            <div className="form-field">
              <label htmlFor="workspace-name">Tên Workspace</label>
              <input id="workspace-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="workspace-description">Mô tả</label>
              <textarea id="workspace-description" maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="primary-button">{busy ? 'Đang xử lý…' : selected ? 'Lưu thay đổi' : 'Tạo Workspace'}</button>
              {selected && (
                <button
                  type="button"
                  className="refresh-button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    if (workspace) {
                      setName(workspace.name);
                      setDescription(workspace.description);
                    }
                  }}
                >
                  Hủy
                </button>
              )}
            </div>
          </fieldset>
        </form>
      )}
      {workspace && membersOpen && (
        <div className="members-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0 }}>Thành viên</h2>
            <button type="button" className="refresh-button" onClick={() => setMembersOpen(false)} style={{ padding: '3px 8px', fontSize: '11px' }}>
              ✕ Đóng
            </button>
          </div>
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
                <button className="primary-button" disabled={busy} aria-label="Thêm thành viên">Gửi lời mời</button>
              </div>
              <p className="field-help">Người nhận sẽ nhận được thông báo/email và có thể chọn Chấp nhận hoặc Từ chối trước khi chính thức vào Workspace.</p>
            </form>
          )}
          {owner && !isClosed && (
            <div style={{ marginTop: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '8px' }}>Lời mời đang chờ phản hồi ({pendingInvites.length})</h3>
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
          <h3 style={{ fontSize: '1.05rem', marginBottom: '8px' }}>Thành viên chính thức ({members.length})</h3>
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
        </div>
      )}
    </>}
    </>}
    {projectOpen && loading && !workspace && <p role="status">Đang tải Workspace…</p>}
    {workspace && <Projects key={workspace.id} workspaceId={workspace.id} owner={owner && !isClosed} initialId={workspace.id === initialId ? initialProjectId : undefined} onExpired={onExpired} onProjectChange={onProjectChange} onTaskChange={onTaskChange} taskOpen={taskOpen} userId={userId} />}
  </section>;
}
