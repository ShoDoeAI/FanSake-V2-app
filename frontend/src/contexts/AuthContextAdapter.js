import React from 'react';
import { useAuth as useSupabaseAuth } from './SupabaseAuthContext';

// Create a context that mimics the old AuthContext API
const AuthContext = React.createContext({});

export const useAuth = () => React.useContext(AuthContext);

export const AuthContextAdapter = ({ children }) => {
  const supabaseAuth = useSupabaseAuth();
  
  // Adapt Supabase auth to match the old API
  const adaptedAuth = {
    isAuthenticated: !!supabaseAuth.user,
    user: supabaseAuth.user ? {
      _id: supabaseAuth.user.id,
      email: supabaseAuth.user.email,
      username: supabaseAuth.user.user_metadata?.username || supabaseAuth.user.email.split('@')[0],
      displayName: supabaseAuth.user.user_metadata?.displayName || 'User',
      userType: supabaseAuth.user.user_metadata?.userType || 'fan',
      ...supabaseAuth.user.user_metadata
    } : null,
    isLoading: supabaseAuth.loading,
    error: supabaseAuth.error,
    
    login: async ({ email, password }) => {
      const { data, error } = await supabaseAuth.signIn({ email, password });
      return {
        success: !error,
        user: data?.user ? {
          _id: data.user.id,
          email: data.user.email,
          userType: data.user.user_metadata?.userType || 'fan',
          ...data.user.user_metadata
        } : null,
        error
      };
    },
    
    logout: supabaseAuth.signOut,
    clearError: () => {}, // Supabase handles this automatically
    
    isArtist: () => {
      return supabaseAuth.user?.user_metadata?.userType === 'artist';
    },
    
    isFan: () => {
      return !supabaseAuth.user || supabaseAuth.user?.user_metadata?.userType === 'fan';
    }
  };
  
  return (
    <AuthContext.Provider value={adaptedAuth}>
      {children}
    </AuthContext.Provider>
  );
};