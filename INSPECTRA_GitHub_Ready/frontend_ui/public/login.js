/**
 * INSPECTRA Login Page Logic
 * Vercel-Compatible Persistent Authentication
 */

(function() {
  'use strict';

  // Anti-flicker: If the user is already authenticated in localStorage, sync cookie and redirect immediately
  try {
    const existingToken = localStorage.getItem('inspectra_token');
    const existingUser = localStorage.getItem('inspectra_current_user');
    if (existingToken && existingUser) {
      const isHttps = window.location.protocol === 'https:';
      document.cookie = `inspectra_session=${existingToken}; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 3600}${isHttps ? '; Secure' : ''}`;
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrl = urlParams.get('returnUrl');
      const targetUrl = (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('/login')) ? decodeURIComponent(returnUrl) : '/';
      window.location.replace(targetUrl);
      return;
    }
  } catch (_) {}

  const loginForm = document.getElementById('login-form');
  const inputIdentifier = document.getElementById('input-identifier');
  const inputPassword = document.getElementById('input-password');
  const btnSubmit = document.getElementById('btn-login-submit');
  const errorAlert = document.getElementById('auth-error-alert');
  const errorMessage = document.getElementById('auth-error-message');
  const infoAlert = document.getElementById('auth-info-alert');
  const infoMessage = document.getElementById('auth-info-message');
  const btnDemoFill = document.getElementById('btn-demo-fill');

  // Check URL query parameters for session reason or registered notice
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('reason') === 'expired') {
    showError('SESSION EXPIRED. PLEASE LOGIN AGAIN.');
  } else if (urlParams.get('registered') === 'true') {
    showInfo('ACCOUNT CREATED SUCCESSFULLY. PLEASE LOGIN TO CONTINUE.');
  }

  function showError(msg) {
    if (errorAlert && errorMessage) {
      errorMessage.textContent = msg || 'INVALID CREDENTIALS';
      errorAlert.style.display = 'flex';
      if (infoAlert) infoAlert.style.display = 'none';
    }
  }

  function showInfo(msg) {
    if (infoAlert && infoMessage) {
      infoMessage.textContent = msg;
      infoAlert.style.display = 'flex';
      if (errorAlert) errorAlert.style.display = 'none';
    }
  }

  function hideAlerts() {
    if (errorAlert) errorAlert.style.display = 'none';
    if (infoAlert) infoAlert.style.display = 'none';
  }

  // Quick Demo fill
  if (btnDemoFill && inputIdentifier && inputPassword) {
    btnDemoFill.addEventListener('click', () => {
      inputIdentifier.value = 'santhosh';
      inputPassword.value = 'Password123!';
      hideAlerts();
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlerts();

      const identifier = (inputIdentifier?.value || '').trim();
      const password = inputPassword?.value || '';

      if (!identifier || !password) {
        showError('Please enter both Email/Username and Password.');
        return;
      }

      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.querySelector('.btn-text').textContent = 'VERIFYING CREDENTIALS...';
      }

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
          credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'INVALID CREDENTIALS');
        }

        // Cache user info & token centrally for persistent browser authentication
        if (data.user && data.token) {
          if (window.inspectraAuth && typeof window.inspectraAuth.setSession === 'function') {
            window.inspectraAuth.setSession(data.token, data.user);
          } else {
            localStorage.setItem('inspectra_auth_token', data.token);
            localStorage.setItem('inspectra_auth_user', JSON.stringify(data.user));
            localStorage.setItem('inspectra_token', data.token);
            localStorage.setItem('inspectra_current_user', JSON.stringify(data.user));
            const isHttps = window.location.protocol === 'https:';
            document.cookie = `inspectra_session=${data.token}; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 3600}${isHttps ? '; Secure' : ''}`;
          }
        }

        // Redirect to requested returnUrl or Inspection Studio
        const returnUrl = urlParams.get('returnUrl');
        const targetUrl = (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('/login')) ? decodeURIComponent(returnUrl) : '/';
        window.location.replace(targetUrl);

      } catch (err) {
        console.warn('[INSPECTRA Auth Error]:', err);
        showError(err.message || 'INVALID CREDENTIALS');
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.querySelector('.btn-text').textContent = 'AUTHENTICATE & ENTER STUDIO →';
        }
      }
    });
  }
})();
