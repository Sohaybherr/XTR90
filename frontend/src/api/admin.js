import api from './api'

export const getAdminUsers = () => api.get('/admin/users')
export const updateAdminUserRole = (id, role) => api.patch(`/admin/users/${id}/role`, { role })
export const updateAdminUserStatus = (id, status) => api.patch(`/admin/users/${id}/status`, { status })
export const deleteAdminUser = (id) => api.delete(`/admin/users/${id}`)
