// During local development, the setupProxy.js will handle redirecting these to the backend.
// In production, the frontend and backend are served from the same origin.
const API_ENDPOINTS = {
  AZURE_CONFIG: `/api/azure-config`,
  AZURE_USER: `/api/azure-user`,
  ME: `/api/me`,
  ALDREBOENDEN: `/api/aldreboenden`,
  ACTIVITIES: `/api/activities`,
  ACTIVITY_ITEM: (id) => `/api/activities/${encodeURIComponent(id)}`,
  COMPANIONS: `/api/companions`,
  COMPANION_ITEM: (id) => `/api/companions/${encodeURIComponent(id)}`,
  DEPARTMENTS: (homeId) => `/api/aldreboenden/${encodeURIComponent(homeId)}/departments`,
  DEPARTMENT_ITEM: (homeId, deptId) => `/api/aldreboenden/${encodeURIComponent(homeId)}/departments/${encodeURIComponent(deptId)}`,
  VISITS: `/api/visits`,
  STATISTICS: `/api/statistics`,
  ADMIN_USERS: `/api/admin/users`,
  // For role updates: `/api/admin/users/:id/role`
  MY_VISITS: `/api/my-visits`,
  VISIT_ITEM: (id) => `/api/visits/${encodeURIComponent(id)}`,
};

export default API_ENDPOINTS;
