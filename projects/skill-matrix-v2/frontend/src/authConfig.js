// src/authConfig.js
export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID, // Replace with your Azure AD app's Client ID
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`, 
    redirectUri: import.meta.env.VITE_REDIRECT_URI,

  },
  cache: {
    cacheLocation: "localStorage", // or "sessionStorage"
    storeAuthStateInCookie: true, // Set true if issues in IE/Edge
  },
};

export const loginRequest = {
  scopes: ["User.Read"], // Minimum scope to read user profile
};
