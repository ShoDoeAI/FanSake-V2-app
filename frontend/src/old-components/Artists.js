import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { artistsAPI } from '../services/api';
import { 
  MagnifyingGlassIcon,
  MapPinIcon,
  UserGroupIcon,
  MusicalNoteIcon,
  FireIcon
} from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';

const Artists = () => {
  const { isAuthenticated } = useAuth();
  const [artists, setArtists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [sortBy, setSortBy] = useState('trending'); // trending, followers, newest

  const genres = [
    'All', 'Rock', 'Pop', 'Hip Hop', 'Electronic', 'Jazz', 'Classical',
    'Country', 'R&B', 'Folk', 'Indie', 'Alternative', 'Blues', 'Metal'
  ];

  const sortOptions = [
    { value: 'trending', label: 'Trending' },
    { value: 'followers', label: 'Most Followers' },
    { value: 'newest', label: 'Newest' },
    { value: 'alphabetical', label: 'A-Z' },
  ];

  useEffect(() => {
    loadArtists();
  }, [selectedGenre, sortBy]);

  const loadArtists = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = {
        limit: 50,
        ...(selectedGenre && selectedGenre !== 'All' && { genre: selectedGenre }),
        sort: sortBy,
      };
      
      const response = await artistsAPI.getAll(params);
      setArtists(response.data.artists || []);
    } catch (err) {
      console.error('Error loading artists:', err);
      setError('Failed to load artists. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      loadArtists();
      return;
    }
    
    const filteredArtists = artists.filter(artist =>
      (artist.artistName || artist.username).toLowerCase().includes(searchQuery.toLowerCase()) ||
      artist.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artist.genres.some(genre => genre.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    setArtists(filteredArtists);
  };

  const ArtistCard = ({ artist }) => (
    <Card hover className="h-full">
      <Card.Body className="p-6 flex flex-col h-full">
        {/* Artist Avatar */}
        <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full mx-auto mb-4 flex items-center justify-center">
          <span className="text-white font-bold text-2xl">
            {(artist.artistName || artist.username).charAt(0).toUpperCase()}
          </span>
        </div>
        
        {/* Artist Info */}
        <div className="text-center flex-1 flex flex-col">
          <h3 className="font-semibold text-gray-900 mb-1 text-lg">
            {artist.artistName || artist.username}
          </h3>
          
          <div className="flex items-center justify-center text-gray-600 mb-3">
            <MapPinIcon className="h-4 w-4 mr-1" />
            <span className="text-sm">{artist.location}</span>
          </div>
          
          {/* Stats */}
          <div className="flex justify-center space-x-4 mb-4 text-sm text-gray-600">
            <div className="flex items-center">
              <UserGroupIcon className="h-4 w-4 mr-1" />
              <span>{artist.followerCount || 0}</span>
            </div>
            <div className="flex items-center">
              <MusicalNoteIcon className="h-4 w-4 mr-1" />
              <span>{artist.contentCount || 0}</span>
            </div>
          </div>
          
          {/* Genres */}
          <div className="flex flex-wrap gap-1 justify-center mb-4 flex-1">
            {artist.genres?.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full"
              >
                {genre}
              </span>
            ))}
            {artist.genres?.length > 3 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                +{artist.genres.length - 3}
              </span>
            )}
          </div>
          
          {/* Bio Preview */}
          {artist.bio && (
            <p className="text-gray-600 text-sm mb-4 line-clamp-2 flex-1">
              {artist.bio}
            </p>
          )}
          
          {/* View Profile Button */}
          <Link to={`/artists/${artist._id}`} className="mt-auto">
            <Button size="sm" className="w-full">
              View Profile
            </Button>
          </Link>
        </div>
      </Card.Body>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Discover Artists
          </h1>
          <p className="text-gray-600">
            Explore talented independent artists and connect with your favorites
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search artists by name, location, or genre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>
              <MagnifyingGlassIcon className="h-5 w-5" />
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            {/* Genre Filter */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Genre
              </label>
              <div className="flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSelectedGenre(genre === 'All' ? '' : genre)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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

            {/* Sort Options */}
            <div className="lg:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Artists Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loading size="lg" text="Loading artists..." />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={loadArtists}>Try Again</Button>
          </div>
        ) : artists.length > 0 ? (
          <>
            {/* Results Count */}
            <div className="mb-6">
              <p className="text-gray-600">
                {searchQuery 
                  ? `Found ${artists.length} artist${artists.length !== 1 ? 's' : ''} matching "${searchQuery}"`
                  : `Showing ${artists.length} artist${artists.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>

            {/* Artists Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {artists.map((artist) => (
                <ArtistCard key={artist._id} artist={artist} />
              ))}
            </div>

            {/* Load More (if needed) */}
            {artists.length >= 50 && (
              <div className="text-center mt-12">
                <Button variant="outline" onClick={loadArtists}>
                  Load More Artists
                </Button>
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="text-center py-12">
            <MusicalNoteIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? 'No artists found' : 'No artists available'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery 
                ? 'Try adjusting your search terms or filters'
                : 'Check back later for new artists'
              }
            </p>
            {searchQuery && (
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('');
                  loadArtists();
                }}
              >
                Clear Search
              </Button>
            )}
          </div>
        )}

        {/* Call to Action for Artists */}
        {!isAuthenticated && (
          <div className="mt-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-8 text-center text-white">
            <h2 className="text-2xl font-bold mb-4">Are you an artist?</h2>
            <p className="text-purple-100 mb-6">
              Join our community to showcase your music, connect with fans, and build your audience.
            </p>
            <Link to="/register">
              <Button 
                variant="secondary" 
                size="lg"
                className="bg-white text-purple-600 hover:bg-gray-50"
              >
                Join as Artist
              </Button>
            </Link>
          </div>
        )}

        {/* Featured Section for Trending Artists */}
        {sortBy === 'trending' && artists.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center mb-6">
              <FireIcon className="h-6 w-6 text-orange-500 mr-2" />
              <h2 className="text-2xl font-bold text-gray-900">
                Trending This Week
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {artists.slice(0, 4).map((artist, index) => (
                <Card key={artist._id} className="text-center p-6 bg-gradient-to-br from-purple-50 to-pink-50">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full mx-auto mb-3 flex items-center justify-center">
                    <span className="text-white font-bold">#{index + 1}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {artist.artistName || artist.username}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">{artist.location}</p>
                  <Link to={`/artists/${artist._id}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      View Profile
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Artists;

