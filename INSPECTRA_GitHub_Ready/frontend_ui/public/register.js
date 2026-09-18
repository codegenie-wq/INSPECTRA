/**
 * INSPECTRA Operator Registration Page Logic
 */

(function() {
  'use strict';

  const registerForm = document.getElementById('register-form');
  const inputFullName = document.getElementById('input-fullname');
  const inputEmail = document.getElementById('input-email');
  const inputUsername = document.getElementById('input-username');
  const inputPassword = document.getElementById('input-password');
  const inputConfirmPassword = document.getElementById('input-confirm-password');
  const btnSubmit = document.getElementById('btn-register-submit');
  const errorAlert = document.getElementById('register-error-alert');
  const errorMessage = document.getElementById('register-error-message');

  function showError(msg) {
    if (errorAlert && errorMessage) {
      errorMessage.textContent = msg || 'REGISTRATION ERROR';
      errorAlert.style.display = 'flex';
    }
  }

  function hideError() {
    if (errorAlert) errorAlert.style.display = 'none';
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const fullName = (inputFullName?.value || '').trim();
      const email = (inputEmail?.value || '').trim();
      const username = (inputUsername?.value || '').trim();
      const password = inputPassword?.value || '';
      const confirmPassword = inputConfirmPassword?.value || '';

      if (!fullName || !email || !username || !password || !confirmPassword) {
        showError('Please fill out all registration fields.');
        return;
      }

      if (password !== confirmPassword) {
        showError('PASSWORDS DO NOT MATCH. Please re-enter.');
        return;
      }

      if (password.length < 6) {
        showError('Password must be at least 6 characters long.');
        return;
      }

      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.querySelector('.btn-text').textContent = 'ENROLLING OPERATOR...';
      }

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, username, password })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'REGISTRATION FAILED');
        }

        // Redirect to Login with success flag
        window.location.href = '/login?registered=true';

      } catch (err) {
        console.warn('[INSPECTRA Register Error]:', err);
        showError(err.message || 'REGISTRATION FAILED');
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.querySelector('.btn-text').textContent = 'CREATE OPERATOR ACCOUNT →';
        }
      }
    });
  }
})();
