import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/SupabaseAuthContext';
import Loading from './ui/Loading';

const ProtectedRoute = ({ children, userType }) => {
  const { user, loading } = useAuth();
  const isAuthenticated = !!user;
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loading size="lg" text="Checking authentication..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check user type if specified
  if (userType && user?.user_metadata?.userType !== userType) {
    // Redirect to appropriate dashboard based on user type
    const redirectPath = user?.user_metadata?.userType === 'artist' ? '/artist-dashboard' : '/fan-dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default ProtectedRoute;

