import { useState, type FormEvent } from 'react';
import { accountApi, ApiError, type Account } from '../api';
import { Brand } from './Brand';

export function AuthScreen({ onAuthenticated, notice }: { onAuthenticated: (account: Account) => void; notice: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  return <div className="auth-shell">
    <aside className="auth-story"><Brand /><div className="auth-story-content"><div className="eyebrow">MỘT NHÓM. MỘT KHÔNG GIAN CHUNG.</div><h1>Cùng nhau,<br />đưa công việc<br />đến đích.</h1><p>Bắt đầu từ một tài khoản.<br />Kết nối với nhóm và tạo nên những điều tốt hơn.</p><div className="auth-illustration" aria-hidden="true"><span>✓</span><span>↗</span><span>▤</span></div></div><span className="auth-story-footer">Task Manager · Quản lý công việc nhóm</span></aside>
    <main className="auth-main"><div className="auth-card"><div className="auth-tabs" aria-label="Chọn chức năng tài khoản"><button type="button" disabled={busy} className={mode === 'login' ? 'selected' : ''} aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Đăng nhập</button><button type="button" disabled={busy} className={mode === 'register' ? 'selected' : ''} aria-pressed={mode === 'register'} onClick={() => setMode('register')}>Đăng ký</button></div>{notice && <p className="form-notice" role="status">{notice}</p>}<AuthForm key={mode} mode={mode} onAuthenticated={onAuthenticated} busy={busy} setBusy={setBusy} /><p className="auth-footnote">Không gian dành cho công việc và những người cùng bạn thực hiện.</p></div></main>
  </div>;
}

function AuthForm({ mode, onAuthenticated, busy, setBusy }: { mode: 'login' | 'register'; onAuthenticated: (account: Account) => void; busy: boolean; setBusy: (busy: boolean) => void }) {
  const [error, setError] = useState<ApiError | null>(null);
  const [visible, setVisible] = useState(false);
  const registering = mode === 'register';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    if (registering && password !== data.get('confirmPassword')) {
      setError(new ApiError(400, 'Mật khẩu xác nhận chưa khớp.', { confirmPassword: 'Nhập lại đúng mật khẩu.' }));
      return;
    }
    setBusy(true); setError(null);
    try {
      const result = registering ? await accountApi.register({ email, password, displayName: String(data.get('displayName') ?? '') })
        : await accountApi.login({ email, password });
      onAuthenticated(result.user);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure : new ApiError(0, 'Không thể hoàn tất. Vui lòng thử lại.'));
    } finally { setBusy(false); }
  }
  const fieldError = (name: string) => error?.fields[name] ? <span className="field-error" id={`${name}-error`}>{error.fields[name]}</span> : null;

  return <><div className="eyebrow">{registering ? 'BẮT ĐẦU HÀNH TRÌNH' : 'CHÀO MỪNG BẠN TRỞ LẠI'}</div><h1 className="auth-title">{registering ? 'Tạo tài khoản của bạn.' : 'Một ngày làm việc mới.'}</h1><p className="auth-description">{registering ? 'Chỉ vài thông tin để bắt đầu với Task Manager.' : 'Đăng nhập để tiếp tục cùng nhóm của bạn.'}</p><form onSubmit={submit} className="account-form" aria-busy={busy}>
    {error && <p className="form-error" role="alert">{error.message}</p>}
    <fieldset disabled={busy}>
      {registering && <div className="form-field"><label htmlFor="displayName">Tên hiển thị</label><input id="displayName" name="displayName" autoComplete="name" required maxLength={100} placeholder="Tên của bạn" aria-invalid={Boolean(error?.fields.displayName)} aria-describedby={error?.fields.displayName ? 'displayName-error' : undefined} />{fieldError('displayName')}</div>}
      <div className="form-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder="ban@example.com" aria-invalid={Boolean(error?.fields.email)} aria-describedby={error?.fields.email ? 'email-error' : undefined} />{fieldError('email')}</div>
      <div className="form-field"><label htmlFor="password">Mật khẩu</label><div className="password-field"><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 15 : 1} maxLength={128} aria-invalid={Boolean(error?.fields.password)} aria-describedby={error?.fields.password ? 'password-error' : registering ? 'password-help' : undefined} /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible}>{visible ? 'Ẩn' : 'Hiện'}</button></div>{fieldError('password')}{registering && <span className="field-help" id="password-help">Từ 15 đến 128 ký tự. Bạn có thể dùng một cụm từ dễ nhớ.</span>}</div>
      {registering && <div className="form-field"><label htmlFor="confirmPassword">Nhập lại mật khẩu</label><input id="confirmPassword" name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={15} maxLength={128} aria-invalid={Boolean(error?.fields.confirmPassword)} aria-describedby={error?.fields.confirmPassword ? 'confirmPassword-error' : undefined} />{fieldError('confirmPassword')}</div>}
      <button type="submit" className="primary-button">{busy ? 'Đang xử lý…' : registering ? 'Tạo tài khoản →' : 'Đăng nhập →'}</button>
    </fieldset>
  </form></>;
}
