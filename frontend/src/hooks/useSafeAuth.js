import { useContext } from 'react';
import { useAuth } from '../contexts/AuthContextAdapter';

export const useSafeAuth = () => {
  try {
    const auth = useAuth();
    return auth;
  } catch (error) {
    // Return a default auth state if context is not available
    console.warn('Auth context not available, using default state');
    return {
      isAuthenticated: false,
      user: null,
      isLoading: true,
      error: null,
      login: async () => ({ success: false }),
      logout: async () => {},
      clearError: () => {},
      isArtist: () => false,
      isFan: () => true
    };
  }
};