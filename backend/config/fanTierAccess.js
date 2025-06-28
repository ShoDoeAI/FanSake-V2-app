// Fan Tier Access Configuration
const FanTierAccess = {
  free: {
    early_access: 0, // hours before public
    exclusive_tracks: false,
    live_sessions: false,
    direct_messages: 0, // per month
    virtual_backstage: false,
    downloads: false,
    quality: {
      audio: '128k',
      video: '720p'
    },
    features: {
      stream_music: true,
      like_tracks: true,
      follow_artists: true,
      share_content: true,
      view_profiles: true,
      basic_discovery: true
    }
  },
  
  supporter: {
    early_access: 24, // hours before public
    exclusive_tracks: true,
    live_sessions: false,
    direct_messages: 0, // per month
    virtual_backstage: false,
    downloads: false,
    quality: {
      audio: '256k',
      video: '1080p'
    },
    features: {
      stream_music: true,
      like_tracks: true,
      follow_artists: true,
      share_content: true,
      view_profiles: true,
      basic_discovery: true,
      exclusive_content: true,
      behind_scenes: true,
      monthly_qa: true,
      discord_access: true,
      supporter_badge: true,
      early_notifications: true,
      voting_power: 1
    }
  },
  
  superfan: {
    early_access: 48, // hours before public
    exclusive_tracks: true,
    live_sessions: true,
    direct_messages: 5, // per month
    virtual_backstage: true,
    downloads: true,
    quality: {
      audio: '320k',
      video: '4K'
    },
    features: {
      stream_music: true,
      like_tracks: true,
      follow_artists: true,
      share_content: true,
      view_profiles: true,
      basic_discovery: true,
      exclusive_content: true,
      behind_scenes: true,
      monthly_qa: true,
      discord_access: true,
      supporter_badge: true,
      early_notifications: true,
      voting_power: 3,
      superfan_badge: true,
      priority_support: true,
      meet_greets: true,
      merchandise_discount: 20, // percentage
      concert_presale: true,
      name_in_credits: true,
      birthday_message: true
    }
  }
};

// Helper functions
const getTierLevel = (tier) => {
  const levels = { free: 0, supporter: 1, superfan: 2 };
  return levels[tier] || 0;
};

const canAccessTier = (userTier, requiredTier) => {
  return getTierLevel(userTier) >= getTierLevel(requiredTier);
};

const getTierFeatures = (tier) => {
  return FanTierAccess[tier] || FanTierAccess.free;
};

const getEarlyAccessTime = (contentReleaseDate, userTier) => {
  const tierAccess = FanTierAccess[userTier] || FanTierAccess.free;
  const earlyAccessHours = tierAccess.early_access;
  
  if (earlyAccessHours === 0) {
    return contentReleaseDate;
  }
  
  const accessTime = new Date(contentReleaseDate);
  accessTime.setHours(accessTime.getHours() - earlyAccessHours);
  
  return accessTime;
};

const canAccessContent = (content, userTier, currentTime = new Date()) => {
  // Check if content exists
  if (!content) return false;
  
  // Check tier requirement
  if (!canAccessTier(userTier, content.requiredTier)) {
    return false;
  }
  
  // Check release date with early access
  const accessTime = getEarlyAccessTime(content.releaseDate, userTier);
  if (currentTime < accessTime) {
    return false;
  }
  
  // Check expiration
  if (content.expiresAt && currentTime > content.expiresAt) {
    return false;
  }
  
  return true;
};

const getQualitySettings = (userTier) => {
  const tierAccess = FanTierAccess[userTier] || FanTierAccess.free;
  return tierAccess.quality;
};

const getDirectMessageQuota = (userTier) => {
  const tierAccess = FanTierAccess[userTier] || FanTierAccess.free;
  return tierAccess.direct_messages || 0;
};

const hasFeature = (userTier, feature) => {
  const tierAccess = FanTierAccess[userTier] || FanTierAccess.free;
  return tierAccess.features && tierAccess.features[feature] === true;
};

const getMerchandiseDiscount = (userTier) => {
  const tierAccess = FanTierAccess[userTier] || FanTierAccess.free;
  return tierAccess.features?.merchandise_discount || 0;
};

const getVotingPower = (userTier) => {
  const tierAccess = FanTierAccess[userTier] || FanTierAccess.free;
  return tierAccess.features?.voting_power || 0;
};

// Content gate middleware
const contentGate = (requiredTier) => {
  return async (req, res, next) => {
    try {
      const userTier = req.user?.tier || 'free';
      
      if (!canAccessTier(userTier, requiredTier)) {
        return res.status(403).json({
          error: 'Access denied',
          message: `This content requires ${requiredTier} tier or higher`,
          requiredTier,
          userTier
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: 'Error checking access' });
    }
  };
};

// Early access middleware
const earlyAccessGate = (releaseDate) => {
  return async (req, res, next) => {
    try {
      const userTier = req.user?.tier || 'free';
      const accessTime = getEarlyAccessTime(releaseDate, userTier);
      const now = new Date();
      
      if (now < accessTime) {
        const hoursUntilAccess = Math.ceil((accessTime - now) / (1000 * 60 * 60));
        
        return res.status(403).json({
          error: 'Early access restricted',
          message: `This content will be available to you in ${hoursUntilAccess} hours`,
          accessTime: accessTime.toISOString(),
          userTier
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: 'Error checking early access' });
    }
  };
};

module.exports = {
  FanTierAccess,
  getTierLevel,
  canAccessTier,
  getTierFeatures,
  getEarlyAccessTime,
  canAccessContent,
  getQualitySettings,
  getDirectMessageQuota,
  hasFeature,
  getMerchandiseDiscount,
  getVotingPower,
  contentGate,
  earlyAccessGate
};