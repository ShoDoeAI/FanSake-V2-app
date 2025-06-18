// User Types
const USER_TYPES = {
  ARTIST: 'artist',
  FAN: 'fan'
};

// Fan Tiers
const FAN_TIERS = {
  CASUAL: 'casual',        // Free tier
  SUPPORTER: 'supporter',  // Basic paid tier
  SUPER_FAN: 'super_fan'   // Premium tier with exclusive access
};

// Music Genres
const MUSIC_GENRES = [
  'Rock', 'Pop', 'Hip Hop', 'Electronic', 'Folk', 'Country', 
  'Jazz', 'Blues', 'Classical', 'Reggae', 'Punk', 'Metal',
  'Indie', 'Alternative', 'R&B', 'Soul', 'Funk', 'World',
  'Experimental', 'Ambient', 'Other'
];

// Content Types
const CONTENT_TYPES = {
  MUSIC: 'music',
  VIDEO: 'video',
  PHOTO: 'photo',
  BLOG_POST: 'blog_post',
  EVENT: 'event',
  MERCHANDISE: 'merchandise'
};

// Community Activity Types
const ACTIVITY_TYPES = {
  LIKE: 'like',
  COMMENT: 'comment',
  SHARE: 'share',
  FOLLOW: 'follow',
  DISCOVERY: 'discovery',
  TIER_UPGRADE: 'tier_upgrade',
  CONTENT_UNLOCK: 'content_unlock'
};

// Discovery Algorithms
const DISCOVERY_SOURCES = {
  SIMILAR_GENRES: 'similar_genres',
  FAN_CROSSOVER: 'fan_crossover',
  COMMUNITY_RECOMMENDATIONS: 'community_recommendations',
  TRENDING: 'trending',
  CURATOR_PICKS: 'curator_picks'
};

module.exports = {
  USER_TYPES,
  FAN_TIERS,
  MUSIC_GENRES,
  CONTENT_TYPES,
  ACTIVITY_TYPES,
  DISCOVERY_SOURCES
};

