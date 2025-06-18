import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { discoveryAPI } from '../services/api';
import { 
  MagnifyingGlassIcon, 
  FireIcon, 
  SparklesIcon,
  PlayIcon,
  HeartIcon,
  ShareIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';

const Discovery = () => {
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [content, setContent] = useState([]);
  const [artists, setArtists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const genres = [
    'All', 'Rock', 'Pop', 'Hip Hop', 'Electronic', 'Jazz', 'Classical',
    'Country', 'R&B', 'Folk', 'Indie', 'Alternative', 'Blues', 'Metal'
  ];

  const tabs = [
    { id: 'trending', label: 'Trending', icon: FireIcon },
    { id: 'recommendations', label: 'For You', icon: SparklesIcon },
    { id: 'search', label: 'Search', icon: MagnifyingGlassIcon },
  ];

  useEffect(() => {
    loadContent();
  }, [activeTab, selectedGenre]);

  const loadContent = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Mock data for demo purposes
      const mockContent = [
        {
          _id: '1',
          title: 'Neon Dreams',
          artist: { _id: 'a1', username: 'synthwave_producer', artistName: 'NightRider' },
          type: 'music',
          genre: 'Electronic',
          views: 15420,
          likes: 892,
          shares: 45,
          duration: 245,
          isExclusive: false,
          isLiked: false,
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          thumbnail: null,
          description: 'A mesmerizing journey through synthetic soundscapes and pulsating beats.'
        },
        {
          _id: '2',
          title: 'Coffee Shop Sessions',
          artist: { _id: 'a2', username: 'indie_soul', artistName: 'Luna Belle' },
          type: 'music',
          genre: 'Indie',
          views: 8934,
          likes: 567,
          shares: 23,
          duration: 198,
          isExclusive: true,
          tierRequired: 'supporter',
          isLiked: true,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          thumbnail: null,
          description: 'Intimate acoustic melodies recorded live in a cozy coffee shop setting.'
        },
        {
          _id: '3',
          title: 'Live from the Studio',
          artist: { _id: 'a3', username: 'rock_legends', artistName: 'The Midnight Band' },
          type: 'video',
          genre: 'Rock',
          views: 23156,
          likes: 1234,
          shares: 89,
          duration: 1820,
          isExclusive: false,
          isLiked: false,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          thumbnail: null,
          description: 'Behind-the-scenes look at our latest recording session with exclusive interviews.'
        },
        {
          _id: '4',
          title: 'Behind the Beat: Producer Talk',
          artist: { _id: 'a4', username: 'beat_master', artistName: 'DJ FlowState' },
          type: 'blog_post',
          genre: 'Hip Hop',
          views: 4521,
          likes: 298,
          shares: 12,
          isExclusive: true,
          requiredTier: 'super_fan',
          isLiked: false,
          createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
          thumbnail: null,
          description: 'Deep dive into the production techniques behind my latest beats. Super Fan exclusive!'
        },
        {
          _id: '5',
          title: 'Sunset Melodies',
          artist: { _id: 'a5', username: 'chill_vibes', artistName: 'Ocean Breeze' },
          type: 'music',
          genre: 'Ambient',
          views: 12890,
          likes: 756,
          shares: 34,
          duration: 312,
          isExclusive: false,
          isLiked: false,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          thumbnail: null,
          description: 'Peaceful ambient sounds perfect for relaxation and meditation.'
        }
      ];
      
      const mockArtists = [
        {
          _id: 'a1',
          username: 'synthwave_producer',
          artistName: 'NightRider',
          location: 'Los Angeles, CA',
          genres: ['Electronic', 'Synthwave', 'Ambient'],
          followers: 1240
        },
        {
          _id: 'a2',
          username: 'indie_soul',
          artistName: 'Luna Belle',
          location: 'Nashville, TN',
          genres: ['Indie', 'Folk', 'Singer-Songwriter'],
          followers: 890
        },
        {
          _id: 'a3',
          username: 'rock_legends',
          artistName: 'The Midnight Band',
          location: 'Seattle, WA',
          genres: ['Rock', 'Alternative', 'Grunge'],
          followers: 2340
        },
        {
          _id: 'a4',
          username: 'beat_master',
          artistName: 'DJ FlowState',
          location: 'Atlanta, GA',
          genres: ['Hip Hop', 'Trap', 'Electronic'],
          followers: 1560
        }
      ];

      // Filter by genre if selected
      let filteredContent = mockContent;
      let filteredArtists = mockArtists;
      
      if (selectedGenre && selectedGenre !== 'All') {
        filteredContent = mockContent.filter(item => 
          item.genre === selectedGenre
        );
        filteredArtists = mockArtists.filter(artist => 
          artist.genres.includes(selectedGenre)
        );
      }

      switch (activeTab) {
        case 'trending':
          setContent(filteredContent);
          setArtists(filteredArtists);
          break;
        case 'recommendations':
          if (isAuthenticated) {
            // Show personalized content for authenticated users
            const personalizedContent = filteredContent.map(item => ({
              ...item,
              reason: 'Based on your listening history'
            }));
            setContent(personalizedContent);
            setArtists(filteredArtists);
          } else {
            // Show popular content for non-authenticated users
            setContent(filteredContent);
            setArtists(filteredArtists);
          }
          break;
        case 'search':
          // Search will be handled separately
          setContent([]);
          setArtists([]);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('Error loading content:', err);
      setError('Failed to load content. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await discoveryAPI.search({
        q: searchQuery,
        limit: 20,
        ...(selectedGenre && selectedGenre !== 'All' && { genre: selectedGenre }),
      });
      
      setContent(response.data.content || []);
      setArtists(response.data.artists || []);
    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentInteraction = async (contentId, action) => {
    if (!isAuthenticated) return;
    
    try {
      // Update UI optimistically
      setContent(prev => prev.map(item => {
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
          await discoveryAPI.likeContent(contentId);
          break;
        case 'share':
          await discoveryAPI.shareContent(contentId);
          break;
        case 'view':
          await discoveryAPI.viewContent(contentId);
          break;
      }
    } catch (err) {
      console.error(`Error ${action}ing content:`, err);
      // Revert optimistic update on error
      loadContent();
    }
  };

  const ContentCard = ({ item }) => (
    <Card key={item._id} className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        {item.thumbnail && (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-48 object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="text-lg font-semibold text-white mb-1">{item.title}</h3>
          <p className="text-sm text-gray-200">
            by <Link to={`/artists/${item.artist._id}`} className="text-purple-300 hover:text-purple-200">
              {item.artist.artistName || item.artist.username}
            </Link>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white"
          onClick={() => handleContentInteraction(item._id, 'view')}
        >
          <PlayIcon className="h-5 w-5" />
        </Button>
      </div>
      
      <Card.Body className="pb-4">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
            {item.type}
          </span>
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
        
        {item.description && (
          <p className="text-gray-700 text-sm mb-4 line-clamp-2">
            {item.description}
          </p>
        )}
        
        {isAuthenticated && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleContentInteraction(item._id, 'like')}
                className="flex items-center space-x-1 text-gray-600 hover:text-red-500 transition-colors"
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
              >
                <ShareIcon className="h-5 w-5" />
                <span className="text-sm">{item.shares || 0}</span>
              </button>
              
              <div className="flex items-center space-x-1 text-gray-500">
                <EyeIcon className="h-5 w-5" />
                <span className="text-sm">{item.views || 0}</span>
              </div>
            </div>
            
            {item.requiredTier && item.requiredTier !== 'free' && (
              <span className="text-xs bg-gold-100 text-gold-800 px-2 py-1 rounded-full">
                {item.requiredTier} tier
              </span>
            )}
          </div>
        )}
      </Card.Body>
    </Card>
  );

  const ArtistCard = ({ artist }) => (
    <Card key={artist._id} className="text-center hover:shadow-lg transition-shadow">
      <Card.Body className="p-6">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full mx-auto mb-4 flex items-center justify-center">
          <span className="text-white font-bold text-xl">
            {(artist.artistName || artist.username).charAt(0).toUpperCase()}
          </span>
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">
          {artist.artistName || artist.username}
        </h3>
        <p className="text-sm text-gray-600 mb-3">{artist.location}</p>
        <div className="flex flex-wrap gap-1 justify-center mb-4">
          {artist.genres?.slice(0, 3).map((genre) => (
            <span
              key={genre}
              className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full"
            >
              {genre}
            </span>
          ))}
        </div>
        <Link to={`/artists/${artist._id}`}>
          <Button size="sm" className="w-full">
            View Profile
          </Button>
        </Link>
      </Card.Body>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Discover Music
          </h1>
          <p className="text-gray-600">
            {isAuthenticated 
              ? 'Find new artists and music tailored to your taste'
              : 'Explore trending artists and popular music'
            }
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDisabled = tab.id === 'recommendations' && !isAuthenticated;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id)}
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
                  <span>{tab.label}</span>
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

        {/* Search Bar (for search tab) */}
        {activeTab === 'search' && (
          <div className="mb-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search for artists, songs, or content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={!searchQuery.trim()}>
                <MagnifyingGlassIcon className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Genre Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre === 'All' ? '' : genre)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedGenre === (genre === 'All' ? '' : genre)
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loading size="lg" text="Loading content..." />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={loadContent}>Try Again</Button>
          </div>
        ) : (
          <>
            {/* Artists Section */}
            {artists.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {activeTab === 'trending' ? 'Trending Artists' : 
                   activeTab === 'recommendations' ? 'Recommended Artists' : 
                   'Artists'}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {artists.map((artist) => (
                    <ArtistCard key={artist._id} artist={artist} />
                  ))}
                </div>
              </div>
            )}

            {/* Content Section */}
            {content.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {activeTab === 'trending' ? 'Trending Content' : 
                   activeTab === 'recommendations' ? 'Recommended Content' : 
                   'Content'}
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {content.map((item) => (
                    <ContentCard key={item._id} item={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {artists.length === 0 && content.length === 0 && (
              <div className="text-center py-12">
                <MagnifyingGlassIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {activeTab === 'search' && !searchQuery
                    ? 'Start searching for music'
                    : 'No content found'
                  }
                </h3>
                <p className="text-gray-600">
                  {activeTab === 'search' && !searchQuery
                    ? 'Enter keywords to discover artists and content'
                    : 'Try adjusting your filters or search terms'
                  }
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Discovery;

