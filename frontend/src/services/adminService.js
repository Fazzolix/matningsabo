import axios from 'axios';
import API_ENDPOINTS from '../config/api';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const getAuthHeaders = async (msalInstance, account) => {
  if (!msalInstance || !account) {
    throw new Error('MSAL instance or user account is not available.');
  }
  const request = { scopes: ['User.Read'], account };
  try {
    const response = await msalInstance.acquireTokenSilent(request);
    return {
      'Authorization': `Bearer ${response.accessToken}`,
      'Content-Type': 'application/json'
    };
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      return msalInstance.acquireTokenRedirect(request);
    }
    throw error;
  }
};

const createApi = (fn) => async (msalInstance, account, ...args) => {
  const headers = await getAuthHeaders(msalInstance, account);
  return fn(headers, ...args);
};

export const getMe = createApi((headers) =>
  axios.get(API_ENDPOINTS.ME, { headers })
);

export const listUsers = createApi((headers, { q, limit } = {}) =>
  axios.get(API_ENDPOINTS.ADMIN_USERS, { headers, params: { q, limit } })
);

export const updateUserRole = createApi((headers, { userId, admin }) =>
  axios.put(`${API_ENDPOINTS.ADMIN_USERS}/${encodeURIComponent(userId)}/role`, { admin }, { headers })
);

