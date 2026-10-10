import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, workspaceApi, type Project, type ProjectMember, type ProjectInput, type WorkspaceMember } from '../api';
import { Tasks } from './Tasks';

const empty: ProjectInput = { name: '', description: '', startDate: null, endDate: null };
export function Projects({ workspaceId, owner, initialId, onExpired }: { workspaceId: string; owner: boolean; initialId?: string; onExpired: () => void }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [candidates, setCandidates] = useState<WorkspaceMember[]>([]);
  const [input, setInput] = useState<ProjectInput>(empty);
  const [candidateId, setCandidateId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ kind: 'manager' | 'close' | 'remove'; userId?: string; name: string } | null>(null);
  function failed(failure: unknown) { if (failure instanceof ApiError && failure.status === 401) onExpired(); else setError(failure instanceof Error ? failure.message : 'Không thể xử lý Project.'); }
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setProject(null); setMembers([]); setCandidates([]); setPending(null); setCandidateId(''); setMemberId('');
    const load = selected ? Promise.all([projectApi.detail(selected), projectApi.members(selected), workspaceApi.members(workspaceId)]).then(([detail, membership, workspace]) => {
      if (active) { setProject(detail.project); setMembers(membership.members); setCandidates(workspace.members.filter((member) => member.user.status === 'ACTIVE')); setInput({ name: detail.project.name, description: detail.project.description, startDate: detail.project.startDate?.slice(0, 10) ?? null, endDate: detail.project.endDate?.slice(0, 10) ?? null }); }
    }) : projectApi.list(workspaceId).then((result) => { if (active) { setProjects(result.projects); setInput(empty); } });
    load.catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId, selected, attempt]);
  async function mutate(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setPending(null); setAttempt((value) => value + 1); }
    catch (failure) { failed(failure); if (failure instanceof ApiError && failure.status === 403) { setProject(null); setMembers([]); setPending(null); } }
    finally { setBusy(false); }
  }
  function save(event: FormEvent) { event.preventDefault(); void mutate(async () => {
    if (selected) { await projectApi.update(selected, input); setNotice('Đã cập nhật Project.'); }
    else { const result = await projectApi.create(workspaceId, input); setSelected(result.project.id); setNotice('Đã tạo Project. Hãy phân công PM để quản lý dự án.'); }
  }); }
  const editable = project?.status === 'ACTIVE';
  const manager = project?.isManager;
  return <section className="projects-panel" aria-busy={loading || busy}><div className="panel-heading"><div><span className="eyebrow">DỰ ÁN TRONG WORKSPACE</span><h2>{selected ? project?.name ?? 'Project' : 'Project'}</h2></div>{selected && <button className="refresh-button" disabled={busy} onClick={() => { setSelected(''); setNotice(''); }}>← Danh sách Project</button>}</div>
    {error && <div className="form-error" role="alert"><p>{error}</p><button className="refresh-button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Tải lại Project</button></div>}{notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải Project…</p> : <>
    {!selected && <><div className="workspace-grid">{projects.map((item) => <button className="workspace-card" key={item.id} onClick={() => { setSelected(item.id); setNotice(''); }}><strong>{item.name}</strong><p>{item.description || 'Chưa có mô tả.'}</p><span>{item.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã đóng'} · {item.memberCount} thành viên</span><p>PM: {item.manager?.displayName ?? 'Chưa phân công'}</p></button>)}</div>{!projects.length && !error && <p>{owner ? 'Workspace chưa có Project.' : 'Bạn chưa được thêm vào Project nào.'}</p>}</>}
    {project && <><p className="project-description">{project.description || 'Chưa có mô tả.'}</p><p>Trạng thái: <strong>{editable ? 'Đang hoạt động' : 'Đã đóng'}</strong> · PM: <strong>{project.manager?.displayName ?? 'Chưa phân công'}</strong></p><p>Thời gian: {project.startDate?.slice(0, 10) ?? 'Chưa đặt'} → {project.endDate?.slice(0, 10) ?? 'Chưa đặt'}</p>{!editable && <p className="form-notice">Project đã đóng và được giữ để xem lại. Không thể sửa thông tin hoặc thành viên.</p>}</>}
    {(!selected && owner || editable && manager) && <form className="account-form workspace-form" onSubmit={save}><h3>{selected ? 'Cập nhật Project' : 'Tạo Project'}</h3><fieldset disabled={busy}><div className="form-field"><label htmlFor="project-name">Tên Project</label><input id="project-name" required maxLength={100} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></div><div className="form-field"><label htmlFor="project-description">Mô tả</label><textarea id="project-description" rows={3} maxLength={2000} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} /></div><div className="project-dates"><div className="form-field"><label htmlFor="project-start">Ngày bắt đầu</label><input id="project-start" type="date" value={input.startDate ?? ''} onChange={(event) => setInput({ ...input, startDate: event.target.value || null })} /></div><div className="form-field"><label htmlFor="project-end">Ngày kết thúc</label><input id="project-end" type="date" min={input.startDate ?? undefined} value={input.endDate ?? ''} onChange={(event) => setInput({ ...input, endDate: event.target.value || null })} /></div></div><button className="primary-button">{busy ? 'Đang lưu…' : selected ? 'Lưu Project' : 'Tạo Project'}</button></fieldset></form>}
    {project?.isWorkspaceOwner && <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); const member = candidates.find((item) => item.userId === candidateId); if (member) setPending({ kind: 'manager', userId: member.userId, name: member.user.displayName }); }}><h3>Phân công Project Manager</h3><p className="field-help">PM được thêm vào Project. PM trước vẫn là thành viên nhưng mất quyền quản lý. Owner có thể chuyển giao PM cả khi Project đã đóng; nội dung vẫn được giữ đóng.</p><label htmlFor="manager-select">Chọn thành viên Workspace</label><div className="inline-fields"><select id="manager-select" required disabled={busy} value={candidateId} onChange={(event) => setCandidateId(event.target.value)}><option value="">Chọn PM</option>{candidates.filter((member) => member.userId !== project.managerUserId).map((member) => <option key={member.userId} value={member.userId}>{member.user.displayName} · {member.user.email}</option>)}</select><button className="primary-button" disabled={busy}>Phân công PM</button></div></form>}
    {project && <div className="members-panel"><h3>Thành viên Project</h3>{editable && manager && <form onSubmit={(event) => { event.preventDefault(); void mutate(async () => { await projectApi.add(selected, memberId); setNotice('Đã thêm thành viên Project.'); }); }}><label htmlFor="project-member">Thêm thành viên từ Workspace</label><div className="inline-fields"><select id="project-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} required disabled={busy}><option value="">Chọn thành viên</option>{candidates.filter((candidate) => !members.some((member) => member.userId === candidate.userId)).map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.user.displayName} · {candidate.user.email}</option>)}</select><button className="primary-button" disabled={busy}>Thêm vào Project</button></div></form>}<ul className="member-list">{members.map((member) => <li key={member.userId}><div><strong>{member.user.displayName}{member.userId === project.managerUserId ? ' · PM' : ''}</strong><span>{member.user.email}{member.user.status === 'LOCKED' ? ' · Đang bị khóa' : ''}</span></div>{editable && manager && member.userId !== project.managerUserId && <button className="danger-button" disabled={busy} onClick={() => setPending({ kind: 'remove', userId: member.userId, name: member.user.displayName })}>Xóa khỏi Project</button>}</li>)}</ul>{!members.length && <p>Chưa có thành viên. Owner cần phân công PM trước.</p>}</div>}
    {project && <Tasks key={project.id} projectId={project.id} canCreate={Boolean(editable && manager)} onExpired={onExpired} />}
    {editable && manager && <button className="danger-button" disabled={busy} onClick={() => setPending({ kind: 'close', name: project.name })}>Đóng Project</button>}
    {pending && <div className="confirm-panel" role="group" aria-label="Xác nhận thay đổi Project"><p>{pending.kind === 'manager' ? `Phân công ${pending.name} làm PM? ${project?.manager ? `${project.manager.displayName} sẽ mất quyền PM và vẫn là thành viên.` : 'Người được chọn sẽ có quyền quản lý Project.'}` : pending.kind === 'close' ? `Đóng Project “${pending.name}”? Project sẽ chuyển sang chỉ xem và không thể mở lại trong phiên bản này.` : `Xóa ${pending.name} khỏi Project? Người này sẽ mất quyền truy cập nếu không có quyền Workspace Owner.`}</p><button className="primary-button" disabled={busy} onClick={() => void mutate(async () => { if (pending.kind === 'manager') await projectApi.manager(selected, pending.userId!, project!.managerUserId); else if (pending.kind === 'close') await projectApi.close(selected); else await projectApi.remove(selected, pending.userId!); setNotice('Đã cập nhật Project.'); })}>Xác nhận</button> <button className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button></div>}
    </>}
  </section>;
}
