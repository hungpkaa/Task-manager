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

  const initials = user.displayName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase('vi-VN');
  const joinedDate = new Date(user.createdAt).toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
  const roleLabel = user.systemRole === 'SYSTEM_ADMIN' ? 'Quản trị viên hệ thống' : 'Thành viên';

  return <section className="profile-page" aria-labelledby="profile-title">
    <div className="profile-cover" aria-hidden="true"><span className="profile-cover-orbit profile-cover-orbit-one" /><span className="profile-cover-orbit profile-cover-orbit-two" /><span className="profile-cover-dots" /></div>
    <header className="profile-hero">
      <div className="profile-avatar" aria-hidden="true">{initials || 'TM'}</div>
      <div className="profile-identity"><span className="eyebrow">HỒ SƠ THÀNH VIÊN</span><h1 id="profile-title">{user.displayName}</h1><p>{user.email}</p></div>
      <span className="profile-role">{roleLabel}</span>
    </header>
    <div className="profile-tabs" aria-label="Khu vực hồ sơ"><span className="is-active">Tổng quan</span></div>
    <div className="profile-layout">
      <section className="profile-panel profile-edit-panel" aria-labelledby="profile-edit-title">
        <span className="eyebrow">THÔNG TIN CỦA BẠN</span><h2 id="profile-edit-title">Hồ sơ cá nhân</h2>
        <p className="profile-description">Tên hiển thị giúp thành viên trong nhóm nhận ra bạn.</p>
        <form className="account-form" onSubmit={submit} aria-busy={busy}>
          {error && <p className="form-error" role="alert">{error.message}</p>}{saved && <p className="form-success" role="status">Đã lưu thay đổi hồ sơ.</p>}
          <fieldset disabled={busy}>
            <div className="form-field"><label htmlFor="profile-name">Tên hiển thị</label><input id="profile-name" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} required maxLength={100} autoComplete="name" aria-invalid={Boolean(error?.fields.displayName)} aria-describedby={error?.fields.displayName ? 'profile-name-error' : undefined} />{error?.fields.displayName && <span className="field-error" id="profile-name-error">{error.fields.displayName}</span>}</div>
            <div className="form-field"><label htmlFor="profile-email">Email đăng nhập</label><input id="profile-email" value={user.email} readOnly aria-describedby="email-help" /><span className="field-help" id="email-help">Email đăng nhập được giữ nguyên.</span></div>
            <button className="primary-button" type="submit">{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
          </fieldset>
        </form>
      </section>
      <aside className="profile-details" aria-labelledby="profile-details-title">
        <h2 id="profile-details-title">Chi tiết</h2>
        <dl><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Vai trò</dt><dd>{roleLabel}</dd></div><div><dt>Thành viên từ</dt><dd>{joinedDate}</dd></div></dl>
        <div className="profile-account-card"><span className="profile-account-card-icon" aria-hidden="true">✓</span><strong>Tài khoản đang hoạt động</strong><p>Thông tin hồ sơ giúp nhóm nhận ra bạn trong Task Manager.</p></div>
      </aside>
    </div>
  </section>;
}
