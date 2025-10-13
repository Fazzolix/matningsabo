// During local development, the setupProxy.js will handle redirecting these to the backend.
// In production, the frontend and backend are served from the same origin.
const API_ENDPOINTS = {
  AZURE_CONFIG: `/api/azure-config`,
  AZURE_USER: `/api/azure-user`,
  ME: `/api/me`,
  TRAFFPUNKTER: `/api/traffpunkter`,
  ACTIVITIES: `/api/activities`,
  ACTIVITY_ITEM: (id) => `/api/activities/${encodeURIComponent(id)}`,
  ATTENDANCE: `/api/attendance`,
  STATISTICS: `/api/statistics`,
  ADMIN_USERS: `/api/admin/users`,
  // For role updates: `/api/admin/users/:id/role`
  MY_ATTENDANCE: `/api/my-attendance`,
  ATTENDANCE_ITEM: (id) => `/api/attendance/${encodeURIComponent(id)}`,
};

export default API_ENDPOINTS;
