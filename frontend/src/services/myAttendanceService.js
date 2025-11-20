import axios from 'axios';
import API_ENDPOINTS from '../config/api';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const getAuthHeaders = async (msalInstance, account) => {
  const request = { scopes: ['User.Read'], account };
  try {
    const res = await msalInstance.acquireTokenSilent(request);
    return { 'Authorization': `Bearer ${res.accessToken}`, 'Content-Type': 'application/json' };
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      return msalInstance.acquireTokenRedirect(request);
    }
    throw e;
  }
};

const wrap = (fn) => async (msalInstance, account, ...args) => {
  const headers = await getAuthHeaders(msalInstance, account);
  return fn(headers, ...args);
};

export const listMyVisits = wrap((headers, { from, to } = {}) =>
  axios.get(API_ENDPOINTS.MY_VISITS, { headers, params: { from, to } })
);

export const getVisit = wrap((headers, id) =>
  axios.get(API_ENDPOINTS.VISIT_ITEM(id), { headers })
);

export const updateVisit = wrap((headers, id, data) =>
  axios.put(API_ENDPOINTS.VISIT_ITEM(id), data, { headers })
);

export const deleteVisit = wrap((headers, id) =>
  axios.delete(API_ENDPOINTS.VISIT_ITEM(id), { headers })
);
