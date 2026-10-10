import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, workspaceApi, type Workspace, type WorkspaceMember } from '../api';
import { Projects } from './Projects';

export function Workspaces({ userId, initialId, initialProjectId, onExpired }: { userId: string; initialId?: string; initialProjectId?: string; onExpired: () => void }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const [items, setItems] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ member: WorkspaceMember; role?: WorkspaceMember['role'] } | null>(null);

  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không thể xử lý yêu cầu.');
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setWorkspace(null); setMembers([]); setPending(null);
    const load = selected
      ? Promise.all([workspaceApi.detail(selected), workspaceApi.members(selected)]).then(([detail, result]) => {
        if (active) { setWorkspace(detail.workspace); setMembers(result.members); setName(detail.workspace.name); setDescription(detail.workspace.description); }
      })
      : workspaceApi.list().then((result) => { if (active) { setItems(result.workspaces); setName(''); setDescription(''); } });
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
        setWorkspace(null); setMembers([]);
      }
    } finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void mutate(async () => {
      if (selected) { await workspaceApi.update(selected, { name, description }); setNotice('Đã cập nhật Workspace.'); }
      else { const result = await workspaceApi.create({ name, description }); setSelected(result.workspace.id); setNotice('Đã tạo Workspace. Bạn là Owner của không gian này.'); }
    });
  }
  const owner = workspace?.myRole === 'OWNER';
  const ownerCount = members.filter((member) => member.role === 'OWNER').length;
  return <section className="workspace-panel" aria-busy={loading || busy}>
    <div className="panel-heading"><div><span className="eyebrow">KHÔNG GIAN CỦA NHÓM</span><h1>{selected ? workspace?.name ?? 'Workspace' : 'Workspace của bạn'}</h1></div>{selected && <button className="refresh-button" disabled={busy} onClick={() => { setSelected(''); setNotice(''); }}>← Danh sách</button>}</div>
    {error && <div role="alert" className="form-error"><p>{error}</p><button className="refresh-button" onClick={() => setAttempt((value) => value + 1)} disabled={busy}>Thử lại</button></div>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải Workspace…</p> : <>
      {!selected && <><p className="intro">Các không gian bạn đang tham gia. Tạo một không gian mới để kết nối nhóm.</p><div className="workspace-grid">{items.map((item) => <button className="workspace-card" key={item.id} onClick={() => { setSelected(item.id); setNotice(''); }}><strong>{item.name}</strong><p>{item.description || 'Chưa có mô tả.'}</p><span>{item.myRole === 'OWNER' ? 'Owner' : 'Member'} · {item.memberCount} thành viên</span></button>)}</div>{items.length === 0 && !error && <p>Bạn chưa tham gia Workspace nào.</p>}</>}
      {workspace && <><p className="intro">{workspace.description || 'Chưa có mô tả.'}</p><p>Vai trò của bạn: <strong>{owner ? 'Owner' : 'Member'}</strong> · {members.length} thành viên</p></>}
      {(!selected || owner) && <form className="account-form workspace-form" onSubmit={save}><h2>{selected ? 'Thông tin Workspace' : 'Tạo Workspace'}</h2><fieldset disabled={busy}><div className="form-field"><label htmlFor="workspace-name">Tên Workspace</label><input id="workspace-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-field"><label htmlFor="workspace-description">Mô tả</label><textarea id="workspace-description" maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></div><button className="primary-button">{busy ? 'Đang xử lý…' : selected ? 'Lưu thay đổi' : 'Tạo Workspace'}</button></fieldset></form>}
      {workspace && <div className="members-panel"><h2>Thành viên</h2>{owner && <form className="invite-form" onSubmit={(event) => { event.preventDefault(); void mutate(async () => { await workspaceApi.invite(selected, email); setEmail(''); setNotice('Đã thêm thành viên và gửi thông báo trong ứng dụng.'); }); }}><label htmlFor="invite-email">Mời bằng email đã đăng ký</label><div className="inline-fields"><input id="invite-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /><button className="primary-button" disabled={busy}>Thêm thành viên</button></div><p className="field-help">Tài khoản đang hoạt động sẽ được thêm trực tiếp với vai trò Member.</p></form>}
      <ul className="member-list">{members.map((member) => { const lastOwner = member.role === 'OWNER' && ownerCount === 1; return <li key={member.userId}><div><strong>{member.user.displayName}{member.userId === userId ? ' (bạn)' : ''}</strong><span>{member.user.email} · {member.role === 'OWNER' ? 'Owner' : 'Member'}{member.user.status === 'LOCKED' ? ' · Đang bị khóa' : ''}</span>{owner && lastOwner && <small>Owner cuối cùng: hãy cấp quyền Owner cho thành viên khác trước.</small>}</div>{owner && <div className="member-actions"><button className="refresh-button" disabled={busy || lastOwner} onClick={() => setPending({ member, role: member.role === 'OWNER' ? 'MEMBER' : 'OWNER' })}>{member.role === 'OWNER' ? 'Đổi thành Member' : 'Cấp quyền Owner'}</button><button className="danger-button" disabled={busy || lastOwner} onClick={() => setPending({ member })}>Xóa khỏi nhóm</button></div>}</li>; })}</ul>
      {pending && <div className="confirm-panel" role="group" aria-label="Xác nhận thay đổi thành viên"><p>{pending.role ? `Đổi vai trò của ${pending.member.user.displayName} thành ${pending.role === 'OWNER' ? 'Owner' : 'Member'}? Owner có thể sửa Workspace và quản lý thành viên.` : `Xóa ${pending.member.user.displayName} khỏi Workspace? Người này sẽ mất quyền truy cập không gian.`}</p><button className="primary-button" disabled={busy} onClick={() => void mutate(async () => { if (pending.role) await workspaceApi.role(selected, pending.member.userId, pending.role); else await workspaceApi.remove(selected, pending.member.userId); if (!pending.role && pending.member.userId === userId) setSelected(''); setNotice('Đã cập nhật thành viên.'); })}>Xác nhận</button> <button className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></div>}
      </div>}
      {workspace && <Projects key={workspace.id} workspaceId={workspace.id} owner={owner} initialId={workspace.id === initialId ? initialProjectId : undefined} onExpired={onExpired} />}
    </>}
  </section>;
}
