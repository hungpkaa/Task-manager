import { useState, type FormEvent } from 'react';
import { accountApi, ApiError } from '../api';

export function PasswordRecovery({ token, busy, setBusy, onBack }: { token?: string; busy: boolean; setBusy: (value: boolean) => void; onBack: () => void }) {
  const resetting = token !== undefined;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password') ?? '');
    if (resetting && password !== fields.get('confirmation')) { setError('Mật khẩu xác nhận chưa khớp.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = resetting ? await accountApi.resetPassword(token!, password) : await accountApi.forgotPassword(String(fields.get('email') ?? ''));
      setNotice(result.message); if (resetting) setDone(true);
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'Không thể hoàn tất. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  return <><h1 className="auth-title">{resetting ? 'Đặt mật khẩu mới.' : 'Quên mật khẩu?'}</h1><p className="auth-description">{resetting ? 'Dùng một mật khẩu mới cho tài khoản của bạn.' : 'Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {!done && <form className="account-form" aria-busy={busy} onSubmit={(event) => void submit(event)}><fieldset disabled={busy}>
      {resetting ? <><div className="form-field"><label htmlFor="reset-password">Mật khẩu mới</label><input id="reset-password" name="password" type="password" autoComplete="new-password" required minLength={15} maxLength={128} /><span className="field-help">Từ 15 đến 128 ký tự.</span></div><div className="form-field"><label htmlFor="reset-confirmation">Nhập lại mật khẩu mới</label><input id="reset-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={128} /></div></> : <div className="form-field"><label htmlFor="recovery-email">Email tài khoản</label><input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>}
      <button className="primary-button">{busy ? 'Đang xử lý…' : resetting ? 'Đổi mật khẩu' : 'Gửi liên kết đặt lại'}</button>
    </fieldset></form>}
    <button type="button" className="refresh-button recovery-back" disabled={busy} onClick={onBack}>← Về đăng nhập</button>
  </>;
}
