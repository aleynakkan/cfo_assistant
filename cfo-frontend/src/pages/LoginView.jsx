import { useState } from 'react';
import { apiClient } from '../api/client';
import styles from './LoginView.module.css';

export default function LoginView({ onLoginSuccess }) {
  const [email, setEmail] = useState('seyfo@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) {
      setError('Lütfen tüm alanları doldurunuz');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);  // Swagger UI uyumluluğu: 'username' parametresi
      formData.append('password', password);

      const res = await fetch(`${apiClient.baseURL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Giriş başarısız');
      }

      const data = await res.json();
      const token = data.access_token;

      if (token) {
        onLoginSuccess(token);
      } else {
        throw new Error('Token alınamadı');
      }
    } catch (err) {
      setError(err.message || 'Giriş sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      {/* Decorative Background Elements */}
      <div className={styles.decorativeShape1}></div>
      <div className={styles.decorativeShape2}></div>
      <div className={styles.decorativeShape3}></div>
      <div className={styles.decorativeShape4}></div>

      {/* Right Side Tagline Box */}
      <div className={styles.taglineBox}>
        <p className={styles.taglineText}>
          ERP'si olmayan KOBİ'lere CFO kalitesinde finans yönetimi, otomatik ve AI destekli.
        </p>
      </div>

      {/* Login Card */}
      <div className={styles.card}>
        <div className={styles.formContainer}>
          {/* Heading */}
          <div className={styles.heading}>
            <h1 className={styles.title}>Welcome back!</h1>
            <p className={styles.subtitle}>Login to your account</p>
          </div>

          {/* Error Message */}
          {error && <div className={styles.error}>{error}</div>}

          {/* Form */}
          <form onSubmit={handleLogin} className={styles.form}>
            {/* Email Field */}
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                disabled={loading}
              />
            </div>

            {/* Password Field */}
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Password</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.passwordInput}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.eyeIcon}
                  disabled={loading}
                >
                  👁️
                </button>
              </div>
            </div>

            {/* Forgot Password Link */}
            <button type="button" className={styles.forgotPassword}>
              Recover Password
            </button>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className={styles.loginButton}
            >
              {loading ? 'Yükleniyor...' : 'Login'}
            </button>
          </form>

          {/* Sign Up Link */}
          <p className={styles.signUpText}>
            Don't have an account? <span className={styles.signUpLink}>Sign Up</span>
          </p>
        </div>
      </div>
    </div>
  );
}
