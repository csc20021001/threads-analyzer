import { login, signup } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return (
    <form style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
      <h1>登入</h1>
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="密碼（至少 6 碼）" minLength={6} required />
      <div style={{ display: 'flex', gap: 8 }}>
        <button formAction={login}>登入</button>
        <button formAction={signup} style={{ background: '#555' }}>註冊</button>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}
    </form>
  );
}
