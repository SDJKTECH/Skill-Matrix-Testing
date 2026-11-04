// sessionStorage key AuthContext's login() stashes the pre-SSO-redirect
// window.location.search into, and AuthCallback restores it from, so a
// training-notification email link's ?batch=... survives a full Microsoft
// SSO round trip (which otherwise lands back on a bare "/" -- see
// AuthCallback.jsx). sessionStorage (not localStorage) since this is only
// ever meant to survive one login redirect, not linger across sessions.
export const PENDING_DEEP_LINK_SEARCH_KEY = "pendingDeepLinkSearch";
