import { useState, type FormEvent } from 'react';
import { accountApi, ApiError, type Account } from '../api';

export function Profile({ user, onUpdated, onExpired }: { user: Account; onUpdated: (user: Account) => void; onExpired: () => void }) {
  const [name, setName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try {
      const result = await accountApi.updateProfile(name);
      setName(result.user.displayName); onUpdated(result.user); setSaved(true);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { onExpired(); return; }
      setError(failure instanceof ApiError ? failure : new ApiError(0, 'Không thể lưu hồ sơ.'));
    } finally { setBusy(false); }
  }

  return <section className="profile-panel" aria-labelledby="profile-title"><span className="eyebrow">THÔNG TIN CỦA BẠN</span><h2 id="profile-title">Hồ sơ cá nhân</h2><p className="profile-description">Tên hiển thị giúp thành viên trong nhóm nhận ra bạn.</p><form className="account-form" onSubmit={submit} aria-busy={busy}>
    {error && <p className="form-error" role="alert">{error.message}</p>}{saved && <p className="form-success" role="status">Đã lưu thay đổi hồ sơ.</p>}
    <fieldset disabled={busy}><div className="form-field"><label htmlFor="profile-name">Tên hiển thị</label><input id="profile-name" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} required maxLength={100} autoComplete="name" aria-invalid={Boolean(error?.fields.displayName)} aria-describedby={error?.fields.displayName ? 'profile-name-error' : undefined} />{error?.fields.displayName && <span className="field-error" id="profile-name-error">{error.fields.displayName}</span>}</div><div className="form-field"><label htmlFor="profile-email">Email đăng nhập</label><input id="profile-email" value={user.email} readOnly aria-describedby="email-help" /><span className="field-help" id="email-help">Email đăng nhập được giữ nguyên.</span></div><button className="primary-button" type="submit">{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></fieldset>
  </form></section>;
}
