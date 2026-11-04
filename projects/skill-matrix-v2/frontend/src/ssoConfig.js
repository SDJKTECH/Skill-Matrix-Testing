// SSO Gateway Configuration
export const SSO_CONFIG = {
  // Production SSO Gateway URL
  SSO_URL: import.meta.env.VITE_SSO_URL || "https://jktech-auth-gateway-140475459295.asia-south1.run.app",
  
  // Get the callback URL for this app
  getCallbackUrl: () => {
    // Use root URL with token parameter - App.jsx will handle it
    return `${window.location.origin}/`;
  },
  
  // Get the login URL with return URL
  getLoginUrl: () => {
    const callbackUrl = SSO_CONFIG.getCallbackUrl();
    return `${SSO_CONFIG.SSO_URL}/login?app_url=${encodeURIComponent(callbackUrl)}`;
  },
  
  // Get logout URL with redirect back to app
  getLogoutUrl: () => {
    const redirectUrl = `${window.location.origin}/`;
    return `${SSO_CONFIG.SSO_URL}/logout?redirect_url=${encodeURIComponent(redirectUrl)}`;
  },
  
  // Get token verification URL
  getVerifyUrl: () => {
    return `${SSO_CONFIG.SSO_URL}/verify`;
  },
  
  // Get user info URL
  getMeUrl: () => {
    return `${SSO_CONFIG.SSO_URL}/me`;
  },

  // Get user photo URL (if available)
  getPhotoUrl: () => {
    return `${SSO_CONFIG.SSO_URL}/photo`;
  },

  // Get Microsoft Graph access token (if SSO gateway provides it)
  getGraphTokenUrl: () => {
    return `${SSO_CONFIG.SSO_URL}/graph-token`;
  }
};
