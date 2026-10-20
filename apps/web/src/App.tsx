import { useEffect, useState } from 'react';
import { accountApi, ApiError, checkConnection, type Account, type ConnectionResult, type ConnectionState } from './api';
import { AuthScreen } from './components/AuthScreen';
import { Brand } from './components/Brand';
import { Profile } from './components/Profile';
import { Workspaces, type WorkspaceView } from './components/Workspaces';
import { Notifications } from './components/Notifications';
import { Tasks } from './components/Tasks';
import { Dashboard } from './components/Dashboard';
import { Admin } from './components/Admin';
import { Icon } from './components/Icon';
import type { ProjectView } from './components/Projects';
import type { TaskFilter } from './components/PersonalDashboardView';

function greetingName(displayName: string) {
  const name = displayName.trim();
  if (!name) return 'bạn';
  return `${name.charAt(0).toLocaleUpperCase('vi-VN')}${name.slice(1)}`;
}
function timeGreeting(displayName: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
  const name = greetingName(displayName);
  if (hour >= 5 && hour < 11) return `Chào buổi sáng, ${name} 👋`;
  if (hour >= 11 && hour < 14) return `Chào buổi trưa, ${name} 👋`;
  if (hour >= 14 && hour < 18) return `Chào buổi chiều, ${name} 👋`;
  if (hour >= 18 && hour < 22) return `Chào buổi tối, ${name} 👋`;
  return `Chào ${name} 👋`;
}

const stateLabels: Record<ConnectionState, string> = {
  checking: 'Đang kiểm tra', connected: 'Đã kết nối', unavailable: 'Chưa kết nối',
};

export function App() {
  const [resetToken, setResetToken] = useState<string | undefined>(() => new URLSearchParams(window.location.hash.slice(1)).get('reset') ?? undefined);
  useEffect(() => {
    function captureResetLink() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('reset');
      if (token !== null) { setResetToken(token); window.history.replaceState(null, '', window.location.pathname + window.location.search); }
    }
    captureResetLink(); window.addEventListener('hashchange', captureResetLink);
    return () => window.removeEventListener('hashchange', captureResetLink);
  }, []);
  const [user, setUser] = useState<Account | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [screen, setScreen] = useState<'overview' | 'profile' | 'workspaces' | 'notifications' | 'tasks' | 'admin'>('overview');
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [taskId, setTaskId] = useState<string>();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [projectView, setProjectView] = useState<ProjectView>('overview');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('overview');
  const [myTasksFilter, setMyTasksFilter] = useState<TaskFilter>({});
  const [sectionRevision, setSectionRevision] = useState(0);
  function navigate(target: typeof screen) {
    if (target !== 'workspaces') setWorkspaceMenuOpen(false);
    if (target === 'workspaces') {
      setWorkspaceId(undefined); setProjectId(undefined); setTaskId(undefined);
      setSectionRevision((value) => value + 1);
    } else if (target === 'tasks') {
      setTaskId(undefined);
      setSectionRevision((value) => value + 1);
    }
    setScreen(target);
  }
  function handleWorkspaceNavClick() {
    openWorkspaceList();
  }
  function openWorkspaceList() {
    setWorkspaceView('overview');
    setWorkspaceMenuOpen(true);
    navigate('workspaces');
  }
  function openMyTasks(filter: TaskFilter = {}) { setMyTasksFilter(filter); navigate('tasks'); }
  function startTaskCreation() {
    openWorkspaceList();
  }
  const screenLabels = { overview: 'Tổng quan', profile: 'Hồ sơ cá nhân', workspaces: 'Workspace', notifications: 'Thông báo', tasks: 'My Tasks', admin: 'Quản trị hệ thống' };
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<ConnectionResult>({ api: 'checking', database: 'checking' });
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let active = true;
    setSessionLoading(true); setSessionError('');
    accountApi.me(controller.signal).then((result) => { if (active) setUser(result.user); })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else setSessionError(error instanceof Error ? error.message : 'Không thể kiểm tra phiên đăng nhập.');
      }).finally(() => { clearTimeout(timeout); if (active) setSessionLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [sessionAttempt]);

  function expired() { setUser(null); setScreen('overview'); setNotice('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
  async function logout() {
    setLoggingOut(true); setLogoutError('');
    try { await accountApi.logout(); setUser(null); setScreen('overview'); setNotice('Bạn đã đăng xuất.'); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : 'Không thể đăng xuất. Vui lòng thử lại.'); }
    finally { setLoggingOut(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setChecking(true);
    setConnection({ api: 'checking', database: 'checking' });
    let active = true;
    checkConnection(controller.signal)
      .then((result) => { if (active) setConnection(result); })
      .catch(() => { if (active) setConnection({ api: 'unavailable', database: 'unavailable' }); })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setChecking(false);
      });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  if (resetToken !== undefined) return <AuthScreen key={`password-reset-${resetToken}`} resetToken={resetToken} notice="" onAuthenticated={setUser} onResetFinished={() => { setResetToken(undefined); setUser(null); setNotice(''); setSessionAttempt((value) => value + 1); }} />;
  if (sessionLoading || sessionError) return <div className="session-screen"><Brand /><div className="session-card" role="status"><h1>{sessionLoading ? 'Đang mở không gian của bạn…' : 'Chưa kết nối được máy chủ.'}</h1>{sessionError && <><p>{sessionError}</p><button className="primary-button" onClick={() => setSessionAttempt((value) => value + 1)}>Thử lại</button></>}</div></div>;
  if (!user) return <AuthScreen notice={notice} onAuthenticated={(account) => { setUser(account); setNotice(''); setLogoutError(''); }} />;

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Thông tin ứng dụng">
        <Brand />
        <div className="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav className="account-nav" aria-label="Điều hướng">{(['overview', 'workspaces', 'tasks', 'notifications', 'profile'] as const).map((target) => target === 'workspaces' ? <div className={`workspace-nav-item${workspaceMenuOpen ? ' is-open' : ''}`} key={target}>
          <button className={screen === target ? 'nav-active' : ''} aria-current={screen === target ? 'page' : undefined} aria-expanded={workspaceMenuOpen} onClick={handleWorkspaceNavClick}><Icon name="workspace" />{screenLabels[target]}<span className="workspace-nav-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg></span></button>
          {workspaceMenuOpen && <div className="workspace-subnav" aria-label="Đi tới phần Workspace">
            <button type="button" className={!workspaceId ? 'is-current' : ''} onClick={() => { setWorkspaceMenuOpen(true); navigate('workspaces'); }}>Danh sách Workspace</button>
            <button type="button" disabled={!workspaceId} className={workspaceId && workspaceView === 'overview' ? 'is-current' : ''} onClick={() => setWorkspaceView('overview')}>Thông tin Workspace</button>
            <button type="button" disabled={!workspaceId} className={workspaceId && workspaceView === 'members' ? 'is-current' : ''} onClick={() => setWorkspaceView('members')}>Thành viên</button>
            <button type="button" disabled={!workspaceId} className={workspaceId && workspaceView === 'projects' ? 'is-current' : ''} onClick={() => setWorkspaceView('projects')}>Project</button>
          </div>}
        </div> : <button key={target} className={screen === target ? 'nav-active' : ''} aria-current={screen === target ? 'page' : undefined} onClick={() => { if (target === 'tasks') setMyTasksFilter({}); navigate(target); }}><Icon name={target === 'tasks' ? 'task' : target === 'notifications' ? 'notification' : target} />{screenLabels[target]}</button>)}</nav>
        <div className="sidebar-note"><span className="note-dot" />Đã đăng nhập<p className="sidebar-account">{user.displayName}<br /><span>{user.email}</span></p></div>
        {user.systemRole === 'SYSTEM_ADMIN' && <button className="refresh-button" aria-current={screen === 'admin' ? 'page' : undefined} onClick={() => navigate('admin')}>Quản trị hệ thống</button>}
        <div className="sidebar-footer">TASK MANAGER <span>0.1</span></div>
      </aside>

      <main>
        <header className="topbar"><span>Không gian làm việc <span className="slash">/</span> <strong>{screenLabels[screen]}</strong></span><div className="account-actions"><button className="profile-link" onClick={() => setScreen('profile')}>{user.displayName}</button><button className="refresh-button" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div></header>
        <div className="content">
          {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
          {screen === 'admin' && user.systemRole === 'SYSTEM_ADMIN' ? <Admin userId={user.id} onExpired={expired} /> : screen === 'profile' ? <Profile user={user} onUpdated={setUser} onExpired={expired} /> : screen === 'workspaces' ? <Workspaces key={`${sectionRevision}-${workspaceId ?? 'list'}-${projectId ?? ''}`} userId={user.id} initialId={workspaceId} initialProjectId={projectId} onExpired={expired} onSelected={setWorkspaceId} workspaceView={workspaceView} onWorkspaceViewChange={setWorkspaceView} projectView={projectView} onProjectViewChange={setProjectView} /> : screen === 'tasks' ? <Tasks key={`${sectionRevision}-${taskId ?? 'mine'}`} initialId={taskId} initialFilter={myTasksFilter} onExpired={expired} /> : screen === 'notifications' ? <Notifications onExpired={expired} onWorkspace={(id) => { setWorkspaceId(id); setProjectId(undefined); setScreen('workspaces'); }} onProject={(workspace, project) => { setWorkspaceId(workspace); setProjectId(project); setScreen('workspaces'); }} onTask={(id) => { setTaskId(id); setScreen('tasks'); }} /> : <>
          <div className="overview-heading personal-welcome"><div><span className="eyebrow">KHÔNG GIAN CỦA BẠN</span><h1>{timeGreeting(user.displayName)}</h1><p>{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })} · Cùng đưa công việc đến đích.</p></div><div className="member-actions"><button className="refresh-button" onClick={openWorkspaceList}><Icon name="workspace" />Mở Workspace</button><button className="refresh-button" onClick={() => openMyTasks()}><Icon name="task" />Mở My Tasks</button><button className="primary-button" onClick={startTaskCreation}><Icon name="task" />Tạo Task</button></div></div>
          <Dashboard key={user.id} onExpired={expired} onWorkspace={() => navigate('workspaces')} onTasksFilter={openMyTasks} />
          <details className="connection-panel connection-details"><summary>Trạng thái kết nối</summary><section aria-labelledby="connection-title">
            <div className="panel-heading"><div><span className="eyebrow">NỀN TẢNG ỨNG DỤNG</span><h2 id="connection-title">Trạng thái kết nối</h2></div><button type="button" className="refresh-button" onClick={() => setAttempt((value) => value + 1)} disabled={checking}>{checking ? 'Đang kiểm tra…' : 'Kiểm tra lại ↻'}</button></div>
            <div className="connection-grid" aria-live="polite" aria-busy={checking}>
              <StatusCard name="Giao diện" detail="Không gian làm việc trên trình duyệt" state="connected" />
              <StatusCard name="Máy chủ" detail="Tiếp nhận và xử lý yêu cầu" state={connection.api} />
              <StatusCard name="Dữ liệu" detail="Lưu trữ thông tin của nhóm" state={connection.database} />
            </div>
            {!checking && (connection.api !== 'connected' || connection.database !== 'connected') && <p className="connection-warning" role="status">{connection.api !== 'connected' ? 'Chưa kết nối được máy chủ. Kiểm tra API đang chạy rồi thử lại.' : 'Máy chủ đang chạy, nhưng chưa kết nối được dữ liệu. Kiểm tra PostgreSQL và cấu hình kết nối rồi thử lại.'}</p>}
          </section></details>
          </>}
        </div>
      </main>
    </div>
  );
}

function StatusCard({ name, detail, state }: { name: string; detail: string; state: ConnectionState }) {
  return <div className="status-card"><div className="status-top"><h3>{name}</h3><span className={`status-badge ${state}`}><span className="status-dot" />{stateLabels[state]}</span></div><p>{detail}</p></div>;
}
