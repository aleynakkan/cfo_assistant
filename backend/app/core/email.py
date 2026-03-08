# app/core/email.py
"""
Email gönderim servisi - SMTP ile şifre sıfırlama maili gönderimi.

Ortam değişkenleri:
  SMTP_HOST     - SMTP sunucu adresi (default: smtp.gmail.com)
  SMTP_PORT     - SMTP port (default: 587)
  SMTP_USER     - SMTP kullanıcı adı (email)
  SMTP_PASSWORD  - SMTP şifresi (App Password)
  SMTP_FROM     - Gönderen email adresi (default: SMTP_USER)
  FRONTEND_URL  - Frontend URL (default: http://localhost:5173)
"""

import os
import smtplib
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

# Logo PNG dosyasını oku (email istemcileri SVG desteklemez)
_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_logo_path = _ASSETS_DIR / "logo-name.png"
_LOGO_PNG: bytes | None = _logo_path.read_bytes() if _logo_path.exists() else None
if not _LOGO_PNG:
    print("[EMAIL] Logo bulunamadı:", _logo_path)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "") or SMTP_USER
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """
    Şifre sıfırlama bağlantısı içeren email gönderir.
    
    Returns:
        True: email başarıyla gönderildi
        False: email gönderilemedi (SMTP ayarları eksik veya hata)
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        print(f"[EMAIL] SMTP ayarları eksik. Reset token: {reset_token} (email: {to_email})")
        print(f"[EMAIL] Reset link: {FRONTEND_URL}?reset_token={reset_token}")
        return False

    reset_link = f"{FRONTEND_URL}?reset_token={reset_token}"

    subject = "Seyfo - Şifre Sıfırlama"

    # Logo: PNG varsa CID ile göster, yoksa text fallback
    logo_html = '<img src="cid:seyfo_logo" alt="Seyfo" width="200" style="max-width:200px;height:auto;" />' if _LOGO_PNG else "<h1 style='color:#dc2626;font-size:24px;margin:0'>Seyfo</h1>"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 480px; margin: 0 auto; padding: 32px; }}
            .header {{ text-align: center; margin-bottom: 32px; }}
            .content {{ background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px; }}
            .btn {{ display: inline-block; background: #dc2626; color: #ffffff !important; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; }}
            .btn:hover {{ background: #b91c1c; }}
            .footer {{ text-align: center; color: #9ca3af; font-size: 12px; margin-top: 32px; }}
            .link {{ word-break: break-all; color: #6b7280; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                {logo_html}
            </div>
            <div class="content">
                <p>Merhaba,</p>
                <p>Hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz:</p>
                <p style="text-align: center; margin: 24px 0;">
                    <a href="{reset_link}" class="btn">Şifremi Sıfırla</a>
                </p>
                <p>Bu bağlantı <strong>1 saat</strong> boyunca geçerlidir.</p>
                <p>Eğer bu talebi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz.</p>
            </div>
            <div class="footer">
                <p class="link">Buton çalışmıyorsa bu linki tarayıcınıza yapıştırın:<br>{reset_link}</p>
                <p>© 2026 Seyfo CFO Assistant</p>
            </div>
        </div>
    </body>
    </html>
    """

    text_body = f"""
Seyfo CFO - Şifre Sıfırlama

Hesabınız için şifre sıfırlama talebinde bulundunuz.
Aşağıdaki bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz:

{reset_link}

Bu bağlantı 1 saat boyunca geçerlidir.
Eğer bu talebi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz.
    """

    try:
        # related > alternative > text/html yapısı (CID image için gerekli)
        msg = MIMEMultipart("related")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email

        msg_alt = MIMEMultipart("alternative")
        msg_alt.attach(MIMEText(text_body, "plain", "utf-8"))
        msg_alt.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(msg_alt)

        # Logo PNG'yi CID olarak ekle
        if _LOGO_PNG:
            logo_image = MIMEImage(_LOGO_PNG, _subtype="png")
            logo_image.add_header("Content-ID", "<seyfo_logo>")
            logo_image.add_header("Content-Disposition", "inline", filename="logo.png")
            msg.attach(logo_image)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        print(f"[EMAIL] Şifre sıfırlama maili gönderildi: {to_email}")
        return True

    except Exception as e:
        print(f"[EMAIL] Mail gönderim hatası: {e}")
        print(f"[EMAIL] Fallback - Reset link: {FRONTEND_URL}?reset_token={reset_token}")
        return False
