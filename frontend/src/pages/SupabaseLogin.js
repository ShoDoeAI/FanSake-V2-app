import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/SupabaseAuthContext';
import { MusicalNoteIcon } from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

const SupabaseLogin = () => {
  const { user, loading, error, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !loading) {
      const from = location.state?.from?.pathname || '/discovery';
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, location.state?.from?.pathname]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear field error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { data, error } = await signIn({
        email: formData.email,
        password: formData.password,
      });
      
      if (error) {
        setFormErrors({ email: error.message });
      } else {
        // Redirect based on user metadata
        const userType = data.user?.user_metadata?.userType || 'fan';
        const redirectPath = userType === 'artist' ? '/artist-dashboard' : '/discovery';
        const from = location.state?.from?.pathname || redirectPath;
        navigate(from, { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      setFormErrors({ email: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link to="/" className="flex justify-center items-center space-x-2 mb-4">
            <MusicalNoteIcon className="h-12 w-12 text-purple-600" />
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              MusicConnect
            </span>
          </Link>
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome back
          </h2>
          <p className="mt-2 text-gray-600">
            Sign in to your account to continue discovering music
          </p>
        </div>

        {/* Login Form */}
        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Global Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Input
              label="Email Address"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Enter your email"
              error={formErrors.email}
              required
            />

            <Input
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              error={formErrors.password}
              required
            />

            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Footer Links */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-purple-600 hover:text-purple-500 transition-colors"
              >
                Sign up here
              </Link>
            </p>
            
            <p className="text-sm">
              <Link
                to="/forgot-password"
                className="text-purple-600 hover:text-purple-500 transition-colors"
              >
                Forgot your password?
              </Link>
            </p>
          </div>
        </Card>

        {/* Note about Supabase */}
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="text-sm font-medium text-blue-900 mb-3">
            Using Supabase Authentication
          </h3>
          <div className="text-xs text-blue-800">
            <p>This app now uses Supabase for authentication.</p>
            <p className="mt-1">Please create an account or use existing Supabase credentials.</p>
          </div>
        </Card>

        {/* Additional Options */}
        <div className="text-center">
          <Link
            to="/discovery"
            className="text-sm text-gray-600 hover:text-purple-600 transition-colors"
          >
            Browse music without signing in →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SupabaseLogin;