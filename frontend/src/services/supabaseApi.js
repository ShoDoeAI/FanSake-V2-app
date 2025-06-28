import { supabase } from '../lib/supabase'

// Artist APIs
export const artistApi = {
  async getAll(limit = 10, offset = 0) {
    const { data, error } = await supabase
      .from('artists')
      .select('*, profiles(*)')
      .range(offset, offset + limit - 1)
      .order('follower_count', { ascending: false })

    return { data, error }
  },

  async getById(artistId) {
    const { data, error } = await supabase
      .from('artists')
      .select('*, profiles(*)')
      .eq('id', artistId)
      .single()

    return { data, error }
  },

  async updateProfile(artistId, updates) {
    const { data, error } = await supabase
      .from('artists')
      .update(updates)
      .eq('id', artistId)
      .select()
      .single()

    return { data, error }
  }
}

// Fan APIs
export const fanApi = {
  async followArtist(fanId, artistId) {
    const { data, error } = await supabase
      .from('follows')
      .insert({ fan_id: fanId, artist_id: artistId })
      .select()
      .single()

    if (!error) {
      // Increment follower count
      await supabase.rpc('increment_follower_count', { artist_id: artistId })
    }

    return { data, error }
  },

  async unfollowArtist(fanId, artistId) {
    const { error } = await supabase
      .from('follows')
      .delete()
      .match({ fan_id: fanId, artist_id: artistId })

    if (!error) {
      // Decrement follower count
      await supabase.rpc('decrement_follower_count', { artist_id: artistId })
    }

    return { error }
  },

  async getFollowedArtists(fanId) {
    const { data, error } = await supabase
      .from('follows')
      .select('*, artists(*, profiles(*))')
      .eq('fan_id', fanId)

    return { data, error }
  }
}

// Content APIs
export const contentApi = {
  async getByArtist(artistId, limit = 10, offset = 0) {
    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('artist_id', artistId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    return { data, error }
  },

  async create(content) {
    const { data, error } = await supabase
      .from('content')
      .insert(content)
      .select()
      .single()

    return { data, error }
  },

  async update(contentId, updates) {
    const { data, error } = await supabase
      .from('content')
      .update(updates)
      .eq('id', contentId)
      .select()
      .single()

    return { data, error }
  },

  async delete(contentId) {
    const { error } = await supabase
      .from('content')
      .delete()
      .eq('id', contentId)

    return { error }
  }
}

// Discovery APIs
export const discoveryApi = {
  async getTrending(limit = 10) {
    const { data, error } = await supabase
      .from('artists')
      .select('*, profiles(*)')
      .order('follower_count', { ascending: false })
      .limit(limit)

    return { data, error }
  },

  async searchArtists(query) {
    const { data, error } = await supabase
      .from('artists')
      .select('*, profiles(*)')
      .or(`stage_name.ilike.%${query}%,profiles.display_name.ilike.%${query}%`)
      .limit(20)

    return { data, error }
  },

  async getByGenre(genre, limit = 10) {
    const { data, error } = await supabase
      .from('artists')
      .select('*, profiles(*)')
      .contains('genres', [genre])
      .limit(limit)

    return { data, error }
  }
}