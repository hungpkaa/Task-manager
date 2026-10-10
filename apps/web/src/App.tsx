import { useEffect, useState } from 'react';
import { accountApi, ApiError, checkConnection, type Account, type ConnectionResult, type ConnectionState } from './api';
import { AuthScreen } from './components/AuthScreen';
import { Brand } from './components/Brand';
import { Profile } from './components/Profile';
import { Workspaces } from './components/Workspaces';
import { Notifications } from './components/Notifications';
import { Tasks } from './components/Tasks';

const stateLabels: Record<ConnectionState, string> = {
  checking: 'Đang kiểm tra', connected: 'Đã kết nối', unavailable: 'Chưa kết nối',
};

export function App() {
  const [user, setUser] = useState<Account | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [screen, setScreen] = useState<'overview' | 'profile' | 'workspaces' | 'notifications' | 'tasks'>('overview');
  const [taskId, setTaskId] = useState<string>();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const screenLabels = { overview: 'Tổng quan', profile: 'Hồ sơ cá nhân', workspaces: 'Workspace', notifications: 'Thông báo', tasks: 'My Tasks' };
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

  if (sessionLoading || sessionError) return <div className="session-screen"><Brand /><div className="session-card" role="status"><h1>{sessionLoading ? 'Đang mở không gian của bạn…' : 'Chưa kết nối được máy chủ.'}</h1>{sessionError && <><p>{sessionError}</p><button className="primary-button" onClick={() => setSessionAttempt((value) => value + 1)}>Thử lại</button></>}</div></div>;
  if (!user) return <AuthScreen notice={notice} onAuthenticated={(account) => { setUser(account); setNotice(''); setLogoutError(''); }} />;

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Thông tin ứng dụng">
        <Brand />
        <div className="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav className="account-nav" aria-label="Điều hướng"><button className={screen === 'overview' ? 'nav-active' : ''} aria-current={screen === 'overview' ? 'page' : undefined} onClick={() => setScreen('overview')}><span aria-hidden="true">▦</span> Tổng quan</button><button className={screen === 'profile' ? 'nav-active' : ''} aria-current={screen === 'profile' ? 'page' : undefined} onClick={() => setScreen('profile')}><span aria-hidden="true">○</span> Hồ sơ cá nhân</button></nav>
        <div className="sidebar-note"><span className="note-dot" />Đã đăng nhập<p className="sidebar-account">{user.displayName}<br /><span>{user.email}</span></p></div>
        <nav className="account-nav" aria-label="Nhóm và thông báo"><button className={screen === 'workspaces' ? 'nav-active' : ''} aria-current={screen === 'workspaces' ? 'page' : undefined} onClick={() => { setWorkspaceId(undefined); setScreen('workspaces'); }}>Workspace</button><button className={screen === 'notifications' ? 'nav-active' : ''} aria-current={screen === 'notifications' ? 'page' : undefined} onClick={() => setScreen('notifications')}>Thông báo</button></nav>
        <nav className="account-nav" aria-label="Công việc cá nhân"><button className={screen === 'tasks' ? 'nav-active' : ''} aria-current={screen === 'tasks' ? 'page' : undefined} onClick={() => { setTaskId(undefined); setScreen('tasks'); }}>My Tasks</button></nav>
        <div className="sidebar-footer">TASK MANAGER <span>0.1</span></div>
      </aside>

      <main>
        <header className="topbar"><span>Không gian làm việc <span className="slash">/</span> <strong>{screenLabels[screen]}</strong></span><div className="account-actions"><button className="profile-link" onClick={() => setScreen('profile')}>{user.displayName}</button><button className="refresh-button" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div></header>
        <div className="content">
          {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
          {screen === 'profile' ? <Profile user={user} onUpdated={setUser} onExpired={expired} /> : screen === 'workspaces' ? <Workspaces key={`${workspaceId ?? 'list'}-${projectId ?? ''}`} userId={user.id} initialId={workspaceId} initialProjectId={projectId} onExpired={expired} /> : screen === 'tasks' ? <Tasks key={taskId ?? 'mine'} initialId={taskId} onExpired={expired} /> : screen === 'notifications' ? <Notifications onExpired={expired} onWorkspace={(id) => { setWorkspaceId(id); setProjectId(undefined); setScreen('workspaces'); }} onProject={(workspace, project) => { setWorkspaceId(workspace); setProjectId(project); setScreen('workspaces'); }} onTask={(id) => { setTaskId(id); setScreen('tasks'); }} /> : <>
          <div className="eyebrow">CÔNG VIỆC RÕ RÀNG. NHÓM VỮNG VÀNG.</div>
          <div className="heading-row"><div><h1>Chào {user.displayName},<br />cùng bắt đầu nhé.</h1><p className="intro">Nơi nhóm của bạn lên kế hoạch, phân công và cùng nhau<br className="desktop-break" /> đưa công việc đến đích.</p></div><div className="decor" aria-hidden="true"><span>✓</span><span>↗</span><span>▤</span></div></div>

          <section className="connection-panel" aria-labelledby="connection-title">
            <div className="panel-heading"><div><span className="eyebrow">NỀN TẢNG ỨNG DỤNG</span><h2 id="connection-title">Trạng thái kết nối</h2></div><button type="button" className="refresh-button" onClick={() => setAttempt((value) => value + 1)} disabled={checking}>{checking ? 'Đang kiểm tra…' : 'Kiểm tra lại ↻'}</button></div>
            <div className="connection-grid" aria-live="polite" aria-busy={checking}>
              <StatusCard name="Giao diện" detail="Không gian làm việc trên trình duyệt" state="connected" />
              <StatusCard name="Máy chủ" detail="Tiếp nhận và xử lý yêu cầu" state={connection.api} />
              <StatusCard name="Dữ liệu" detail="Lưu trữ thông tin của nhóm" state={connection.database} />
            </div>
            {!checking && (connection.api !== 'connected' || connection.database !== 'connected') && <p className="connection-warning" role="status">{connection.api !== 'connected' ? 'Chưa kết nối được máy chủ. Kiểm tra API đang chạy rồi thử lại.' : 'Máy chủ đang chạy, nhưng chưa kết nối được dữ liệu. Kiểm tra PostgreSQL và cấu hình kết nối rồi thử lại.'}</p>}
          </section>

          <section className="next-panel" aria-labelledby="next-title"><div className="next-icon" aria-hidden="true">↗</div><div><span className="eyebrow">KHÔNG GIAN CỦA NHÓM</span><h2 id="next-title">Kết nối nhóm của bạn.</h2><p>Tạo Workspace, thêm thành viên và phân quyền cho nhóm.</p></div><button className="primary-button" onClick={() => { setWorkspaceId(undefined); setScreen('workspaces'); }}>Mở Workspace</button></section>

          <section className="next-panel"><div><h2>Công việc được giao cho bạn</h2><p>Mở My Tasks để theo dõi deadline và cập nhật tiến độ.</p></div><button className="primary-button" onClick={() => { setTaskId(undefined); setScreen('tasks'); }}>Mở My Tasks</button></section>
          </>}
          <footer className="page-footer"><span>Task Manager · Quản lý công việc nhóm</span><span>Nền tảng đang được hoàn thiện</span></footer>
        </div>
      </main>
    </div>
  );
}

function StatusCard({ name, detail, state }: { name: string; detail: string; state: ConnectionState }) {
  return <div className="status-card"><div className="status-top"><h3>{name}</h3><span className={`status-badge ${state}`}><span className="status-dot" />{stateLabels[state]}</span></div><p>{detail}</p></div>;
}
