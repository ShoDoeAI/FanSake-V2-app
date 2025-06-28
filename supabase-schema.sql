-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user_type enum
CREATE TYPE user_type AS ENUM ('artist', 'fan');

-- Create profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  user_type user_type NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  location_city TEXT,
  location_country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create artists table
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  description TEXT,
  genres TEXT[],
  website TEXT,
  spotify_url TEXT,
  soundcloud_url TEXT,
  instagram_handle TEXT,
  twitter_handle TEXT,
  follower_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create fans table
CREATE TABLE fans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier TEXT DEFAULT 'free',
  total_spent DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create follows table
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fan_id UUID NOT NULL REFERENCES fans(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fan_id, artist_id)
);

-- Create content table
CREATE TABLE content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL, -- 'track', 'video', 'post'
  media_url TEXT,
  thumbnail_url TEXT,
  is_exclusive BOOLEAN DEFAULT FALSE,
  min_tier TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE fans ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Artists policies
CREATE POLICY "Public artist profiles are viewable by everyone"
  ON artists FOR SELECT
  USING (true);

CREATE POLICY "Artists can update own profile"
  ON artists FOR UPDATE
  USING (auth.uid() = user_id);

-- Content policies
CREATE POLICY "Public content is viewable by everyone"
  ON content FOR SELECT
  USING (true);

CREATE POLICY "Artists can manage own content"
  ON content FOR ALL
  USING (auth.uid() IN (
    SELECT user_id FROM artists WHERE id = content.artist_id
  ));

-- Create functions
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name, user_type)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'display_name',
    (NEW.raw_user_meta_data->>'user_type')::user_type
  );
  
  -- Create artist or fan record
  IF NEW.raw_user_meta_data->>'user_type' = 'artist' THEN
    INSERT INTO artists (user_id, stage_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  ELSE
    INSERT INTO fans (user_id)
    VALUES (NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();