import axios from 'axios';
import API_ENDPOINTS from '../config/api';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

// This helper function now takes the msalInstance and user account
const getAuthHeaders = async (msalInstance, account) => {
    if (!msalInstance || !account) {
        throw new Error('MSAL instance or user account is not available.');
    }

    const request = {
        scopes: ["User.Read"],
        account: account
    };

    try {
        const response = await msalInstance.acquireTokenSilent(request);
        return {
            'Authorization': `Bearer ${response.accessToken}`,
            'Content-Type': 'application/json'
        };
    } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
            // fallback to interactive method on silent token failure
            console.warn("Silent token acquisition failed. Falling back to redirect.");
            return msalInstance.acquireTokenRedirect(request);
        }
        console.error("Token acquisition error:", error);
        throw error;
    }
};

// Each service function now expects msalInstance and account to be passed in
const createApiService = (request) => async (msalInstance, account, ...args) => {
    try {
        const headers = await getAuthHeaders(msalInstance, account);
        return await request(headers, ...args);
    } catch (error) {
        console.error(`API service error:`, error);
        throw error;
    }
};

export const getHomes = createApiService((headers) =>
    axios.get(API_ENDPOINTS.ALDREBOENDEN, { headers })
);

export const getActivities = createApiService((headers) => 
    axios.get(API_ENDPOINTS.ACTIVITIES, { headers })
);

export const getCompanions = createApiService((headers) =>
    axios.get(API_ENDPOINTS.COMPANIONS, { headers })
);

export const registerVisit = createApiService((headers, data) => 
    axios.post(API_ENDPOINTS.VISITS, data, { headers })
);

export const getStatistics = createApiService((headers, filters) => {
    // Map UI filters to API query parameters
    const params = {};
    if (filters?.from) params.from = filters.from;
    if (filters?.to) params.to = filters.to;
    if (filters?.home_id) params.home = filters.home_id;
    if (filters?.department_id) params.department = filters.department_id;
    if (filters?.offer_status) params.offer_status = filters.offer_status;
    if (filters?.visit_type) params.visit_type = filters.visit_type;
    return axios.get(API_ENDPOINTS.STATISTICS, { headers, params });
});

export const addHome = createApiService((headers, data) =>
    axios.post(API_ENDPOINTS.ALDREBOENDEN, data, { headers })
);

export const addActivity = createApiService((headers, data) => 
    axios.post(API_ENDPOINTS.ACTIVITIES, data, { headers })
);

export const updateActivity = createApiService((headers, { id, name }) => 
    axios.put(API_ENDPOINTS.ACTIVITY_ITEM(id), { name }, { headers })
);

export const deleteActivity = createApiService((headers, { id }) => 
    axios.delete(API_ENDPOINTS.ACTIVITY_ITEM(id), { headers })
);

export const addDepartment = createApiService((headers, { homeId, name }) =>
    axios.post(API_ENDPOINTS.DEPARTMENTS(homeId), { name }, { headers })
);

export const updateDepartment = createApiService((headers, { homeId, departmentId, name, active }) =>
    axios.put(API_ENDPOINTS.DEPARTMENT_ITEM(homeId, departmentId), { name, active }, { headers })
);

export const deleteDepartment = createApiService((headers, { homeId, departmentId }) =>
    axios.delete(API_ENDPOINTS.DEPARTMENT_ITEM(homeId, departmentId), { headers })
);

export const addCompanion = createApiService((headers, data) =>
    axios.post(API_ENDPOINTS.COMPANIONS, data, { headers })
);

export const updateCompanion = createApiService((headers, { id, name }) =>
    axios.put(API_ENDPOINTS.COMPANION_ITEM(id), { name }, { headers })
);

export const deleteCompanion = createApiService((headers, { id }) =>
    axios.delete(API_ENDPOINTS.COMPANION_ITEM(id), { headers })
);
