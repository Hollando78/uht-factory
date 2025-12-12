import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { authAPI, setApiKey, clearApiKey } from '../services/api';

export interface User {
  id: string;
  email: string;
  verified: boolean;
  created_at: string;
  last_login?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  apiKey: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; accessToken: string; apiKey?: string } }
  | { type: 'LOGOUT' }
  | { type: 'SET_USER'; payload: User }
  | { type: 'TOKEN_REFRESH'; payload: string }
  | { type: 'SET_API_KEY'; payload: string };

interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  clearError: () => void;
  getAccessToken: () => string | null;
}

const AUTH_STORAGE_KEY = 'uht_auth';

// Load initial state from localStorage
const loadAuthState = (): { accessToken: string | null; user: User | null; apiKey: string | null } => {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        accessToken: parsed.accessToken || null,
        user: parsed.user || null,
        apiKey: parsed.apiKey || null
      };
    }
  } catch {
    // Invalid stored data
  }
  return { accessToken: null, user: null, apiKey: null };
};

// Save auth state to localStorage
const saveAuthState = (accessToken: string | null, user: User | null, apiKey: string | null = null) => {
  try {
    if (accessToken && user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accessToken, user, apiKey }));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Failed to save auth state:', error);
  }
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
  apiKey: null,
  isAuthenticated: false,
  isLoading: true, // Start loading to check for existing session
  error: null
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'LOGIN_SUCCESS':
      saveAuthState(action.payload.accessToken, action.payload.user, action.payload.apiKey || null);
      return {
        ...state,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        apiKey: action.payload.apiKey || state.apiKey,
        isAuthenticated: true,
        isLoading: false,
        error: null
      };

    case 'LOGOUT':
      saveAuthState(null, null, null);
      return {
        ...state,
        user: null,
        accessToken: null,
        apiKey: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      };

    case 'SET_USER':
      return { ...state, user: action.payload };

    case 'TOKEN_REFRESH':
      saveAuthState(action.payload, state.user, state.apiKey);
      return { ...state, accessToken: action.payload };

    case 'SET_API_KEY':
      saveAuthState(state.accessToken, state.user, action.payload);
      return { ...state, apiKey: action.payload };

    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const { accessToken, user, apiKey } = loadAuthState();

      if (accessToken && user) {
        // Try to validate the token by fetching user info
        try {
          const currentUser = await authAPI.me(accessToken);
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: { user: currentUser, accessToken, apiKey: apiKey || undefined }
          });
          // Restore API key to separate storage for backward compatibility
          if (apiKey) {
            setApiKey(apiKey);
          }
        } catch {
          // Token invalid, try to refresh
          try {
            const tokens = await authAPI.refresh();
            const currentUser = await authAPI.me(tokens.access_token);
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: { user: currentUser, accessToken: tokens.access_token, apiKey: apiKey || undefined }
            });
            // Restore API key to separate storage for backward compatibility
            if (apiKey) {
              setApiKey(apiKey);
            }
          } catch {
            // Refresh failed, clear session
            dispatch({ type: 'LOGOUT' });
            clearApiKey();
          }
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkSession();
  }, []);

  // Listen for token refresh events from axios interceptor
  useEffect(() => {
    const handleTokenRefreshed = (event: CustomEvent<{ accessToken: string }>) => {
      const { accessToken } = event.detail;
      dispatch({ type: 'TOKEN_REFRESH', payload: accessToken });
    };

    const handleTokenRefreshFailed = () => {
      dispatch({ type: 'LOGOUT' });
      clearApiKey();
    };

    window.addEventListener('tokenRefreshed', handleTokenRefreshed as EventListener);
    window.addEventListener('tokenRefreshFailed', handleTokenRefreshFailed);

    return () => {
      window.removeEventListener('tokenRefreshed', handleTokenRefreshed as EventListener);
      window.removeEventListener('tokenRefreshFailed', handleTokenRefreshFailed);
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const tokens = await authAPI.login(email, password);
      const user = await authAPI.me(tokens.access_token);

      let apiKey: string | undefined = undefined;

      // Auto-load user's API key after successful login
      try {
        const keysResponse = await authAPI.getMyApiKeys(tokens.access_token);
        if (keysResponse.count > 0 && keysResponse.api_keys.length > 0) {
          // User has existing API key(s) - but we can't retrieve the plaintext value
          // Check if one is already stored from previous session
          const { apiKey: storedKey } = loadAuthState();
          if (storedKey) {
            console.log('Restoring API key from previous session');
            apiKey = storedKey;
          } else {
            // User has keys but none stored locally (e.g., cleared cache, new device)
            // Auto-generate a new API key for convenience
            console.log('User has API keys but none stored locally. Auto-generating new key...');
            const keyResponse = await authAPI.generateMyApiKey(tokens.access_token);
            if (keyResponse.api_key) {
              apiKey = keyResponse.api_key;
              console.log('API key auto-generated for returning user!');
            }
          }
        } else {
          // No API keys exist - auto-generate one
          console.log('No API keys found for user. Auto-generating...');
          const keyResponse = await authAPI.generateMyApiKey(tokens.access_token);
          if (keyResponse.api_key) {
            apiKey = keyResponse.api_key;
            console.log('API key auto-generated and saved!');
          }
        }
      } catch (keyError) {
        console.error('Failed to load/generate API key:', keyError);
        // Don't fail login if API key setup fails
      }

      // Store API key in separate storage for backward compatibility
      if (apiKey) {
        setApiKey(apiKey);
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user, accessToken: tokens.access_token, apiKey }
      });

      return true;
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Login failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
      return false;
    }
  }, []);

  const register = useCallback(async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      await authAPI.register(email, password);
      dispatch({ type: 'SET_LOADING', payload: false });
      return {
        success: true,
        message: 'Registration successful! Please check your email to verify your account.'
      };
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Registration failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (state.accessToken) {
        await authAPI.logout(state.accessToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear both auth state and API key from separate storage
      dispatch({ type: 'LOGOUT' });
      clearApiKey();
    }
  }, [state.accessToken]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const tokens = await authAPI.refresh();
      dispatch({ type: 'TOKEN_REFRESH', payload: tokens.access_token });
      return true;
    } catch {
      dispatch({ type: 'LOGOUT' });
      return false;
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const getAccessToken = useCallback(() => {
    return state.accessToken;
  }, [state.accessToken]);

  const value: AuthContextType = {
    state,
    login,
    register,
    logout,
    refreshToken,
    clearError,
    getAccessToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
