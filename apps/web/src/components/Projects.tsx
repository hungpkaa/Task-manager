import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, projectApi, workspaceApi, type Project, type ProjectMember, type ProjectInput, type WorkspaceMember } from '../api';
import { Tasks } from './Tasks';
import { Sprints } from './Sprints';
import { Workload } from './Workload';
import { Calendar } from './Calendar';
import { Dashboard } from './Dashboard';
import { DatePicker } from './DatePicker';
import { StyledSelect } from './StyledSelect';
import { Icon } from './Icon';

const empty: ProjectInput = { name: '', description: '', startDate: null, endDate: null };
export type ProjectView = 'overview' | 'members' | 'tasks' | 'sprints' | 'workload' | 'calendar' | 'dashboard';
const projectViews: { id: ProjectView; label: string; icon: 'overview' | 'members' | 'task' | 'board' | 'chart' | 'calendar' }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'overview' }, { id: 'members', label: 'Thành viên', icon: 'members' }, { id: 'tasks', label: 'Công việc', icon: 'task' },
  { id: 'sprints', label: 'Sprint & Backlog', icon: 'board' }, { id: 'workload', label: 'Capacity & Workload', icon: 'chart' }, { id: 'calendar', label: 'Calendar', icon: 'calendar' }, { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
];
export function Projects({ workspaceId, owner, initialId, onExpired, onSelected, activeView = 'overview', onViewChange }: { workspaceId: string; owner: boolean; initialId?: string; onExpired: () => void; onSelected?: (id: string | undefined) => void; activeView?: ProjectView; onViewChange?: (view: ProjectView) => void }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const previousSelected = useRef(selected);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [candidates, setCandidates] = useState<WorkspaceMember[]>([]);
  const [input, setInput] = useState<ProjectInput>(empty);
  const [creatingProject, setCreatingProject] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [taskListRevision, setTaskListRevision] = useState(0);
  const [pending, setPending] = useState<{ kind: 'manager' | 'close' | 'remove'; userId?: string; name: string } | null>(null);
  useEffect(() => {
    onSelected?.(selected || undefined);
    if (previousSelected.current !== selected) {
      previousSelected.current = selected;
      onViewChange?.('overview');
    }
  }, [selected, onSelected, onViewChange]);
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
    else { const result = await projectApi.create(workspaceId, input); setCreatingProject(false); setSelected(result.project.id); setNotice('Đã tạo Project. Hãy phân công PM để quản lý dự án.'); }
  }); }
  const editable = project?.status === 'ACTIVE';
  const manager = project?.isManager;
  return <section id="workspace-projects" className={`projects-panel${selected ? ` is-detail project-view-${activeView}` : ''}`} aria-busy={loading || busy}><div className="panel-heading"><div><span className="eyebrow">DỰ ÁN TRONG WORKSPACE</span><h2>{selected ? project?.name ?? 'Project' : 'Project'}</h2></div><div className="member-actions">{!selected && owner && !creatingProject && <button type="button" className="primary-button" disabled={busy} onClick={() => { setCreatingProject(true); setInput(empty); }}>+ Tạo Project</button>}{selected && <button className="refresh-button" disabled={busy} onClick={() => { setSelected(''); setNotice(''); }}>← Danh sách Project</button>}</div></div>
    {selected && <nav className="project-page-nav" aria-label="Các mục Project" role="tablist">{projectViews.map((view) => <button key={view.id} type="button" role="tab" aria-selected={activeView === view.id} className={activeView === view.id ? 'is-active' : ''} onClick={() => onViewChange?.(view.id)}><Icon name={view.icon} /><span>{view.label}</span></button>)}</nav>}
    {error && <div className="form-error" role="alert"><p>{error}</p><button className="refresh-button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Tải lại Project</button></div>}{notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải Project…</p> : <>
    {!selected && <><div className="workspace-grid project-list-grid">{projects.map((item) => <button className="workspace-card project-list-card" key={item.id} onClick={() => { setSelected(item.id); setNotice(''); }}><span className="project-list-card-heading"><strong>{item.name}</strong><span className={`project-list-status${item.status === 'ACTIVE' ? '' : ' is-closed'}`}>{item.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã đóng'}</span></span><p>{item.description || 'Chưa có mô tả.'}</p><span className="project-list-card-footer"><span>{item.memberCount} thành viên</span><span>PM: {item.manager?.displayName ?? 'Chưa phân công'}</span></span></button>)}</div>{!projects.length && !error && <p>{owner ? 'Workspace chưa có Project.' : 'Bạn chưa được thêm vào Project nào.'}</p>}</>}
    {project && activeView === 'overview' && <div className="project-overview-card" id="project-overview"><span className="project-symbol" aria-hidden="true">{project.name.trim().slice(0, 1).toLocaleUpperCase('vi-VN') || 'P'}</span><div className="project-overview-copy"><span className="eyebrow">TỔNG QUAN PROJECT</span><p className="project-description">{project.description || 'Chưa có mô tả cho dự án này.'}</p><div className="project-meta"><span className={`project-status-chip${editable ? '' : ' is-closed'}`}><i />{editable ? 'Đang hoạt động' : 'Đã đóng'}</span><span className="project-manager-chip">PM: <strong>{project.manager?.displayName ?? 'Chưa phân công'}</strong></span><span className="project-date-chip">{project.startDate?.slice(0, 10) ?? 'Chưa đặt'} → {project.endDate?.slice(0, 10) ?? 'Chưa đặt'}</span></div></div></div>}
    {project && activeView === 'overview' && !editable && <p className="form-notice project-closed-notice">Project đã đóng và được giữ để xem lại. Không thể sửa thông tin hoặc thành viên.</p>}
    {activeView === 'overview' && ((!selected && owner && creatingProject) || (editable && manager)) && <form className="account-form workspace-form project-edit-form" onSubmit={save}><div className="project-form-title"><h3>{selected ? 'Cập nhật Project' : 'Tạo Project'}</h3>{!selected && <button type="button" className="refresh-button" disabled={busy} onClick={() => { setCreatingProject(false); setInput(empty); }}>Hủy</button>}</div><fieldset disabled={busy}><div className="form-field"><label htmlFor="project-name">Tên Project</label><input id="project-name" required maxLength={100} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></div><div className="form-field"><label htmlFor="project-description">Mô tả</label><textarea id="project-description" rows={3} maxLength={2000} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} /></div><div className="project-dates"><DatePicker id="project-start" label="Ngày bắt đầu" value={input.startDate ?? ''} disabled={busy} onChange={(startDate) => setInput({ ...input, startDate: startDate || null })} /><DatePicker id="project-end" label="Ngày kết thúc" value={input.endDate ?? ''} min={input.startDate ?? undefined} disabled={busy} onChange={(endDate) => setInput({ ...input, endDate: endDate || null })} /></div><button className="primary-button">{busy ? 'Đang lưu…' : selected ? 'Lưu Project' : 'Tạo Project'}</button></fieldset></form>}
    {activeView === 'overview' && project?.isWorkspaceOwner && <form className="workspace-form project-manager-form" onSubmit={(event) => {
      event.preventDefault();
      const member = candidates.find((item) => item.userId === candidateId);
      if (!member) return;
      if (!project.managerUserId) {
        void mutate(async () => {
          await projectApi.manager(selected, member.userId, null);
          setNotice(`Đã phân công ${member.user.displayName} làm Project Manager.`);
          setCandidateId('');
        });
      } else {
        setPending({ kind: 'manager', userId: member.userId, name: member.user.displayName });
      }
    }}>
      <h3>Phân công Project Manager</h3>
      <p className="field-help">PM được thêm vào Project. PM trước vẫn là thành viên nhưng mất quyền quản lý. Owner có thể chuyển giao PM cả khi Project đã đóng; nội dung vẫn được giữ đóng.</p>
      <label htmlFor="manager-select">Chọn thành viên Workspace</label>
      <div className="inline-fields">
        <StyledSelect id="manager-select" required disabled={busy} value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
          <option value="">Chọn PM</option>
          {candidates.filter((member) => member.userId !== project.managerUserId).map((member) => <option key={member.userId} value={member.userId}>{member.user.displayName} · {member.user.email}</option>)}
        </StyledSelect>
        <button className="primary-button" disabled={busy || !candidateId}>{busy && pending?.kind === 'manager' ? 'Đang lưu…' : 'Phân công PM'}</button>
      </div>
      {pending?.kind === 'manager' && <div className="confirm-panel" style={{ marginTop: '14px' }} role="group" aria-label="Xác nhận thay đổi PM">
        <p>Thay thế <strong>{project.manager?.displayName ?? 'PM hiện tại'}</strong> bằng <strong>{pending.name}</strong>? PM cũ sẽ mất quyền quản lý và vẫn là thành viên Project.</p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void mutate(async () => {
            await projectApi.manager(selected, pending.userId!, project.managerUserId);
            setNotice(`Đã chuyển giao vai trò PM cho ${pending.name}.`);
            setCandidateId('');
          })}>{busy ? 'Đang lưu…' : 'Xác nhận thay thế PM'}</button>
          <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button>
        </div>
      </div>}
    </form>}
    {project && activeView === 'members' && <div className="members-panel project-members-panel" id="project-members"><div className="members-panel-heading"><div><span className="eyebrow">NHÓM DỰ ÁN</span><h2>Thành viên Project <span className="members-count">{members.length}</span></h2></div></div>{editable && manager && <form className="project-add-member-form" onSubmit={(event) => { event.preventDefault(); void mutate(async () => { await projectApi.add(selected, memberId); setNotice('Đã thêm thành viên Project.'); setMemberId(''); }); }}><label htmlFor="project-member">Thêm thành viên từ Workspace</label><div className="inline-fields"><StyledSelect id="project-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} required disabled={busy}><option value="">Chọn thành viên</option>{candidates.filter((candidate) => !members.some((member) => member.userId === candidate.userId)).map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.user.displayName} · {candidate.user.email}</option>)}</StyledSelect><button className="primary-button" disabled={busy || !memberId}>Thêm vào Project</button></div></form>}<ul className="member-list">{members.map((member) => <li key={member.userId}><div><strong>{member.user.displayName}{member.userId === project.managerUserId ? ' · PM' : ''}</strong><span>{member.user.email}{member.user.status === 'LOCKED' ? ' · Đang bị khóa' : ''}</span></div>{editable && manager && member.userId !== project.managerUserId && <button className="danger-button" disabled={busy} onClick={() => setPending({ kind: 'remove', userId: member.userId, name: member.user.displayName })}>Xóa khỏi Project</button>}</li>)}</ul>{!members.length && <p>Chưa có thành viên. Owner cần phân công PM trước.</p>}
      {pending?.kind === 'remove' && <div className="confirm-panel" style={{ marginTop: '14px' }} role="group" aria-label="Xác nhận xóa thành viên">
        <p>Xóa <strong>{pending.name}</strong> khỏi Project? Người này sẽ mất quyền truy cập nếu không có quyền Workspace Owner.</p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button type="button" className="danger-button" disabled={busy} onClick={() => void mutate(async () => {
            await projectApi.remove(selected, pending.userId!);
            setNotice(`Đã xóa ${pending.name} khỏi Project.`);
          })}>{busy ? 'Đang xóa…' : 'Xác nhận xóa'}</button>
          <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button>
        </div>
      </div>}
    </div>}
    {project && activeView === 'tasks' && <div id="project-tasks"><Tasks key={`${project.id}-${taskListRevision}`} projectId={project.id} projectDates={{ startDate: project.startDate?.slice(0, 10) ?? null, endDate: project.endDate?.slice(0, 10) ?? null }} canCreate={Boolean(editable && manager)} onExpired={onExpired} onBack={() => setTaskListRevision((revision) => revision + 1)} /></div>}
    {project && activeView === 'sprints' && <div id="project-sprints"><Sprints key={`sprints-${project.id}`} projectId={project.id} canPlan={Boolean(editable && manager)} onExpired={onExpired} /></div>}
    {project?.isManager && activeView === 'workload' && <div id="project-workload"><Workload key={`workload-${project.id}`} projectId={project.id} onExpired={onExpired} /></div>}
    {project && activeView === 'calendar' && <div id="project-calendar"><Calendar key={`calendar-${project.id}`} projectId={project.id} onExpired={onExpired} /></div>}
    {project?.isManager && activeView === 'dashboard' && <div id="project-dashboard"><Dashboard key={`dashboard-${project.id}`} projectId={project.id} onExpired={onExpired} /></div>}
    {activeView === 'overview' && editable && manager && <div id="project-lifecycle">
      <button className="danger-button" disabled={busy} onClick={() => setPending({ kind: 'close', name: project.name })}>Đóng Project</button>
      {pending?.kind === 'close' && <div className="confirm-panel" style={{ marginTop: '14px' }} role="group" aria-label="Xác nhận đóng Project">
        <p>Đóng Project “<strong>{pending.name}</strong>”? Project sẽ chuyển sang chỉ xem và không thể mở lại trong phiên bản này.</p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button type="button" className="danger-button" disabled={busy} onClick={() => void mutate(async () => {
            await projectApi.close(selected);
            setNotice('Đã đóng Project.');
          })}>{busy ? 'Đang đóng…' : 'Xác nhận đóng Project'}</button>
          <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>Hủy</button>
        </div>
      </div>}
    </div>}
    </>}
  </section>;
}
