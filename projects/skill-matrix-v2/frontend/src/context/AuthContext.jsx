// src/AuthContext.js
import React, { useEffect, useState, useRef } from "react";
import { SSO_CONFIG } from "../ssoConfig";
import { useSkills } from "./SkillContext";
import { AuthContext } from "./authContext";
import toast from "react-hot-toast";
import axios from "axios";
import { BASE_URL } from "../config/apiConfig";
import { PENDING_DEEP_LINK_SEARCH_KEY } from "../config/deepLinkStorage";

// Helper function to decode JWT token (without verification for client-side)
const decodeJWT = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error decoding JWT:", error);
    return null;
  }
};

const FETCH_USER_TOAST_ID = "fetching-user-details";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const getUserProfileInFlightRef = useRef(false);

  const { clearEmployeeSkills } = useSkills();

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    if (storedToken && !user) {
      setToken(storedToken);
      getUserProfile(storedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Setup axios interceptor to include JWT token on same-origin API calls
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const authToken = token || localStorage.getItem("authToken");
        
        // Endpoints that historically required Authorization (CORS allowlist).
        // Same-origin proxy no longer has CORS constraints — also attach for reports
        // and any relative API path so private functions receive the SSO JWT.
        const endpointsRequiringAuth = [
          'save_employee_v2',
          'save_employee_skill_v2',
          'save_employee_certificate_v2',
          'get_employee_skill_v2',
          'update_manager_email_v2',
          'upload_cv',
          'update_manager_email',
          'save_employee',
          'save_employee_skills',
          'save_employee_certificate',
          'review_skill_request_v2',
          'review_certificate',
          'add_skill_v2',
          // Training nomination request/review writes now derive reviewer
          // identity from Authorization on the backend. Existing read calls
          // remain public-compatible; adding the header here is additive.
          'add_training_v2',
          'get_employee_skill_matrix_report',
          'get_employee_skills_report',
          'get_employee_certificate_report',
          'get_employee_training_report',
        ];
        
        const url = config.url || '';
        const isAbsoluteExternal =
          /^https?:\/\//i.test(url) &&
          !url.includes(window.location.host);
        const isSsoGateway =
          url.includes('jktech-auth-gateway') ||
          url.includes('/graph-token') ||
          url.includes('/verify') ||
          url.includes('/photo');
        const isSameOriginApi =
          !isAbsoluteExternal &&
          !isSsoGateway &&
          (url.startsWith('/') || url.includes(window.location.host));
        const requiresAuth = endpointsRequiringAuth.some(endpoint => url.includes(endpoint));
        
        if (authToken && (requiresAuth || isSameOriginApi)) {
          config.headers.Authorization = `Bearer ${authToken}`;
        }
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Setup response interceptor to handle token expiration globally
    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        // Skip handling 401 errors for graph-token endpoint in local development
        // (these are expected when not authenticated with SSO)
        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isGraphTokenRequest = error?.config?.url?.includes('/graph-token');
        
        if (isGraphTokenRequest && isLocalDev && error?.response?.status === 401) {
          // Silently ignore 401 for graph-token in local dev
          return Promise.reject(error);
        }
        
        // Handle 401/403 errors (token expired or unauthorized).
        // Only meaningful if we actually had a token: pre-login bootstrap reads
        // can legitimately come back 401 and must not clear state or claim the
        // session expired.
        const hadToken = Boolean(token || localStorage.getItem("authToken"));

        if (hadToken && (error?.response?.status === 401 || error?.response?.status === 403)) {
          // Get error message from various possible formats
          const errorData = error?.response?.data;
          const errorMessage = 
            (typeof errorData === 'string' ? errorData : null) ||
            errorData?.error || 
            errorData?.message || 
            error?.message ||
            'Authentication failed';
          
          // Convert to string and check if it's a token expiration error
          const errorStr = String(errorMessage).toLowerCase();
          const isTokenExpired = errorStr.includes('expired') || 
                                 errorStr.includes('token') ||
                                 errorStr.includes('jwt');
          
          if (isTokenExpired) {
            // Clear expired token
            console.log("Token expired - clearing authentication");
            localStorage.removeItem("authToken");
            setToken(null);
            setUser(null);
            
            // Show user-friendly message (only once, avoid duplicates)
            if (!document.querySelector('[data-toast-expired]')) {
              toast.error("Your session has expired. Please log in again.", {
                duration: 5000,
                id: 'token-expired'
              });
            }
          } else {
            // Other auth errors - clear token
            console.log("Authentication error - clearing token");
            localStorage.removeItem("authToken");
            setToken(null);
            setUser(null);
          }
        }
        
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [token]);

  const login = () => {
    // Preserve a training-notification email's ?batch=... (or any other
    // query string) across the SSO round trip -- AuthCallback otherwise
    // lands back on a bare "/", silently dropping the deep link for anyone
    // whose session had already expired when they clicked the email.
    try {
      if (window.location.search) {
        sessionStorage.setItem(PENDING_DEEP_LINK_SEARCH_KEY, window.location.search);
      } else {
        // A plain login (no query string this time) shouldn't replay a stale
        // stash left behind by an earlier abandoned login attempt.
        sessionStorage.removeItem(PENDING_DEEP_LINK_SEARCH_KEY);
      }
    } catch {
      // A storage failure here must never block the redirect below -- losing
      // the deep link is a much smaller problem than losing the ability to log in.
    }
    // Redirect to SSO gateway login
    const loginUrl = SSO_CONFIG.getLoginUrl();
    window.location.href = loginUrl;
  };

  // Handle authentication callback with JWT token
  const handleAuthCallback = async (jwtToken) => {
    if (!jwtToken) {
      toast.error("No authentication token received");
      return;
    }

    // Dev Login's mock JWT is unsigned - server.mjs's proxy now gateway-verifies every
    // Authorization bearer, so storing it as authToken would get all later requests
    // (including this callback's own save_employee_v2 call) rejected before reaching
    // the backend. Keep the admin's real token in place; only decode the mock JWT for
    // getUserProfile's isDevLogin/adminEmail body - the backend re-checks adminEmail's
    // DB role itself, so it never relies on this token being real.
    const isDevLogin = decodeJWT(jwtToken)?.isDevLogin === true;
    if (!isDevLogin) {
      localStorage.setItem("authToken", jwtToken);
      setToken(jwtToken);
    }

    // Get user profile
    await getUserProfile(jwtToken);
  };

  const getUserProfile = async (authToken = null) => {
    const tokenToUse = authToken || token || localStorage.getItem("authToken");

    if (!tokenToUse) {
      console.error("No token available");
      return;
    }

    // Prevent concurrent fetches (e.g. Strict Mode or mount + callback)
    if (getUserProfileInFlightRef.current) {
      return;
    }
    getUserProfileInFlightRef.current = true;

    // Single toast id so multiple calls update the same toast instead of stacking
    toast.loading("Fetching user details...", {
      id: FETCH_USER_TOAST_ID,
      duration: Infinity,
    });

    try {
      // Decode JWT to get user info (JWT should contain user data)
      const decodedToken = decodeJWT(tokenToUse);
      
      if (!decodedToken) {
        throw new Error("Failed to decode JWT token");
      }

      // Use decoded token as primary source of user data
      let profile = decodedToken;

      // Map SSO user data to expected format
      // Handle various possible field names from JWT token (including Azure AD standard claims and SSO gateway format)
      const mappedProfile = {
        displayName: profile.displayName || profile.display_name || profile.name || profile.given_name || profile.preferred_username || "User",
        userPrincipalName: profile.userPrincipalName || profile.user_id || profile.email || profile.user || profile.upn || profile.preferred_username || profile.unique_name || profile.sub || "",
        employeeId: profile.employeeId || profile.employee_id || profile.empId || null,
        department: profile.department || profile.department_name || null,
        jobTitle: profile.jobTitle || profile.job_title || profile.title || null,
        // Check all possible photo URL fields from JWT
        photoUrl: profile.photoUrl || profile.photo_url || profile.picture || profile.avatar || profile.avatar_url || profile.profile_picture || profile.profilePicture || null,
        mail: profile.email || profile.mail || profile.user_id || profile.userPrincipalName || profile.user || profile.preferred_username || profile.unique_name || "",
      };

      let photoUrl = mappedProfile.photoUrl;
      
      // Skip /photo and /me endpoints - they require session cookies which aren't available cross-origin
      // We'll use /graph-token with JWT token instead (which works cross-origin)

      // Try Microsoft Graph API if we have a userPrincipalName and no photo yet
      // This matches the approach from version 1 which used MSAL to get an access token
      // Skip in local development if token is invalid to avoid unnecessary 401 errors
      const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if ((!photoUrl || photoUrl.includes('ui-avatars.com')) && mappedProfile.userPrincipalName) {
        try {
          try {
            const tokenResponse = await axios.get(
              SSO_CONFIG.getGraphTokenUrl(),
              {
                headers: { 
                  Authorization: `Bearer ${tokenToUse}`,
                  'Content-Type': 'application/json',
                },
                timeout: 5000,
              }
            );
            
            if (tokenResponse.data?.access_token) {
              const graphAccessToken = tokenResponse.data.access_token;
              const graphPhotoUrl = `https://graph.microsoft.com/v1.0/me/photo/$value`;
              const graphResponse = await axios.get(graphPhotoUrl, {
                headers: { Authorization: `Bearer ${graphAccessToken}` },
                responseType: 'blob',
                timeout: 5000,
              });
              
              if (graphResponse.data) {
                photoUrl = URL.createObjectURL(graphResponse.data);
              }
            }
          } catch (graphTokenError) {
            // Suppress 401 errors in local development (expected when not authenticated)
            const is401 = graphTokenError?.response?.status === 401;
            if (is401 && isLocalDev) {
              // Silently skip in local dev - will use generated avatar
              console.debug("Skipping Graph token request in local development (401 expected)");
            } else {
              // Check if it's a token expiration error
              const errorData = graphTokenError?.response?.data;
              const errorMessage = 
                (typeof errorData === 'string' ? errorData : null) ||
                errorData?.error || 
                errorData?.message || 
                graphTokenError?.message || '';
              
              if (String(errorMessage).toLowerCase().includes('expired') || 
                  String(errorMessage).toLowerCase().includes('jwt')) {
                // Token expired - clear it
                console.log("Token expired from SSO gateway - clearing authentication");
                localStorage.removeItem("authToken");
                setToken(null);
                setUser(null);
                throw new Error("JWT token expired");
              }
            }
            
            // Fallback: Check if JWT contains an access_token for Graph API
            const accessToken = decodedToken.access_token || decodedToken.accessToken;
            
            if (accessToken) {
              try {
                const graphPhotoUrl = `https://graph.microsoft.com/v1.0/me/photo/$value`;
                const graphResponse = await axios.get(graphPhotoUrl, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                  responseType: 'blob',
                  timeout: 5000,
                });
                
                if (graphResponse.data) {
                  photoUrl = URL.createObjectURL(graphResponse.data);
                }
              } catch {
                // Silently fail - will use generated avatar
              }
            }
          }
        } catch {
          // Silently fail - will use generated avatar
        }
      }

      // Generate avatar as fallback if no photo URL is available
      if (!photoUrl || photoUrl.includes('ui-avatars.com')) {
        const name = encodeURIComponent(mappedProfile.displayName || "User");
        photoUrl = `https://ui-avatars.com/api/?name=${name}&rounded=true&bold=true&background=2563eb&color=fff`;
      }
      
      mappedProfile.photoUrl = photoUrl;
      
      // Ensure we have at least an email/userPrincipalName
      if (!mappedProfile.userPrincipalName && !mappedProfile.mail) {
        if (decodedToken.sub) {
          mappedProfile.userPrincipalName = decodedToken.sub;
          mappedProfile.mail = decodedToken.sub;
        } else {
          const possibleId = Object.values(decodedToken).find(v => typeof v === 'string' && v.includes('@'));
          if (possibleId) {
            mappedProfile.userPrincipalName = possibleId;
            mappedProfile.mail = possibleId;
          } else {
            throw new Error(`JWT token missing required user identifier. Available fields: ${Object.keys(decodedToken).join(", ")}`);
          }
        }
      }

      // Save employee data to backend. For a normal SSO login this is
      // optional (continue even if it fails, user can still use the app).
      // For dev-login it isn't optional — isDevLogin routes the backend to
      // a read-only lookup that 403s/404s on bad input, and that failure
      // must not be swallowed or the admin ends up "logged in" as a
      // fabricated profile instead of seeing the rejection.
      const isDevLogin = profile.isDevLogin === true;
      try {
        const employeeResponse = await axios.post(
          `${BASE_URL}save_employee_v2`,
          {
            ...mappedProfile,
            isDevLogin,
            adminEmail: profile.adminEmail || null,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 10000, // 10 second timeout
          }
        );
        if (employeeResponse.data) {
          mappedProfile.managerEmail = employeeResponse.data.managerEmail;
          mappedProfile.cvUrl = employeeResponse.data.cvPublicUrl;
          mappedProfile.dbEmployeeId = employeeResponse.data.id; // Database employee id (primary key)
          mappedProfile.role = employeeResponse.data.role;
          mappedProfile.isManager = employeeResponse.data.isManager; // True if any employee has this employee as their manager_id
        }
      } catch (err) {
        if (isDevLogin) {
          throw err;
        }
        // Continue even if save fails - user can still use the app
      }

      setUser(mappedProfile);
      toast.success("User details fetched successfully!", {
        id: FETCH_USER_TOAST_ID,
        duration: 3000,
      });

      return mappedProfile;
    } catch (error) {
      let errorMessage = "Failed to fetch user details.";
      if (error?.response) {
        errorMessage = `Server error: ${error.response.status} - ${error.response.data?.error || error.response.statusText}`;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      // Check for token expiration in error message (handles string responses like {"error":"JWT token expired"})
      const errorData = error?.response?.data;
      const errorMsg = 
        (typeof errorData === 'string' ? errorData : null) ||
        (typeof errorData === 'object' && errorData?.error ? errorData.error : null) ||
        error?.message || 
        errorMessage || '';
      
      const isTokenExpired = String(errorMsg).toLowerCase().includes('expired') || 
                            String(errorMsg).toLowerCase().includes('jwt token expired');
      
      if (isTokenExpired || error?.response?.status === 401 || error?.response?.status === 403) {
        console.log("Token expired or auth error - clearing token");
        localStorage.removeItem("authToken");
        setToken(null);
        setUser(null);
        
        if (isTokenExpired) {
          toast.error("Your session has expired. Please log in again.", {
            duration: 5000,
            id: FETCH_USER_TOAST_ID,
          });
        } else {
          toast.error(errorMessage, { id: FETCH_USER_TOAST_ID, duration: 5000 });
        }
      } else {
        toast.error(errorMessage, { id: FETCH_USER_TOAST_ID, duration: 5000 });
      }
    } finally {
      getUserProfileInFlightRef.current = false;
    }
  };

  const logout = async () => {
    // Clear local state first
    setUser(null);
    setToken(null);
    clearEmployeeSkills();
    localStorage.removeItem("authToken");
    localStorage.setItem("hasSeenLanding", "false");
    
    // Show success message
    toast.success("Logged out successfully!", { duration: 2000 });
    
    // Wait a moment for toast to show, then redirect to SSO logout
    // The SSO gateway will handle logout and redirect back to app
    setTimeout(() => {
      window.location.href = SSO_CONFIG.getLogoutUrl();
    }, 500);
  };

  const updateManagerEmail = async (newManagerEmail) => {
    const toastId = toast.loading("Updating manager…", {
      duration: Infinity,
    });

    try {
      if (
        newManagerEmail.trim().toLowerCase() ===
        user.userPrincipalName.toLowerCase()
      ) {
        toast.error("You cannot set yourself as your own manager.", {
          id: toastId,
          duration: 5000,
        });
        return;
      }

      // Use the v2 endpoint
      const res = await axios.post(`${BASE_URL}update_manager_email_v2`, {
        email: user.mail || user.userPrincipalName,
        managerEmail: newManagerEmail,
      });

      if (res.status === 200 && res.data) {
        // Update user state with the actual response data from backend
        setUser((prevUser) => ({
          ...prevUser,
          managerEmail: res.data.managerEmail || newManagerEmail,
        }));

        toast.success("Manager updated", { id: toastId, duration: 3000 });
      } else {
        toast.error("Failed to update manager email. Please try again.", {
          id: toastId,
          duration: 5000,
        });
      }
    } catch (error) {
      // Show specific error message from backend if available
      const errorMessage = error?.response?.data?.error || 
                          "An unexpected error occurred while updating manager email.";
      
      // Provide helpful hints for common errors
      let displayMessage = errorMessage;
      if (errorMessage.includes("cannot be auto-created")) {
        displayMessage = `${errorMessage} Only @jktech.com emails can be auto-created.`;
      } else if (errorMessage.includes("not found")) {
        displayMessage = `${errorMessage} Please ensure the manager email is correct.`;
      }
      
      toast.error(displayMessage, {
        id: toastId,
        duration: 6000,
      });
    }
  };

  const uploadCV = async (cvFile) => {
    if (!cvFile) return toast.error("Please select a file first.");
    if (!user?.employeeId) return toast.error("Employee ID missing.");

    // Show start processing toast
    const toastId = toast.loading("Uploading CV...");

    const formData = new FormData();
    formData.append("file", cvFile);
    formData.append("employeeEmail", user.userPrincipalName);

    try {
      const response = await axios.post(`${BASE_URL}upload_cv`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data?.cvUrl) {
        const updatedUser = { ...user, cvUrl: response.data.cvUrl };
        setUser(updatedUser);

        toast.success("CV uploaded successfully!", { id: toastId });
        return response.data.cvUrl;
      } else {
        toast.error("Upload failed. Please try again.", { id: toastId });
      }
    } catch {
      toast.error("Error uploading CV.", { id: toastId });
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, setUser, updateManagerEmail, uploadCV, handleAuthCallback, token }}
    >
      {children}
    </AuthContext.Provider>
  );
};
