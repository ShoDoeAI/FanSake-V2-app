import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MusicalNoteIcon, UserIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

const Register = () => {
  const { register, isAuthenticated, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    userType: 'fan', // 'fan' or 'artist'
    location: '',
    genres: [],
    // Artist specific fields
    artistName: '',
    bio: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available genres
  const availableGenres = [
    'Rock', 'Pop', 'Hip Hop', 'Electronic', 'Jazz', 'Classical', 
    'Country', 'R&B', 'Folk', 'Indie', 'Alternative', 'Blues',
    'Reggae', 'Punk', 'Metal', 'Latin', 'World', 'Experimental'
  ];

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/discovery', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Clear errors when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'genres') {
      setFormData(prev => ({
        ...prev,
        genres: checked 
          ? [...prev.genres, value]
          : prev.genres.filter(genre => genre !== value)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
    
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
    
    // Common validations
    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    if (!formData.location.trim()) {
      errors.location = 'Location is required';
    }
    
    if (formData.genres.length === 0) {
      errors.genres = 'Please select at least one genre';
    }
    
    // Artist specific validations
    if (formData.userType === 'artist') {
      if (!formData.artistName.trim()) {
        errors.artistName = 'Artist name is required';
      }
      if (!formData.bio.trim()) {
        errors.bio = 'Bio is required for artists';
      }
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
      const userData = {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        userType: formData.userType,
        displayName: formData.username, // Backend expects displayName
        location: {
          city: formData.location,
          country: '' // You can add country field later
        },
        genres: formData.genres,
        bio: formData.bio || '',
      };
      
      // Add artist-specific fields
      if (formData.userType === 'artist') {
        userData.artistInfo = {
          stageName: formData.artistName || formData.username,
          description: formData.bio
        };
      }
      
      const result = await register(userData);
      
      if (result.success) {
        navigate('/discovery', { replace: true });
      }
    } catch (err) {
      console.error('Registration error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="flex justify-center items-center space-x-2 mb-4">
            <MusicalNoteIcon className="h-12 w-12 text-purple-600" />
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              MusicConnect
            </span>
          </Link>
          <h2 className="text-3xl font-bold text-gray-900">
            Join the Community
          </h2>
          <p className="mt-2 text-gray-600">
            Connect with artists and fans, discover new music
          </p>
        </div>

        {/* User Type Selection */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            I want to join as:
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <label className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
              formData.userType === 'fan' 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="userType"
                value="fan"
                checked={formData.userType === 'fan'}
                onChange={handleInputChange}
                className="sr-only"
              />
              <UserIcon className="h-6 w-6 text-purple-600 mr-3" />
              <div>
                <div className="font-medium text-gray-900">Music Fan</div>
                <div className="text-sm text-gray-600">Discover artists and exclusive content</div>
              </div>
            </label>
            
            <label className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
              formData.userType === 'artist' 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="userType"
                value="artist"
                checked={formData.userType === 'artist'}
                onChange={handleInputChange}
                className="sr-only"
              />
              <MicrophoneIcon className="h-6 w-6 text-purple-600 mr-3" />
              <div>
                <div className="font-medium text-gray-900">Artist</div>
                <div className="text-sm text-gray-600">Share your music and build your fanbase</div>
              </div>
            </label>
          </div>
        </Card>

        {/* Registration Form */}
        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Global Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Basic Information */}
            <div className="grid md:grid-cols-2 gap-6">
              <Input
                label="Username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="Choose a username"
                error={formErrors.username}
                required
              />

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
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Input
                label="Password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Create a password"
                error={formErrors.password}
                required
              />

              <Input
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your password"
                error={formErrors.confirmPassword}
                required
              />
            </div>

            <Input
              label="Location"
              name="location"
              value={formData.location}
              onChange={handleInputChange}
              placeholder="City, State/Country"
              error={formErrors.location}
              required
            />

            {/* Artist-specific fields */}
            {formData.userType === 'artist' && (
              <>
                <Input
                  label="Artist Name"
                  name="artistName"
                  value={formData.artistName}
                  onChange={handleInputChange}
                  placeholder="Your artist/band name"
                  error={formErrors.artistName}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bio <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleInputChange}
                    placeholder="Tell fans about yourself and your music..."
                    rows={4}
                    className={`w-full px-3 py-2 border rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                      formErrors.bio ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  />
                  {formErrors.bio && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.bio}</p>
                  )}
                </div>
              </>
            )}

            {/* Genre Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Favorite Genres <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableGenres.map((genre) => (
                  <label key={genre} className="flex items-center">
                    <input
                      type="checkbox"
                      name="genres"
                      value={genre}
                      checked={formData.genres.includes(genre)}
                      onChange={handleInputChange}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{genre}</span>
                  </label>
                ))}
              </div>
              {formErrors.genres && (
                <p className="mt-1 text-sm text-red-600">{formErrors.genres}</p>
              )}
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>

          {/* Footer Links */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-purple-600 hover:text-purple-500 transition-colors"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </Card>

        {/* Terms */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-500">
            By signing up, you agree to our{' '}
            <a href="#" className="text-purple-600 hover:text-purple-500">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-purple-600 hover:text-purple-500">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;

