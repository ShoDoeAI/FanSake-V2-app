import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { artistsAPI, fansAPI } from '../services/api';
import { 
  MapPinIcon, 
  UserPlusIcon, 
  UserMinusIcon,
  StarIcon,
  PlayIcon,
  HeartIcon,
  ShareIcon,
  EyeIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';

const ArtistProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, isFan, getFanTier } = useAuth();
  
  const [artist, setArtist] = useState(null);
  const [content, setContent] = useState([]);
  const [exclusiveContent, setExclusiveContent] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('content');
  const [error, setError] = useState(null);

  const fanTier = getFanTier();

  useEffect(() => {
    loadArtistData();
  }, [id]);

  const loadArtistData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load artist profile
      const artistResponse = await artistsAPI.getById(id);
      setArtist(artistResponse.data);
      
      // Check if following (for authenticated fans)
      if (isAuthenticated && isFan()) {
        setIsFollowing(artistResponse.data.isFollowing || false);
      }
      
      // Load public content
      const contentResponse = await artistsAPI.getContent(id, { limit: 20 });
      setContent(contentResponse.data.content || []);
      
      // Load exclusive content if authenticated and fan
      if (isAuthenticated && isFan()) {
        try {
          const exclusiveResponse = await artistsAPI.getExclusive(id);
          setExclusiveContent(exclusiveResponse.data.content || []);
        } catch (err) {
          // User might not have access to exclusive content
          console.log('No exclusive content access:', err);
        }
      }
      
    } catch (err) {
      console.error('Error loading artist data:', err);
      if (err.response?.status === 404) {
        setError('Artist not found');
      } else {
        setError('Failed to load artist profile');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    if (!isFan()) {
      return;
    }
    
    setIsFollowLoading(true);
    
    try {
      if (isFollowing) {
        await fansAPI.unfollow(id);
        setIsFollowing(false);
        setArtist(prev => ({
          ...prev,
          followerCount: (prev.followerCount || 0) - 1
        }));
      } else {
        await fansAPI.follow(id);
        setIsFollowing(true);
        setArtist(prev => ({
          ...prev,
          followerCount: (prev.followerCount || 0) + 1
        }));
      }
    } catch (err) {
      console.error('Error following/unfollowing artist:', err);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const ContentCard = ({ item, isExclusive = false }) => {
    const hasAccess = !isExclusive || 
      (isAuthenticated && isFan() && 
       (item.requiredTier === 'free' || 
        (fanTier === 'superfan' && ['free', 'premium', 'superfan'].includes(item.requiredTier)) ||
        (fanTier === 'premium' && ['free', 'premium'].includes(item.requiredTier))));

    return (
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <div className="relative">
          {item.thumbnail && (
            <img
              src={item.thumbnail}
              alt={item.title}
              className={`w-full h-48 object-cover ${!hasAccess ? 'blur-sm' : ''}`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          
          {!hasAccess && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="text-center text-white">
                <LockClosedIcon className="h-12 w-12 mx-auto mb-2" />
                <p className="text-sm font-medium">
                  {item.requiredTier} tier required
                </p>
              </div>
            </div>
          )}
          
          <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-lg font-semibold text-white mb-1">{item.title}</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-200">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
              {isExclusive && (
                <span className="text-xs bg-gold-500 text-white px-2 py-1 rounded-full">
                  Exclusive
                </span>
              )}
            </div>
          </div>
          
          {hasAccess && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white"
            >
              <PlayIcon className="h-5 w-5" />
            </Button>
          )}
        </div>
        
        <Card.Body className="pb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
              {item.type}
            </span>
            {item.requiredTier && item.requiredTier !== 'free' && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                {item.requiredTier}
              </span>
            )}
          </div>
          
          {item.description && hasAccess && (
            <p className="text-gray-700 text-sm mb-4 line-clamp-2">
              {item.description}
            </p>
          )}
          
          {hasAccess && isAuthenticated && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1 text-gray-500">
                <HeartIcon className="h-5 w-5" />
                <span className="text-sm">{item.likes || 0}</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-500">
                <ShareIcon className="h-5 w-5" />
                <span className="text-sm">{item.shares || 0}</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-500">
                <EyeIcon className="h-5 w-5" />
                <span className="text-sm">{item.views || 0}</span>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loading size="lg" text="Loading artist profile..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{error}</h2>
          <Button onClick={() => navigate('/artists')}>
            Browse Artists
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center md:items-end space-y-6 md:space-y-0 md:space-x-8">
            {/* Artist Avatar */}
            <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center text-4xl font-bold">
              {(artist.artistName || artist.username).charAt(0).toUpperCase()}
            </div>
            
            {/* Artist Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl font-bold mb-2">
                {artist.artistName || artist.username}
              </h1>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start space-x-4 mb-4 text-purple-100">
                <div className="flex items-center space-x-1">
                  <MapPinIcon className="h-5 w-5" />
                  <span>{artist.location}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <UserPlusIcon className="h-5 w-5" />
                  <span>{artist.followerCount || 0} followers</span>
                </div>
                <div className="flex items-center space-x-1">
                  <StarIcon className="h-5 w-5" />
                  <span>{artist.totalLikes || 0} likes</span>
                </div>
              </div>
              
              {/* Genres */}
              <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-6">
                {artist.genres?.map((genre) => (
                  <span
                    key={genre}
                    className="bg-white/20 px-3 py-1 rounded-full text-sm"
                  >
                    {genre}
                  </span>
                ))}
              </div>
              
              {/* Bio */}
              {artist.bio && (
                <p className="text-purple-100 max-w-2xl">
                  {artist.bio}
                </p>
              )}
            </div>
            
            {/* Follow Button */}
            {isAuthenticated && isFan() && (
              <div className="flex-shrink-0">
                <Button
                  onClick={handleFollow}
                  loading={isFollowLoading}
                  variant={isFollowing ? "outline" : "secondary"}
                  size="lg"
                  className={isFollowing 
                    ? "border-white text-white hover:bg-white hover:text-purple-600" 
                    : "bg-white text-purple-600 hover:bg-gray-50"
                  }
                >
                  {isFollowing ? (
                    <>
                      <UserMinusIcon className="h-5 w-5 mr-2" />
                      Unfollow
                    </>
                  ) : (
                    <>
                      <UserPlusIcon className="h-5 w-5 mr-2" />
                      Follow
                    </>
                  )}
                </Button>
              </div>
            )}
            
            {!isAuthenticated && (
              <div className="flex-shrink-0">
                <Button
                  onClick={() => navigate('/login')}
                  variant="secondary"
                  size="lg"
                  className="bg-white text-purple-600 hover:bg-gray-50"
                >
                  Sign in to Follow
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 mb-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('content')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'content'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Public Content ({content.length})
            </button>
            
            {isAuthenticated && isFan() && (
              <button
                onClick={() => setActiveTab('exclusive')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'exclusive'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Exclusive Content ({exclusiveContent.length})
              </button>
            )}
          </nav>
        </div>

        {/* Content Grid */}
        <div className="pb-12">
          {activeTab === 'content' && (
            <>
              {content.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {content.map((item) => (
                    <ContentCard key={item._id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600">No public content available yet.</p>
                </div>
              )}
            </>
          )}
          
          {activeTab === 'exclusive' && (
            <>
              {!isAuthenticated ? (
                <div className="text-center py-12">
                  <LockClosedIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Sign in to access exclusive content
                  </h3>
                  <Button onClick={() => navigate('/login')}>
                    Sign In
                  </Button>
                </div>
              ) : !isFan() ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">
                    Only fans can access exclusive content.
                  </p>
                </div>
              ) : exclusiveContent.length > 0 ? (
                <>
                  {/* Fan Tier Info */}
                  <div className="mb-6">
                    <Card className="bg-purple-50 border-purple-200">
                      <Card.Body className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-purple-900">
                              Your current tier: <span className="capitalize">{fanTier}</span>
                            </p>
                            <p className="text-xs text-purple-700">
                              Access to {fanTier === 'free' ? 'free' : fanTier === 'premium' ? 'free and premium' : 'all'} content
                            </p>
                          </div>
                          {fanTier !== 'superfan' && (
                            <Button size="sm" variant="outline">
                              Upgrade Tier
                            </Button>
                          )}
                        </div>
                      </Card.Body>
                    </Card>
                  </div>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {exclusiveContent.map((item) => (
                      <ContentCard key={item._id} item={item} isExclusive={true} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600">No exclusive content available yet.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArtistProfile;

