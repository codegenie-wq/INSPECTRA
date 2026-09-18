/**
 * INSPECTRA Client-Side Auth Guard Bridge
 * Seamlessly interfaces with inspectra-auth.js for backwards compatibility.
 */
(function(global) {
  'use strict';

  if (!global.inspectraAuth) {
    console.warn('[INSPECTRA Auth Guard] inspectra-auth.js should be loaded in <head>');
  }

  // Ensure global.authGuard points to inspectraAuth
  global.authGuard = global.inspectraAuth || {
    getCurrentUser: () => {
      try {
        const u = localStorage.getItem('inspectra_auth_user') || localStorage.getItem('inspectra_current_user');
        return u ? JSON.parse(u) : null;
      } catch (_) {
        return null;
      }
    },
    logout: () => {
      if (global.inspectraAuth) global.inspectraAuth.logout();
      else window.location.replace('/login');
    }
  };

})(typeof window !== 'undefined' ? window : this);
