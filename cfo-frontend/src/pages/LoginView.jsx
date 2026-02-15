import { useState } from 'react';
import { apiClient } from '../api/client';
import styles from './LoginView.module.css';
import loginpagebackground from '../assets/loginpagebackground.svg';

export default function LoginView({ onLoginSuccess }) {
  const [email, setEmail] = useState('seyfo@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

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

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!resetEmail) {
      setError('Lütfen e-posta adresinizi giriniz');
      return;
    }

    setResetLoading(true);
    setError('');
    setResetMessage('');

    try {
      const formData = new URLSearchParams();
      formData.append('email', resetEmail);

      const res = await fetch(`${apiClient.baseURL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Parola sıfırlama işlemi başarısız');
      }

      setResetMessage('Parola sıfırlama bağlantısı e-posta adresinize gönderildi.');
    } catch (err) {
      setError(err.message || 'Parola sıfırlama sırasında hata oluştu');
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      {/* Left Column - Login Form */}
      <div className={styles.leftColumn}>
        <div className={styles.loginCard}>
          <div className={styles.formContainer}>
            {/* Heading */}
            <div className={styles.heading}>
              <h1 className={styles.title}>Tekrar hoş geldiniz!</h1>
              <p className={styles.subtitle}>Hesabınıza giriş yapın</p>
            </div>

            {/* Error Message */}
            {error && <div className={styles.error}>{error}</div>}

            {/* Form */}
            <form onSubmit={handleLogin} className={styles.form}>
              {/* Email Field */}
              <div className={styles.fieldGroup}>
                <label className={styles.label}>E-posta Adresi</label>
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
                <label className={styles.label}>Şifre</label>
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
              <button 
                type="button" 
                className={styles.forgotPassword}
                onClick={() => setShowForgotPassword(true)}
              >
                Şifremi Unuttum
              </button>

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className={styles.loginButton}
              >
                {loading ? 'Yükleniyor...' : 'Giriş Yap'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Right Column - Background Image */}
      <div className={styles.rightColumn}>
        <div className={styles.backgroundImageContainer}>
          <img src={loginpagebackground} alt="" className={styles.backgroundSvg} />
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Parola Sıfırlama</h2>
              <button 
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmail('');
                  setResetMessage('');
                  setError('');
                }}
                className={styles.closeButton}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleForgotPassword} className={styles.resetForm}>
              <p className={styles.resetDescription}>
                E-posta adresinizi girin, parola sıfırlama bağlantısını göndereceğiz.
              </p>
              
              {resetMessage && <div className={styles.success}>{resetMessage}</div>}
              {error && <div className={styles.error}>{error}</div>}
              
              <div className={styles.fieldGroup}>
                <label className={styles.label}>E-posta Adresi</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className={styles.input}
                  disabled={resetLoading}
                  autoFocus
                />
              </div>
              
              <button
                type="submit"
                disabled={resetLoading || !resetEmail}
                className={styles.resetButton}
              >
                {resetLoading ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
