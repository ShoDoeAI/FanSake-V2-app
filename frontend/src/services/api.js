import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  register: (userData) => api.post('/auth/register', userData),
  login: (credentials) => api.post('/auth/login', credentials),
  verify: () => api.get('/auth/verify'),
  refresh: () => api.post('/auth/refresh'),
};

// Artists API calls
export const artistsAPI = {
  getAll: (params) => api.get('/artists', { params }),
  getById: (id) => api.get(`/artists/${id}`),
  updateProfile: (data) => api.put('/artists/profile', data),
  getContent: (id, params) => api.get(`/artists/${id}/content`, { params }),
  getExclusive: (id) => api.get(`/artists/${id}/exclusive`),
  getDashboardStats: () => api.get('/artists/dashboard/stats'),
};

// Fans API calls
export const fansAPI = {
  follow: (artistId) => api.post(`/fans/follow/${artistId}`),
  unfollow: (artistId) => api.delete(`/fans/unfollow/${artistId}`),
  getFollowing: () => api.get('/fans/following'),
  upgradeTier: (data) => api.put('/fans/tier', data),
  getProfile: () => api.get('/fans/profile'),
  updateProfile: (data) => api.put('/fans/profile', data),
  getDashboard: () => api.get('/fans/dashboard'),
};

// Discovery API calls
export const discoveryAPI = {
  getTrending: (params) => api.get('/discovery/trending', { params }),
  getRecommendations: (params) => api.get('/discovery/recommendations', { params }),
  getByGenre: (genre, params) => api.get(`/discovery/genres/${genre}`, { params }),
  recordDiscovery: (data) => api.post('/discovery/record', data),
  search: (params) => api.get('/discovery/search', { params }),
};

// Community API calls
export const communityAPI = {
  getFeed: (params) => api.get('/community/feed', { params }),
  likeContent: (contentId) => api.post(`/community/content/${contentId}/like`),
  shareContent: (contentId) => api.post(`/community/content/${contentId}/share`),
  viewContent: (contentId) => api.post(`/community/content/${contentId}/view`),
  getContent: (contentId) => api.get(`/community/content/${contentId}`),
  getStats: () => api.get('/community/stats'),
  getGenres: () => api.get('/community/genres'),
};

export default api;

