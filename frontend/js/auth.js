/**
 * EduVerse — Auth Module
 * Google Sign-In via Google Identity Services (GSI)
 *
 * Flujo:
 *  1. Página carga → se verifica si hay sesión guardada en sessionStorage
 *  2. Si no hay sesión → se muestra pantalla de login con botón Google
 *  3. El usuario se loguea → se verifica su email contra la API (/api/auth/verify)
 *  4. Si está en la lista → se muestra la app
 *  5. Si NO está en la lista → se muestra pantalla de acceso denegado
 *
 * IMPORTANTE: Reemplazá GOOGLE_CLIENT_ID con tu Client ID real de Google Cloud Console.
 * Instrucciones: https://console.cloud.google.com/apis/credentials
 */

// ═══════════════════════════════════════════════════════
// ⚠️  CONFIGURACIÓN — Reemplazar con tu Client ID real
// ═══════════════════════════════════════════════════════
const GOOGLE_CLIENT_ID = 'TU_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
// ═══════════════════════════════════════════════════════

const SESSION_KEY = 'eduverse_user';

// Estado de autenticación global
window.currentUser = null;

// ── Helpers ──────────────────────────────────────────────

function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function loadSession() {
  try {
    const data = sessionStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── Render helpers ────────────────────────────────────────

function showLoginScreen() {
  const container = document.getElementById('auth-container');
  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-mark">🎓</div>
          EduVerse
        </div>
        <h1 class="auth-title">Acceso a la plataforma</h1>
        <p class="auth-subtitle">
          Esta plataforma es de uso restringido.<br>
          Iniciá sesión con tu cuenta de Google para continuar.
        </p>

        <!-- Google One Tap / button -->
        <div id="g_id_onload"
          data-client_id="${GOOGLE_CLIENT_ID}"
          data-context="signin"
          data-ux_mode="popup"
          data-callback="handleGoogleCallback"
          data-auto_prompt="false">
        </div>

        <div id="google-btn-container">
          <div class="g_id_signin"
            data-type="standard"
            data-shape="rectangular"
            data-theme="outline"
            data-text="signin_with"
            data-size="large"
            data-logo_alignment="left"
            data-width="320">
          </div>
        </div>

        <!-- Fallback manual button in case GSI is blocked -->
        <button class="btn-google" id="manual-google-btn" style="display:none" onclick="triggerGoogleSignIn()">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar con Google
        </button>

        <div class="auth-divider">acceso seguro</div>
        <p class="auth-note">
          Solo los usuarios autorizados por el administrador<br>
          pueden acceder a esta plataforma.
        </p>
      </div>
    </div>
  `;

  // Initialize GSI after DOM is ready
  if (window.google?.accounts?.id) {
    initGoogleSignIn();
  } else {
    // GSI not loaded yet — wait for it
    window.addEventListener('load', () => {
      setTimeout(initGoogleSignIn, 500);
    });
  }
}

function showDeniedScreen(user) {
  const container = document.getElementById('auth-container');
  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-mark">🎓</div>
          EduVerse
        </div>
        <span class="auth-icon-denied">🔒</span>
        <h1 class="auth-title">Sin acceso</h1>
        <p class="auth-subtitle">
          Tu cuenta no tiene permiso para acceder a esta plataforma.
          Contactá al administrador para solicitar acceso.
        </p>
        <div class="auth-denied-email">
          <span>✉️</span> ${user.email}
        </div>
        <button class="btn-secondary-auth" onclick="logout()">
          Cerrar sesión e intentar con otra cuenta
        </button>
      </div>
    </div>
  `;
}

function showLoadingScreen(message = 'Verificando acceso...') {
  const container = document.getElementById('auth-container');
  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card" style="min-height:auto; padding: 48px 44px">
        <div class="auth-logo">
          <div class="auth-logo-mark">🎓</div>
          EduVerse
        </div>
        <div style="margin-top:24px; color:var(--text-secondary); font-size:.95rem">${message}</div>
        <div style="margin-top:20px; display:flex; gap:6px; justify-content:center">
          <div style="width:8px;height:8px;background:var(--accent);border-radius:50%;animation:pulse 1.2s ease infinite 0s"></div>
          <div style="width:8px;height:8px;background:var(--accent);border-radius:50%;animation:pulse 1.2s ease infinite 0.2s"></div>
          <div style="width:8px;height:8px;background:var(--accent);border-radius:50%;animation:pulse 1.2s ease infinite 0.4s"></div>
        </div>
      </div>
    </div>
  `;
}

// ── Google Sign-In ────────────────────────────────────────

function initGoogleSignIn() {
  if (!window.google?.accounts?.id) {
    // GSI failed to load (blocked, offline) — show manual button fallback
    const manualBtn = document.getElementById('manual-google-btn');
    const gsiBtn = document.querySelector('.g_id_signin');
    if (manualBtn) manualBtn.style.display = 'flex';
    if (gsiBtn) gsiBtn.style.display = 'none';
    return;
  }

  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCallback,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    google.accounts.id.renderButton(
      document.getElementById('google-btn-container'),
      {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 320,
      }
    );
  } catch (err) {
    console.error('GSI init error:', err);
    const manualBtn = document.getElementById('manual-google-btn');
    if (manualBtn) manualBtn.style.display = 'flex';
  }
}

function triggerGoogleSignIn() {
  if (window.google?.accounts?.id) {
    google.accounts.id.prompt();
  } else {
    alert('El inicio de sesión con Google no está disponible en este momento. Asegurate de que GOOGLE_CLIENT_ID esté configurado correctamente.');
  }
}

// Called by Google after the user selects their account
async function handleGoogleCallback(response) {
  if (!response?.credential) return;

  showLoadingScreen('Verificando tu cuenta...');

  try {
    // Decode JWT payload (no verification needed — backend does it in production)
    const payload = JSON.parse(atob(response.credential.split('.')[1]));

    const user = {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      sub: payload.sub,
    };

    // Check against allow-list via API
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });

    const data = await res.json();

    if (data.allowed) {
      grantAccess(user);
    } else {
      denyAccess(user);
    }
  } catch (err) {
    console.error('Auth error:', err);
    document.getElementById('auth-container').innerHTML = '';
    showLoginScreen();
    showToast('Error al verificar el acceso. Intentá de nuevo.');
  }
}
// Must be global for Google callback
window.handleGoogleCallback = handleGoogleCallback;

// ── Access control ────────────────────────────────────────

function grantAccess(user) {
  window.currentUser = user;
  saveSession(user);

  // Hide auth, show app
  document.getElementById('auth-container').innerHTML = '';
  document.getElementById('navbar').style.display = '';
  document.getElementById('app').style.display = '';

  renderNavUser(user);

  // Init the app
  if (typeof initApp === 'function') initApp();
}

function denyAccess(user) {
  clearSession();
  window.currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('navbar').style.display = 'none';
  showDeniedScreen(user);
}

function renderNavUser(user) {
  const section = document.getElementById('nav-user-section');
  if (!section) return;

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : user.email[0].toUpperCase();

  section.innerHTML = `
    <div class="nav-user">
      ${user.picture
        ? `<img src="${user.picture}" class="nav-avatar" alt="${user.name}" referrerpolicy="no-referrer" />`
        : `<div class="nav-avatar-placeholder">${initials}</div>`
      }
      <span class="nav-user-name">${user.name || user.email}</span>
      <button class="btn-logout" onclick="logout()">Salir</button>
    </div>
  `;
}

// ── Logout ────────────────────────────────────────────────

function logout() {
  clearSession();
  window.currentUser = null;

  // Revoke Google session
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }

  document.getElementById('app').style.display = 'none';
  document.getElementById('navbar').style.display = 'none';
  showLoginScreen();
}

window.logout = logout;

// ── Init ──────────────────────────────────────────────────

function bootAuth() {
  // Check for existing valid session
  const savedUser = loadSession();

  if (savedUser?.email) {
    // Re-verify against allow-list (in case access was revoked)
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: savedUser.email }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.allowed) {
          grantAccess(savedUser);
        } else {
          clearSession();
          showLoginScreen();
        }
      })
      .catch(() => {
        // Network error — grant access anyway if session exists (offline-friendly)
        grantAccess(savedUser);
      });
  } else {
    showLoginScreen();
  }
}

// Start auth on DOM ready
document.addEventListener('DOMContentLoaded', bootAuth);
