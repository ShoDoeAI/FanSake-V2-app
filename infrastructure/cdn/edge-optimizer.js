// Edge Optimizer for CloudFront
// Implements intelligent request routing and optimization at edge locations

'use strict';

// Viewer Request Handler - Route to optimal origin
exports.viewerRequest = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;
    
    // Extract viewer location information
    const viewerCountry = headers['cloudfront-viewer-country'] ? 
        headers['cloudfront-viewer-country'][0].value : 'US';
    const viewerCity = headers['cloudfront-viewer-city'] ? 
        headers['cloudfront-viewer-city'][0].value : '';
    const viewerLatitude = headers['cloudfront-viewer-latitude'] ? 
        parseFloat(headers['cloudfront-viewer-latitude'][0].value) : 0;
    const viewerLongitude = headers['cloudfront-viewer-longitude'] ? 
        parseFloat(headers['cloudfront-viewer-longitude'][0].value) : 0;
    
    // Device detection
    const userAgent = headers['user-agent'] ? headers['user-agent'][0].value : '';
    const deviceType = detectDeviceType(userAgent);
    
    // Content type routing
    if (uri.match(/\.(mp3|mp4|m3u8|ts)$/i)) {
        // Media content - route to nearest media origin
        const mediaOrigin = selectMediaOrigin(viewerCountry, viewerLatitude, viewerLongitude);
        request.origin = {
            custom: {
                domainName: mediaOrigin,
                port: 443,
                protocol: 'https',
                path: '/media',
                sslProtocols: ['TLSv1.2'],
                readTimeout: 60,
                keepaliveTimeout: 60
            }
        };
        
        // Add device-specific headers for adaptive streaming
        request.headers['x-device-type'] = [{key: 'X-Device-Type', value: deviceType}];
        
        // Implement bandwidth detection
        const bandwidth = detectBandwidth(headers);
        request.headers['x-bandwidth-estimate'] = [{key: 'X-Bandwidth-Estimate', value: bandwidth}];
    }
    
    // API request routing
    if (uri.startsWith('/api/')) {
        // Route API requests to nearest healthy origin
        const apiOrigin = await selectAPIOrigin(viewerCountry);
        request.origin = {
            custom: {
                domainName: apiOrigin,
                port: 443,
                protocol: 'https',
                path: '',
                sslProtocols: ['TLSv1.2'],
                readTimeout: 30,
                keepaliveTimeout: 30
            }
        };
        
        // Add geo headers for backend processing
        request.headers['x-viewer-country'] = [{key: 'X-Viewer-Country', value: viewerCountry}];
        request.headers['x-viewer-city'] = [{key: 'X-Viewer-City', value: viewerCity}];
    }
    
    // A/B testing implementation
    if (uri === '/' || uri === '/index.html') {
        const abTestGroup = hashUserToABGroup(request);
        request.headers['x-ab-test-group'] = [{key: 'X-AB-Test-Group', value: abTestGroup}];
        
        // Route to different frontend versions based on test group
        if (abTestGroup === 'B') {
            request.uri = '/index-b.html';
        }
    }
    
    // Security headers injection
    addSecurityHeaders(request);
    
    return request;
};

// Origin Request Handler - Optimize backend requests
exports.originRequest = async (event) => {
    const request = event.Records[0].cf.request;
    
    // Add request ID for tracing
    const requestId = generateRequestId();
    request.headers['x-request-id'] = [{key: 'X-Request-ID', value: requestId}];
    
    // Add timestamp for latency tracking
    request.headers['x-edge-request-time'] = [{key: 'X-Edge-Request-Time', value: Date.now().toString()}];
    
    // Implement request coalescing for popular content
    if (request.uri.match(/\/api\/trending|\/api\/popular/)) {
        const cacheKey = `${request.uri}:${request.querystring}`;
        const cachedResponse = await getFromEdgeCache(cacheKey);
        
        if (cachedResponse) {
            return {
                status: '200',
                statusDescription: 'OK',
                headers: {
                    'content-type': [{key: 'Content-Type', value: 'application/json'}],
                    'cache-control': [{key: 'Cache-Control', value: 'public, max-age=60'}],
                    'x-cache': [{key: 'X-Cache', value: 'HIT-EDGE'}]
                },
                body: cachedResponse
            };
        }
    }
    
    return request;
};

// Origin Response Handler - Cache and optimize responses
exports.originResponse = async (event) => {
    const request = event.Records[0].cf.request;
    const response = event.Records[0].cf.response;
    
    // Calculate and add latency header
    const requestTime = request.headers['x-edge-request-time'] ? 
        parseInt(request.headers['x-edge-request-time'][0].value) : 0;
    const latency = Date.now() - requestTime;
    response.headers['x-origin-latency'] = [{key: 'X-Origin-Latency', value: latency.toString()}];
    
    // Cache popular content at edge
    if (request.uri.match(/\/api\/trending|\/api\/popular/) && response.status === '200') {
        const cacheKey = `${request.uri}:${request.querystring}`;
        await setInEdgeCache(cacheKey, response.body, 60); // Cache for 60 seconds
    }
    
    // Compress responses if not already compressed
    if (!response.headers['content-encoding']) {
        const contentType = response.headers['content-type'] ? 
            response.headers['content-type'][0].value : '';
        
        if (shouldCompress(contentType)) {
            response.headers['content-encoding'] = [{key: 'Content-Encoding', value: 'gzip'}];
            response.body = await compressBody(response.body);
        }
    }
    
    return response;
};

// Viewer Response Handler - Final optimizations
exports.viewerResponse = async (event) => {
    const request = event.Records[0].cf.request;
    const response = event.Records[0].cf.response;
    
    // Add comprehensive security headers
    response.headers['strict-transport-security'] = [{
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
    }];
    
    response.headers['x-content-type-options'] = [{
        key: 'X-Content-Type-Options',
        value: 'nosniff'
    }];
    
    response.headers['x-frame-options'] = [{
        key: 'X-Frame-Options',
        value: 'DENY'
    }];
    
    response.headers['x-xss-protection'] = [{
        key: 'X-XSS-Protection',
        value: '1; mode=block'
    }];
    
    response.headers['referrer-policy'] = [{
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
    }];
    
    response.headers['permissions-policy'] = [{
        key: 'Permissions-Policy',
        value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    }];
    
    // Content Security Policy
    const csp = [
        "default-src 'self' https://*.musicconnect.com",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https://*.musicconnect.com https://*.stripe.com",
        "connect-src 'self' https://*.musicconnect.com https://*.stripe.com wss://*.musicconnect.com",
        "frame-src https://*.stripe.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; ');
    
    response.headers['content-security-policy'] = [{
        key: 'Content-Security-Policy',
        value: csp
    }];
    
    // Add cache headers based on content type
    const uri = request.uri;
    if (uri.match(/\.(js|css|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        response.headers['cache-control'] = [{
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
        }];
        
        // Add fingerprint validation
        const etag = generateETag(response.body);
        response.headers['etag'] = [{key: 'ETag', value: etag}];
    } else if (uri.endsWith('.html') || uri === '/') {
        response.headers['cache-control'] = [{
            key: 'Cache-Control',
            value: 'public, max-age=300, must-revalidate'
        }];
    }
    
    // Add performance timing headers
    response.headers['server-timing'] = [{
        key: 'Server-Timing',
        value: `edge;dur=${Date.now() - event.Records[0].cf.config.requestId}`
    }];
    
    return response;
};

// Helper Functions

function detectDeviceType(userAgent) {
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    if (/tv/i.test(userAgent)) return 'tv';
    return 'desktop';
}

function detectBandwidth(headers) {
    // Implement Network Information API detection
    const downlink = headers['downlink'] ? headers['downlink'][0].value : '10';
    const rtt = headers['rtt'] ? headers['rtt'][0].value : '50';
    
    // Estimate bandwidth class
    if (parseFloat(downlink) < 1) return 'low';
    if (parseFloat(downlink) < 5) return 'medium';
    return 'high';
}

function selectMediaOrigin(country, lat, lon) {
    // Media origin selection based on geographic proximity
    const origins = {
        'US': 'media-us-east-1.musicconnect.com',
        'CA': 'media-us-east-1.musicconnect.com',
        'MX': 'media-us-east-1.musicconnect.com',
        'GB': 'media-eu-west-1.musicconnect.com',
        'FR': 'media-eu-west-1.musicconnect.com',
        'DE': 'media-eu-west-1.musicconnect.com',
        'JP': 'media-ap-southeast-1.musicconnect.com',
        'AU': 'media-ap-southeast-1.musicconnect.com',
        'SG': 'media-ap-southeast-1.musicconnect.com',
        'IN': 'media-ap-southeast-1.musicconnect.com'
    };
    
    return origins[country] || 'media-us-east-1.musicconnect.com';
}

async function selectAPIOrigin(country) {
    // API origin selection with health checking
    const origins = {
        'US': 'api-us-east-1.musicconnect.com',
        'CA': 'api-us-east-1.musicconnect.com',
        'GB': 'api-eu-west-1.musicconnect.com',
        'FR': 'api-eu-west-1.musicconnect.com',
        'JP': 'api-ap-southeast-1.musicconnect.com',
        'AU': 'api-ap-southeast-1.musicconnect.com'
    };
    
    const primaryOrigin = origins[country] || 'api-us-east-1.musicconnect.com';
    
    // Check health of primary origin
    try {
        const healthCheck = await fetch(`https://${primaryOrigin}/health`, {
            method: 'GET',
            timeout: 1000
        });
        
        if (healthCheck.ok) {
            return primaryOrigin;
        }
    } catch (error) {
        // Fall back to US East if primary fails
        return 'api-us-east-1.musicconnect.com';
    }
    
    return primaryOrigin;
}

function hashUserToABGroup(request) {
    // Consistent A/B test assignment based on user ID or session
    const cookies = parseCookies(request.headers.cookie || []);
    const userId = cookies['user_id'] || generateRandomId();
    
    // Simple hash to determine group
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash) + userId.charCodeAt(i);
        hash = hash & hash;
    }
    
    return Math.abs(hash) % 100 < 10 ? 'B' : 'A'; // 10% in group B
}

function parseCookies(cookieHeaders) {
    const cookies = {};
    cookieHeaders.forEach(header => {
        header.value.split(';').forEach(cookie => {
            const [key, value] = cookie.trim().split('=');
            cookies[key] = value;
        });
    });
    return cookies;
}

function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateRandomId() {
    return Math.random().toString(36).substr(2, 9);
}

function generateETag(body) {
    // Simple ETag generation
    let hash = 0;
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return '"' + Math.abs(hash).toString(16) + '"';
}

function shouldCompress(contentType) {
    const compressibleTypes = [
        'text/', 'application/json', 'application/javascript',
        'application/xml', 'application/rss+xml', 'image/svg+xml'
    ];
    return compressibleTypes.some(type => contentType.includes(type));
}

async function compressBody(body) {
    // Placeholder for compression logic
    // In actual Lambda@Edge, you would use zlib
    return body;
}

function addSecurityHeaders(request) {
    // Add security headers to request for backend processing
    request.headers['x-forwarded-proto'] = [{key: 'X-Forwarded-Proto', value: 'https'}];
    request.headers['x-request-context'] = [{key: 'X-Request-Context', value: 'edge'}];
}

// Edge caching functions (using Lambda@Edge limitations)
const edgeCache = new Map();

async function getFromEdgeCache(key) {
    const cached = edgeCache.get(key);
    if (cached && cached.expires > Date.now()) {
        return cached.data;
    }
    return null;
}

async function setInEdgeCache(key, data, ttlSeconds) {
    edgeCache.set(key, {
        data: data,
        expires: Date.now() + (ttlSeconds * 1000)
    });
    
    // Clean up expired entries
    if (edgeCache.size > 1000) {
        const now = Date.now();
        for (const [k, v] of edgeCache.entries()) {
            if (v.expires < now) {
                edgeCache.delete(k);
            }
        }
    }
}