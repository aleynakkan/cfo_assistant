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
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M2.99902 3L20.999 21M9.8433 9.91364C9.32066 10.4536 8.99902 11.1892 8.99902 12C8.99902 13.6569 10.3422 15 11.999 15C12.8215 15 13.5667 14.669 14.1086 14.133M6.49902 6.64715C4.59972 7.90034 3.15305 9.78394 2.45703 12C3.73128 16.0571 7.52159 19 11.9992 19C13.9881 19 15.8414 18.4194 17.3988 17.4184M10.999 5.04939C11.328 5.01673 11.6617 5 11.9992 5C16.4769 5 20.2672 7.94291 21.5414 12C21.2607 12.894 20.8577 13.7338 20.3522 14.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M2.45703 12C3.73128 7.94291 7.52159 5 11.9992 5C16.4769 5 20.2672 7.94291 21.5414 12C20.2672 16.0571 16.4769 19 11.9992 19C7.52159 19 3.73128 16.0571 2.45703 12Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M11.9992 15C13.6561 15 14.9992 13.6569 14.9992 12C14.9992 10.3431 13.6561 9 11.9992 9C10.3424 9 8.99924 10.3431 8.99924 12C8.99924 13.6569 10.3424 15 11.9992 15Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
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
