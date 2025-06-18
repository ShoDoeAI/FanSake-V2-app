import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { communityAPI } from '../services/api';
import { 
  UserGroupIcon,
  FireIcon,
  HeartIcon,
  ShareIcon,
  EyeIcon,
  ChatBubbleLeftIcon,
  PlayIcon,
  ClockIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';

const Community = () => {
  const { isAuthenticated, user } = useAuth();
  const [feedContent, setFeedContent] = useState([]);
  const [communityStats, setCommunityStats] = useState(null);
  const [trendingGenres, setTrendingGenres] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [hasMore, setHasMore] = useState(true);

  const filters = [
    { id: 'all', label: 'All Activity', icon: UserGroupIcon },
    { id: 'trending', label: 'Trending', icon: FireIcon },
    { id: 'following', label: 'Following', icon: HeartIcon },
    { id: 'recent', label: 'Recent', icon: ClockIcon },
  ];

  useEffect(() => {
    loadCommunityData();
  }, [activeFilter]);

  const loadCommunityData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Mock data for demo purposes
      const mockFeedContent = [
        {
          _id: '1',
          title: 'Midnight Jam Session',
          artist: { _id: 'a1', username: 'synthwave_producer', artistName: 'NightRider' },
          type: 'music',
          genre: 'Electronic',
          views: 2340,
          likes: 187,
          shares: 23,
          comments: 45,
          isLiked: false,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          description: 'Late night studio vibes with some fresh beats. Let me know what you think!',
          thumbnail: null,
          requiredTier: null
        },
        {
          _id: '2',
          title: 'Behind the Scenes: New Album',
          artist: { _id: 'a2', username: 'indie_soul', artistName: 'Luna Belle' },
          type: 'video',
          genre: 'Indie',
          views: 1890,
          likes: 134,
          shares: 19,
          comments: 67,
          isLiked: true,
          createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
          description: 'Take a peek inside the recording process for my upcoming album. Super Fan exclusive preview!',
          thumbnail: null,
          requiredTier: 'super_fan'
        },
        {
          _id: '3',
          title: 'Live Acoustic Performance',
          artist: { _id: 'a3', username: 'folk_artist', artistName: 'River Song' },
          type: 'music',
          genre: 'Folk',
          views: 3421,
          likes: 298,
          shares: 34,
          comments: 89,
          isLiked: false,
          createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
          description: 'Intimate acoustic set from my living room. Hope it brings you peace.',
          thumbnail: null,
          requiredTier: null
        },
        {
          _id: '4',
          title: 'Producer Tips: Mixing Secrets',
          artist: { _id: 'a4', username: 'beat_master', artistName: 'DJ FlowState' },
          type: 'blog_post',
          genre: 'Hip Hop',
          views: 1567,
          likes: 89,
          shares: 12,
          comments: 34,
          isLiked: false,
          createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          description: 'Sharing some professional mixing techniques that transformed my sound.',
          thumbnail: null,
          requiredTier: 'supporter'
        },
        {
          _id: '5',
          title: 'Collaboration Announcement',
          artist: { _id: 'a5', username: 'rock_band', artistName: 'Thunder Strike' },
          type: 'announcement',
          genre: 'Rock',
          views: 4521,
          likes: 432,
          shares: 67,
          comments: 123,
          isLiked: true,
          createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
          description: 'Excited to announce our collaboration with NightRider! Something epic is coming.',
          thumbnail: null,
          requiredTier: null
        }
      ];
      
      const mockStats = {
        activeUsers: 2847,
        totalContent: 1234,
        totalLikes: 45678,
        totalArtists: 156
      };
      
      const mockGenres = [
        { name: 'Electronic', count: 234 },
        { name: 'Indie', count: 189 },
        { name: 'Hip Hop', count: 167 },
        { name: 'Rock', count: 145 },
        { name: 'Folk', count: 98 },
        { name: 'Jazz', count: 76 }
      ];
      
      // Filter content based on active filter
      let filteredContent = mockFeedContent;
      if (activeFilter === 'trending') {
        filteredContent = mockFeedContent.sort((a, b) => b.views - a.views);
      } else if (activeFilter === 'following' && isAuthenticated) {
        // Show content from followed artists
        filteredContent = mockFeedContent.filter((_, index) => index % 2 === 0);
      } else if (activeFilter === 'recent') {
        filteredContent = mockFeedContent.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      
      setFeedContent(filteredContent);
      setCommunityStats(mockStats);
      setTrendingGenres(mockGenres);
      setHasMore(false);
    } catch (err) {
      console.error('Error loading community data:', err);
      setError('Failed to load community feed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreContent = async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    try {
      const response = await communityAPI.getFeed({
        filter: activeFilter,
        limit: 20,
        offset: feedContent.length
      });
      
      setFeedContent(prev => [...prev, ...(response.data.content || [])]);
      setHasMore(response.data.hasMore || false);
    } catch (err) {
      console.error('Error loading more content:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleContentInteraction = async (contentId, action) => {
    if (!isAuthenticated) return;
    
    try {
      // Update UI optimistically
      setFeedContent(prev => prev.map(item => {
        if (item._id === contentId) {
          switch (action) {
            case 'like':
              return {
                ...item,
                likes: item.isLiked ? item.likes - 1 : item.likes + 1,
                isLiked: !item.isLiked
              };
            case 'share':
              return { ...item, shares: item.shares + 1 };
            case 'view':
              return { ...item, views: item.views + 1 };
            default:
              return item;
          }
        }
        return item;
      }));

      // Make API call
      switch (action) {
        case 'like':
          await communityAPI.likeContent(contentId);
          break;
        case 'share':
          await communityAPI.shareContent(contentId);
          break;
        case 'view':
          await communityAPI.viewContent(contentId);
          break;
      }
    } catch (err) {
      console.error(`Error ${action}ing content:`, err);
      // Revert optimistic update on error
      loadCommunityData();
    }
  };

  const ContentCard = ({ item }) => (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        {item.thumbnail && (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-64 object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
          <div className="flex items-center justify-between">
            <Link 
              to={`/artists/${item.artist._id}`}
              className="text-purple-300 hover:text-purple-200 transition-colors"
            >
              by {item.artist.artistName || item.artist.username}
            </Link>
            <span className="text-sm text-gray-300">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white"
          onClick={() => handleContentInteraction(item._id, 'view')}
        >
          <PlayIcon className="h-6 w-6" />
        </Button>
      </div>
      
      <Card.Body className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
            {item.type}
          </span>
          {item.requiredTier && item.requiredTier !== 'free' && (
            <span className="text-xs bg-gold-100 text-gold-800 px-2 py-1 rounded-full">
              {item.requiredTier} tier
            </span>
          )}
        </div>
        
        {item.description && (
          <p className="text-gray-700 text-sm mb-4 line-clamp-3">
            {item.description}
          </p>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => handleContentInteraction(item._id, 'like')}
              className="flex items-center space-x-1 text-gray-600 hover:text-red-500 transition-colors"
              disabled={!isAuthenticated}
            >
              {item.isLiked ? (
                <HeartIconSolid className="h-5 w-5 text-red-500" />
              ) : (
                <HeartIcon className="h-5 w-5" />
              )}
              <span className="text-sm">{item.likes || 0}</span>
            </button>
            
            <button
              onClick={() => handleContentInteraction(item._id, 'share')}
              className="flex items-center space-x-1 text-gray-600 hover:text-blue-500 transition-colors"
              disabled={!isAuthenticated}
            >
              <ShareIcon className="h-5 w-5" />
              <span className="text-sm">{item.shares || 0}</span>
            </button>
            
            <div className="flex items-center space-x-1 text-gray-500">
              <EyeIcon className="h-5 w-5" />
              <span className="text-sm">{item.views || 0}</span>
            </div>
            
            <div className="flex items-center space-x-1 text-gray-500">
              <ChatBubbleLeftIcon className="h-5 w-5" />
              <span className="text-sm">{item.comments || 0}</span>
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loading size="lg" text="Loading community feed..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Community Feed
          </h1>
          <p className="text-gray-600">
            Discover what the music community is sharing and loving
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Community Stats */}
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center">
                  <ArrowTrendingUpIcon className="h-5 w-5 mr-2" />
                  Community Stats
                </Card.Title>
              </Card.Header>
              <Card.Body className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Active Users</span>
                  <span className="font-semibold text-gray-900">
                    {communityStats?.activeUsers || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Content Shared</span>
                  <span className="font-semibold text-gray-900">
                    {communityStats?.totalContent || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Likes</span>
                  <span className="font-semibold text-gray-900">
                    {communityStats?.totalLikes || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Artists</span>
                  <span className="font-semibold text-gray-900">
                    {communityStats?.totalArtists || 0}
                  </span>
                </div>
              </Card.Body>
            </Card>

            {/* Trending Genres */}
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center">
                  <FireIcon className="h-5 w-5 mr-2" />
                  Trending Genres
                </Card.Title>
              </Card.Header>
              <Card.Body>
                {trendingGenres.length > 0 ? (
                  <div className="space-y-3">
                    {trendingGenres.slice(0, 6).map((genre, index) => (
                      <div key={genre.name} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className={`w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-yellow-500' :
                            index === 1 ? 'bg-gray-400' :
                            index === 2 ? 'bg-orange-600' :
                            'bg-purple-500'
                          }`}>
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {genre.name}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {genre.count} posts
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-4 text-sm">
                    No trending genres yet
                  </p>
                )}
              </Card.Body>
            </Card>

            {/* Join Community CTA */}
            {!isAuthenticated && (
              <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                <Card.Body className="text-center p-6">
                  <UserGroupIcon className="h-12 w-12 text-purple-600 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Join the Community
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Like, share, and discover amazing music with fellow fans
                  </p>
                  <Link to="/register">
                    <Button size="sm" className="w-full">
                      Sign Up Now
                    </Button>
                  </Link>
                </Card.Body>
              </Card>
            )}
          </div>

          {/* Main Feed */}
          <div className="lg:col-span-3">
            {/* Filter Tabs */}
            <div className="border-b border-gray-200 mb-6">
              <nav className="flex space-x-8">
                {filters.map((filter) => {
                  const Icon = filter.icon;
                  const isActive = activeFilter === filter.id;
                  const isDisabled = filter.id === 'following' && !isAuthenticated;
                  
                  return (
                    <button
                      key={filter.id}
                      onClick={() => !isDisabled && setActiveFilter(filter.id)}
                      disabled={isDisabled}
                      className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        isActive
                          ? 'border-purple-500 text-purple-600'
                          : isDisabled
                          ? 'border-transparent text-gray-400 cursor-not-allowed'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{filter.label}</span>
                      {isDisabled && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full ml-2">
                          Login required
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content Feed */}
            {error ? (
              <div className="text-center py-12">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={loadCommunityData}>Try Again</Button>
              </div>
            ) : feedContent.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {feedContent.map((item) => (
                    <ContentCard key={item._id} item={item} />
                  ))}
                </div>

                {/* Load More Button */}
                {hasMore && (
                  <div className="text-center">
                    <Button 
                      onClick={loadMoreContent}
                      loading={isLoadingMore}
                      variant="outline"
                      size="lg"
                    >
                      {isLoadingMore ? 'Loading...' : 'Load More Content'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <UserGroupIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No community content yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Be the first to share something with the community!
                </p>
                <div className="flex justify-center space-x-4">
                  <Link to="/discovery">
                    <Button variant="outline">
                      Discover Music
                    </Button>
                  </Link>
                  <Link to="/artists">
                    <Button>
                      Browse Artists
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Community;

