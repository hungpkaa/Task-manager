import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, projectApi, workspaceApi, type Project, type ProjectMember, type ProjectInput, type WorkspaceMember } from '../api';
import { Tasks } from './Tasks';
import { Sprints } from './Sprints';
import { Workload } from './Workload';
import { Dashboard } from './Dashboard';
import { FloatingRecommendations } from './FloatingRecommendations';

const empty: ProjectInput = { name: '', description: '', startDate: null, endDate: null };

export function Projects({ workspaceId, owner, initialId, onExpired, onProjectChange, onTaskChange, taskOpen, userId }: { workspaceId: string; owner: boolean; initialId?: string; onExpired: () => void; onProjectChange?: (data: { id: string; name: string } | null) => void; onTaskChange?: (name: string | null) => void; taskOpen?: boolean; userId?: string }) {
  const [selected, setSelected] = useState(initialId ?? '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [candidates, setCandidates] = useState<WorkspaceMember[]>([]);
  const [input, setInput] = useState<ProjectInput>(empty);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assigningPM, setAssigningPM] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [pending, setPending] = useState<{ kind: 'manager' | 'close' | 'remove'; userId?: string; name: string } | null>(null);

  function handleTaskChange(name: string | null) {
    if (!name) setSelectedTaskId('');
    onTaskChange?.(name);
  }

  function failed(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(failure instanceof Error ? failure.message : 'Không thể xử lý Project.');
  }

  useEffect(() => {
    if (initialId !== undefined && initialId !== selected) {
      setSelected(initialId);
    }
  }, [initialId]);

  useEffect(() => {
    let active = true;
    if (!project) setLoading(true);
    setError(''); setPending(null); setCandidateId(''); setMemberId('');
    if (!selected) {
      setProject(null); setMembers([]); setCandidates([]); setEditing(false); setCreating(false); setAssigningPM(false); setMembersOpen(false);
    }
    const load = selected ? Promise.all([projectApi.detail(selected), projectApi.members(selected), workspaceApi.members(workspaceId)]).then(([detail, membership, workspace]) => {
      if (active) {
        setProject(detail.project);
        setMembers(membership.members);
        setCandidates(workspace.members.filter((member) => member.user.status === 'ACTIVE'));
        setInput({
          name: detail.project.name,
          description: detail.project.description,
          startDate: detail.project.startDate?.slice(0, 10) ?? null,
          endDate: detail.project.endDate?.slice(0, 10) ?? null,
        });
        onProjectChange?.({ id: selected, name: detail.project.name });
      }
    }) : projectApi.list(workspaceId).then((result) => {
      if (active) {
        setProjects(result.projects);
        setInput(empty);
      }
    });
    load.catch((failure: unknown) => { if (active) failed(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId, selected, attempt]);

  async function mutate(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setPending(null); setAttempt((value) => value + 1); }
    catch (failure) { failed(failure); if (failure instanceof ApiError && failure.status === 403) { setProject(null); setMembers([]); setPending(null); } }
    finally { setBusy(false); }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void mutate(async () => {
      if (selected) {
        const result = await projectApi.update(selected, input);
        setProject(result.project);
        setEditing(false);
        onProjectChange?.({ id: selected, name: result.project.name });
        setNotice('Đã cập nhật Project.');
      } else {
        const result = await projectApi.create(workspaceId, input);
        setSelected(result.project.id);
        setProject(result.project);
        setCreating(false);
        onProjectChange?.({ id: result.project.id, name: result.project.name });
        setNotice('Đã tạo Project. Hãy phân công PM để quản lý dự án.');
      }
    });
  }

  const editable = project?.status === 'ACTIVE';
  const manager = project?.isManager;

  return (
    <section className="projects-panel" aria-busy={loading || busy}>
      {error && <div className="form-error" role="alert"><p>{error}</p><button className="refresh-button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Tải lại Project</button></div>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {!taskOpen && (
        <>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DỰ ÁN TRONG WORKSPACE</span>
              <h2>{selected ? project?.name ?? 'Project' : 'Project'}</h2>
            </div>
            <div className="member-actions">
              {!selected && owner && (
                <button
                  type="button"
                  className={creating ? 'refresh-button' : 'primary-button'}
                  disabled={busy}
                  onClick={() => {
                    setCreating(!creating);
                    setInput(empty);
                    setNotice('');
                  }}
                >
                  {creating ? '✕ Đóng' : '+ Tạo Project'}
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  className={membersOpen ? 'primary-button' : 'refresh-button'}
                  disabled={busy}
                  onClick={() => setMembersOpen(!membersOpen)}
                  title="Xem và quản lý thành viên Project"
                >
                  👥 {membersOpen ? 'Đóng thành viên' : `Thành viên (${members.length})`}
                </button>
              )}
              {selected && project?.isWorkspaceOwner && (
                <button
                  type="button"
                  className={assigningPM ? 'primary-button' : 'refresh-button'}
                  disabled={busy}
                  onClick={() => setAssigningPM(!assigningPM)}
                  title="Phân công Project Manager"
                >
                  👤 {assigningPM ? 'Đóng phân công PM' : 'Phân công PM'}
                </button>
              )}
              {selected && editable && manager && (
                <button
                  type="button"
                  className={editing ? 'refresh-button' : 'primary-button'}
                  disabled={busy}
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? 'Đóng chỉnh sửa' : '✏️ Sửa Project'}
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  className="refresh-button"
                  disabled={busy}
                  onClick={() => {
                    setSelected('');
                    setEditing(false);
                    setCreating(false);
                    setAssigningPM(false);
                    setMembersOpen(false);
                    setNotice('');
                    onProjectChange?.(null);
                    onTaskChange?.(null);
                  }}
                >
                  ← Danh sách Project
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <p role="status">Đang tải Project…</p>
          ) : (
            <>
              {!selected && (
                <>
                  {creating && owner && (
                    <form className="account-form workspace-form" onSubmit={save} style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3>Tạo Project</h3>
                        <button
                          type="button"
                          className="refresh-button"
                          onClick={() => {
                            setCreating(false);
                            setInput(empty);
                          }}
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                        >
                          ✕ Đóng
                        </button>
                      </div>
                      <fieldset disabled={busy}>
                        <div className="form-field">
                          <label htmlFor="project-name">Tên Project</label>
                          <input id="project-name" required maxLength={100} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} />
                        </div>
                        <div className="form-field">
                          <label htmlFor="project-description">Mô tả</label>
                          <textarea id="project-description" rows={3} maxLength={2000} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} />
                        </div>
                        <div className="project-dates">
                          <div className="form-field">
                            <label htmlFor="project-start">Ngày bắt đầu</label>
                            <input id="project-start" type="date" value={input.startDate ?? ''} onChange={(event) => setInput({ ...input, startDate: event.target.value || null })} />
                          </div>
                          <div className="form-field">
                            <label htmlFor="project-end">Ngày kết thúc</label>
                            <input id="project-end" type="date" min={input.startDate ?? undefined} value={input.endDate ?? ''} onChange={(event) => setInput({ ...input, endDate: event.target.value || null })} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="primary-button">{busy ? 'Đang lưu…' : 'Tạo Project'}</button>
                          <button
                            type="button"
                            className="refresh-button"
                            disabled={busy}
                            onClick={() => {
                              setCreating(false);
                              setInput(empty);
                            }}
                          >
                            Hủy
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  )}

                  <div className="workspace-grid">
                    {projects.map((item) => (
                      <button className="workspace-card" key={item.id} onClick={() => { setSelected(item.id); setCreating(false); setAssigningPM(false); setMembersOpen(false); setNotice(''); }}>
                        <strong>{item.name}</strong>
                        <p>{item.description || 'Chưa có mô tả.'}</p>
                        <span>{item.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã đóng'} · {item.memberCount} thành viên</span>
                        <p>PM: {item.manager?.displayName ?? 'Chưa phân công'}</p>
                      </button>
                    ))}
                  </div>
                  {!projects.length && !error && <p>{owner ? 'Workspace chưa có Project. Hãy bấm "+ Tạo Project" ở góc trên để tạo dự án đầu tiên.' : 'Bạn chưa được thêm vào Project nào.'}</p>}
                </>
              )}

              {project && (
                <>
                  <p className="project-description">{project.description || 'Chưa có mô tả.'}</p>
                  <p>Trạng thái: <strong>{editable ? 'Đang hoạt động' : 'Đã đóng'}</strong> · PM: <strong>{project.manager?.displayName ?? 'Chưa phân công'}</strong></p>
                  <p>Thời gian: {project.startDate?.slice(0, 10) ?? 'Chưa đặt'} → {project.endDate?.slice(0, 10) ?? 'Chưa đặt'}</p>
                  {!editable && <p className="form-notice">Project đã đóng và được giữ để xem lại. Không thể sửa thông tin hoặc thành viên.</p>}
                </>
              )}

              {selected && editable && manager && editing && (
                <form className="account-form workspace-form" onSubmit={save}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3>Cập nhật Project</h3>
                    <button type="button" className="refresh-button" onClick={() => setEditing(false)} style={{ padding: '3px 8px', fontSize: '11px' }}>
                      ✕ Đóng
                    </button>
                  </div>
                  <fieldset disabled={busy}>
                    <div className="form-field">
                      <label htmlFor="project-name">Tên Project</label>
                      <input id="project-name" required maxLength={100} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} />
                    </div>
                    <div className="form-field">
                      <label htmlFor="project-description">Mô tả</label>
                      <textarea id="project-description" rows={3} maxLength={2000} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} />
                    </div>
                    <div className="project-dates">
                      <div className="form-field">
                        <label htmlFor="project-start">Ngày bắt đầu</label>
                        <input id="project-start" type="date" value={input.startDate ?? ''} onChange={(event) => setInput({ ...input, startDate: event.target.value || null })} />
                      </div>
                      <div className="form-field">
                        <label htmlFor="project-end">Ngày kết thúc</label>
                        <input id="project-end" type="date" min={input.startDate ?? undefined} value={input.endDate ?? ''} onChange={(event) => setInput({ ...input, endDate: event.target.value || null })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="primary-button">{busy ? 'Đang lưu…' : 'Lưu Project'}</button>
                      <button
                        type="button"
                        className="refresh-button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(false);
                          if (project) {
                            setInput({
                              name: project.name,
                              description: project.description,
                              startDate: project.startDate ? project.startDate.slice(0, 10) : null,
                              endDate: project.endDate ? project.endDate.slice(0, 10) : null,
                            });
                          }
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}

              {selected && project?.isWorkspaceOwner && assigningPM && (
                <form
                  className="workspace-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const member = candidates.find((item) => item.userId === candidateId);
                    if (!member) return;
                    setPending({ kind: 'manager', userId: member.userId, name: member.user.displayName });
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0 }}>Phân công Project Manager</h3>
                    <button type="button" className="refresh-button" onClick={() => setAssigningPM(false)} style={{ padding: '3px 8px', fontSize: '11px' }}>
                      ✕ Đóng
                    </button>
                  </div>
                  <p className="field-help">PM được thêm vào Project. PM trước vẫn là thành viên nhưng mất quyền quản lý. Owner có thể chuyển giao PM cả khi Project đã đóng; nội dung vẫn được giữ đóng.</p>
                  <label htmlFor="manager-select">Chọn thành viên Workspace</label>
                  <div className="inline-fields">
                    <select id="manager-select" required disabled={busy} value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
                      <option value="">Chọn PM</option>
                      {candidates.filter((member) => member.userId !== project.managerUserId).map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.user.displayName} · {member.user.email}
                        </option>
                      ))}
                    </select>
                    <button className="primary-button" disabled={busy || !candidateId}>
                      {busy && pending?.kind === 'manager' ? 'Đang lưu…' : 'Phân công PM'}
                    </button>
                  </div>
                  {pending?.kind === 'manager' && (
                    <div className="confirm-panel" style={{ marginTop: '14px' }} role="group" aria-label="Xác nhận thay đổi Project">
                      <p>
                        {project.managerUserId
                          ? `Thay thế ${project.manager?.displayName ?? 'PM hiện tại'} bằng ${pending.name}? PM cũ sẽ mất quyền quản lý và vẫn là thành viên Project.`
                          : `Phân công ${pending.name} làm PM? Người được chọn sẽ có quyền quản lý Project.`}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={busy}
                          onClick={() => void mutate(async () => {
                            await projectApi.manager(selected, pending.userId!, project.managerUserId);
                            setNotice(`Đã chuyển giao vai trò PM cho ${pending.name}.`);
                            setCandidateId('');
                            setAssigningPM(false);
                          })}
                        >
                          {busy ? 'Đang lưu…' : 'Xác nhận'}
                        </button>
                        <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {project && membersOpen && (
                <div className="members-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0 }}>Thành viên Project ({members.length})</h3>
                    <button type="button" className="refresh-button" onClick={() => setMembersOpen(false)} style={{ padding: '3px 8px', fontSize: '11px' }}>
                      ✕ Đóng
                    </button>
                  </div>
                  {editable && manager && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void mutate(async () => {
                          await projectApi.add(selected, memberId);
                          setNotice('Đã thêm thành viên Project.');
                          setMemberId('');
                        });
                      }}
                    >
                      <label htmlFor="project-member">Thêm thành viên từ Workspace</label>
                      <div className="inline-fields">
                        <select id="project-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} required disabled={busy}>
                          <option value="">Chọn thành viên</option>
                          {candidates.filter((candidate) => !members.some((member) => member.userId === candidate.userId)).map((candidate) => (
                            <option key={candidate.userId} value={candidate.userId}>
                              {candidate.user.displayName} · {candidate.user.email}
                            </option>
                          ))}
                        </select>
                        <button className="primary-button" disabled={busy || !memberId}>
                          Thêm vào Project
                        </button>
                      </div>
                    </form>
                  )}
                  <ul className="member-list">
                    {members.map((member) => (
                      <li key={member.userId}>
                        <div>
                          <strong>{member.user.displayName}{member.userId === project.managerUserId ? ' · PM' : ''}</strong>
                          <span>{member.user.email}{member.user.status === 'LOCKED' ? ' · Đang bị khóa' : ''}</span>
                        </div>
                        {editable && manager && member.userId !== project.managerUserId && (
                          <button className="danger-button" disabled={busy} onClick={() => setPending({ kind: 'remove', userId: member.userId, name: member.user.displayName })}>
                            Xóa khỏi Project
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!members.length && <p>Chưa có thành viên. Owner cần phân công PM trước.</p>}
                  {pending?.kind === 'remove' && (
                    <div className="confirm-panel" style={{ marginTop: '14px' }} role="group" aria-label="Xác nhận thay đổi Project">
                      <p>Xóa <strong>{pending.name}</strong> khỏi Project? Người này sẽ mất quyền truy cập nếu không có quyền Workspace Owner.</p>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={busy}
                          onClick={() => void mutate(async () => {
                            await projectApi.remove(selected, pending.userId!);
                            setNotice(`Đã xóa ${pending.name} khỏi Project.`);
                          })}
                        >
                          {busy ? 'Đang xóa…' : 'Xác nhận'}
                        </button>
                        <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {project && (
        <Tasks
          key={`${project.id}-${selectedTaskId}`}
          projectId={project.id}
          initialId={selectedTaskId || undefined}
          projectDates={{ startDate: project.startDate?.slice(0, 10) ?? null, endDate: project.endDate?.slice(0, 10) ?? null }}
          canCreate={Boolean(editable && manager)}
          onExpired={onExpired}
          onTaskChange={handleTaskChange}
          userId={userId}
        />
      )}
      {project && !taskOpen && <Sprints key={`sprints-${project.id}`} projectId={project.id} canPlan={Boolean(editable && manager)} onExpired={onExpired} userId={userId} />}
      {project?.isManager && !taskOpen && <Workload key={`workload-${project.id}`} projectId={project.id} onExpired={onExpired} />}
      {project?.isManager && !taskOpen && <Dashboard key={`dashboard-${project.id}`} projectId={project.id} onExpired={onExpired} />}
      {project?.isManager && !taskOpen && (
        <FloatingRecommendations
          key={`floating-recom-${project.id}`}
          projectId={project.id}
          isManager={Boolean(project.isManager)}
          onExpired={onExpired}
          onSelectTask={(id) => {
            setSelectedTaskId(id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
      {editable && manager && (
        <div>
          <button className="danger-button" disabled={busy} onClick={() => setPending({ kind: 'close', name: project.name })}>
            Đóng Project
          </button>
          {pending?.kind === 'close' && (
            <div className="confirm-panel" style={{ marginTop: '14px' }} role="group" aria-label="Xác nhận thay đổi Project">
              <p>Đóng Project “<strong>{pending.name}</strong>”? Project sẽ chuyển sang chỉ xem và không thể mở lại trong phiên bản này.</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={() => void mutate(async () => {
                    await projectApi.close(selected);
                    setNotice('Đã đóng Project.');
                  })}
                >
                  {busy ? 'Đang đóng…' : 'Xác nhận'}
                </button>
                <button type="button" className="refresh-button" disabled={busy} onClick={() => setPending(null)}>
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
