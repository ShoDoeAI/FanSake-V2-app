export const config = {
  runtime: 'edge',
};

// Edge function for performance optimization
export default async function handler(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Image optimization
  if (pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    return handleImageRequest(request);
  }
  
  // API caching
  if (pathname.startsWith('/api/')) {
    return handleAPIRequest(request);
  }
  
  // Static asset optimization
  if (pathname.match(/\.(js|css|woff|woff2)$/i)) {
    return handleStaticAsset(request);
  }
  
  // Default response
  return fetch(request);
}

async function handleImageRequest(request) {
  const url = new URL(request.url);
  const width = url.searchParams.get('w');
  const height = url.searchParams.get('h');
  const quality = url.searchParams.get('q') || '85';
  const format = url.searchParams.get('f') || 'auto';
  
  // Determine best format based on Accept header
  const accept = request.headers.get('Accept') || '';
  let outputFormat = format;
  
  if (format === 'auto') {
    if (accept.includes('image/avif')) {
      outputFormat = 'avif';
    } else if (accept.includes('image/webp')) {
      outputFormat = 'webp';
    } else {
      outputFormat = 'jpeg';
    }
  }
  
  // Build optimized image URL
  const optimizedUrl = new URL(url);
  optimizedUrl.hostname = 'images.musicconnect.com';
  optimizedUrl.searchParams.set('f', outputFormat);
  
  const response = await fetch(optimizedUrl, {
    headers: {
      ...request.headers,
      'X-Forwarded-For': request.headers.get('X-Forwarded-For') || request.headers.get('CF-Connecting-IP') || '',
    },
  });
  
  // Add performance headers
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Timing-Allow-Origin', '*');
  
  // Add responsive image hints
  if (width || height) {
    headers.set('X-Image-Dimensions', `${width || 'auto'}x${height || 'auto'}`);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleAPIRequest(request) {
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  
  // Check cache first
  let response = await cache.match(cacheKey);
  
  if (!response) {
    // Make request to origin
    response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const headers = new Headers(response.headers);
      
      // Determine cache duration based on endpoint
      let cacheDuration = 60; // Default 1 minute
      
      if (url.pathname.includes('/discovery')) {
        cacheDuration = 600; // 10 minutes for discovery
      } else if (url.pathname.includes('/artists')) {
        cacheDuration = 300; // 5 minutes for artist data
      } else if (url.pathname.includes('/static')) {
        cacheDuration = 86400; // 24 hours for static data
      }
      
      headers.set('Cache-Control', `public, max-age=${cacheDuration}, stale-while-revalidate=60`);
      headers.set('X-Cache-Status', 'MISS');
      
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      
      // Store in cache
      await cache.put(cacheKey, response.clone());
    }
  } else {
    // Add cache hit header
    const headers = new Headers(response.headers);
    headers.set('X-Cache-Status', 'HIT');
    
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  
  return response;
}

async function handleStaticAsset(request) {
  const url = new URL(request.url);
  const response = await fetch(request);
  
  if (!response.ok) {
    return response;
  }
  
  const headers = new Headers(response.headers);
  
  // Set long cache for versioned assets
  if (url.pathname.includes('.') && url.searchParams.has('v')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }
  
  // Add compression hint
  headers.set('Vary', 'Accept-Encoding');
  
  // Security headers
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  
  // CORS for fonts
  if (url.pathname.match(/\.(woff|woff2|ttf|otf)$/i)) {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Middleware for geolocation-based routing
export async function middleware(request) {
  const country = request.geo?.country || 'US';
  const region = request.geo?.region || 'unknown';
  
  // Add geo headers for analytics
  request.headers.set('X-User-Country', country);
  request.headers.set('X-User-Region', region);
  
  // Route to nearest origin
  const origins = {
    US: 'https://us.api.musicconnect.com',
    EU: 'https://eu.api.musicconnect.com',
    ASIA: 'https://asia.api.musicconnect.com',
  };
  
  let origin = origins.US; // Default
  
  if (['GB', 'DE', 'FR', 'IT', 'ES'].includes(country)) {
    origin = origins.EU;
  } else if (['JP', 'KR', 'CN', 'IN', 'SG'].includes(country)) {
    origin = origins.ASIA;
  }
  
  // Rewrite API requests to nearest origin
  if (request.url.includes('/api/')) {
    const url = new URL(request.url);
    url.hostname = new URL(origin).hostname;
    return fetch(url, request);
  }
  
  return NextResponse.next();
}