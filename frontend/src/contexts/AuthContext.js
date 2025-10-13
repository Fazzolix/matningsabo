import React, { createContext, useState, useEffect, useContext } from 'react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import axios from 'axios';
import API_ENDPOINTS from '../config/api';
import { getMe } from '../services/adminService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [msalInstance, setMsalInstance] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeMsal = async () => {
      try {
        // Hämta Azure AD-konfiguration
        const response = await axios.get(API_ENDPOINTS.AZURE_CONFIG);
        const config = response.data;

        const msalConfig = {
          auth: {
            clientId: config.clientId,
            authority: `https://login.microsoftonline.com/${config.tenantId}`,
            redirectUri: config.redirectUri,
            postLogoutRedirectUri: config.redirectUri,
            navigateToLoginRequestUrl: false
          },
          cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: true
          }
        };

        const instance = new PublicClientApplication(msalConfig);
        await instance.initialize();

        setMsalInstance(instance);

        // Hantera redirect efter inloggning
        const response_1 = await instance.handleRedirectPromise();
        if (response_1) {
          await handleLoginResponse(instance, response_1);
        } else {
          // Försök tyst inloggning
          const accounts = instance.getAllAccounts();
          if (accounts.length > 0) {
            try {
              const silentResponse = await instance.acquireTokenSilent({
                scopes: ['User.Read'],
                account: accounts[0]
              });
              await handleLoginResponse(instance, { 
                account: accounts[0], 
                accessToken: silentResponse.accessToken 
              });
            } catch (err) {
              if (err instanceof InteractionRequiredAuthError) {
                console.log('Tyst inloggning misslyckades');
              }
            }
          }
        }
      } catch (err) {
        console.error('MSAL initialization failed:', err);
        setError('Kunde inte initiera autentisering');
      } finally {
        setLoading(false);
      }
    };

    initializeMsal();
  }, []);

  // Ensure role flags are loaded/refreshed when msalInstance and user are ready
  useEffect(() => {
    const fetchRoles = async () => {
      if (!msalInstance || !user?.account) return;
      try {
        const meRes = await getMe(msalInstance, user.account);
        const flags = meRes.data || {};
        setUser(prev => prev ? { ...prev, is_admin: !!flags.is_admin, is_superadmin: !!flags.is_superadmin } : prev);
      } catch (e) {
        console.warn('Failed to refresh role flags', e);
      }
    };
    fetchRoles();
  }, [msalInstance, user?.account]);

  const handleLoginResponse = async (instance, response) => {
    try {
      const userResponse = await axios.post(API_ENDPOINTS.AZURE_USER, null, {
        headers: {
          'Authorization': `Bearer ${response.accessToken}`
        }
      });

      // Fetch role flags
      let roleFlags = { is_admin: false, is_superadmin: false };
      try {
        if (instance) {
          const meRes = await getMe(instance, response.account);
          roleFlags = meRes.data || roleFlags;
        }
      } catch (e) {
        console.warn('Failed to load role flags, continuing as non-admin.', e);
      }

      setUser({
        ...userResponse.data,
        account: response.account,
        is_admin: !!roleFlags.is_admin,
        is_superadmin: !!roleFlags.is_superadmin
      });

      localStorage.setItem('userName', userResponse.data.name);
      localStorage.setItem('userEmail', userResponse.data.email);
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      setError('Kunde inte hämta användarinformation');
    }
  };

  const login = async () => {
    if (!msalInstance) {
      throw new Error('MSAL not initialized');
    }

    try {
      await msalInstance.loginRedirect({
        scopes: ['User.Read']
      });
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    if (!msalInstance) return;
    try {
      await msalInstance.logoutRedirect();
      setUser(null);
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user,
    msalInstance
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
