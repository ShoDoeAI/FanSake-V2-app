// Comprehensive Performance Configuration for MusicConnect

module.exports = {
  // Target Performance Metrics
  targets: {
    // Core Web Vitals
    LCP: 2500, // Largest Contentful Paint (ms)
    FID: 100,  // First Input Delay (ms)
    CLS: 0.1,  // Cumulative Layout Shift
    
    // Additional metrics
    TTFB: 100,  // Time to First Byte (ms)
    FCP: 1800,  // First Contentful Paint (ms)
    TTI: 3800,  // Time to Interactive (ms)
    
    // API Performance
    apiResponseTime: 100,    // Target API response time (ms)
    cacheHitRate: 80,       // Target cache hit rate (%)
    errorRate: 1,           // Maximum error rate (%)
    
    // Resource Loading
    initialPageLoad: 3000,   // Target initial page load (ms)
    bundleSize: 200,        // Maximum bundle size (KB)
    imageLoadTime: 1000,    // Maximum image load time (ms)
  },

  // Optimization Settings
  optimizations: {
    // Code Splitting
    codeSplitting: {
      enabled: true,
      chunks: 'all',
      minSize: 30000,
      maxAsyncRequests: 5,
      maxInitialRequests: 3,
      vendorChunks: ['react', 'react-dom', 'react-router'],
    },

    // Image Optimization
    images: {
      formats: ['avif', 'webp', 'jpeg'],
      sizes: [320, 640, 1200, 1920],
      quality: {
        avif: 50,
        webp: 80,
        jpeg: 85,
      },
      lazyLoad: true,
      placeholder: 'blur',
    },

    // Caching Strategy
    caching: {
      static: {
        maxAge: 31536000, // 1 year
        immutable: true,
      },
      api: {
        defaultTTL: 300, // 5 minutes
        patterns: {
          '/api/discovery': 600,      // 10 minutes
          '/api/artists': 300,        // 5 minutes
          '/api/content': 3600,       // 1 hour
          '/api/user': 0,            // No cache
        },
      },
      cdn: {
        enabled: true,
        providers: ['cloudflare', 'fastly'],
        geoRouting: true,
      },
    },

    // Compression
    compression: {
      brotli: {
        enabled: true,
        quality: 11,
        threshold: 1024,
      },
      gzip: {
        enabled: true,
        level: 6,
        threshold: 1024,
      },
    },

    // Resource Hints
    resourceHints: {
      preconnect: [
        'https://cdn.musicconnect.com',
        'https://api.musicconnect.com',
        'https://fonts.googleapis.com',
      ],
      dnsPrefetch: [
        'google-analytics.com',
        'stripe.com',
      ],
      preload: [
        { href: '/fonts/Inter-Regular.woff2', as: 'font', type: 'font/woff2' },
        { href: '/fonts/Inter-Medium.woff2', as: 'font', type: 'font/woff2' },
      ],
    },
  },

  // Monitoring Configuration
  monitoring: {
    enabled: true,
    providers: {
      webVitals: true,
      customMetrics: true,
      errorTracking: true,
    },
    alertThresholds: {
      LCP: 4000,
      FID: 300,
      CLS: 0.25,
      TTFB: 1800,
      errorRate: 5,
    },
    reporting: {
      endpoint: '/api/metrics',
      interval: 60000, // 1 minute
      batch: true,
    },
  },

  // Service Worker Configuration
  serviceWorker: {
    enabled: true,
    strategies: {
      '/api/*': 'networkFirst',
      '*.js': 'cacheFirst',
      '*.css': 'cacheFirst',
      '*.{png,jpg,jpeg,svg,webp}': 'cacheFirst',
      '/': 'networkFirst',
    },
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com/,
        handler: 'cacheFirst',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com/,
        handler: 'cacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
    ],
  },

  // Database Optimization
  database: {
    connectionPool: {
      min: 10,
      max: 100,
      acquireTimeout: 30000,
      idleTimeout: 60000,
    },
    queryOptimization: {
      enabled: true,
      slowQueryThreshold: 100,
      indexSuggestions: true,
      queryCache: true,
    },
    indexes: [
      { collection: 'users', fields: { email: 1 }, unique: true },
      { collection: 'users', fields: { username: 1 }, unique: true },
      { collection: 'artists', fields: { isVerified: 1, monthlyListeners: -1 } },
      { collection: 'content', fields: { artistId: 1, createdAt: -1 } },
      { collection: 'content', fields: { tags: 1 } },
      { collection: 'subscriptions', fields: { userId: 1, status: 1 } },
    ],
  },

  // CDN Configuration
  cdn: {
    providers: {
      cloudflare: {
        enabled: true,
        zones: ['us-east', 'eu-west', 'asia-pacific'],
        features: {
          imageOptimization: true,
          minification: true,
          railgun: true,
          argo: true,
        },
      },
    },
    edgeFunctions: {
      imageTransform: true,
      geoRouting: true,
      abTesting: true,
      securityHeaders: true,
    },
    cacheRules: [
      { pattern: '*.html', ttl: 3600 },
      { pattern: '*.css', ttl: 31536000 },
      { pattern: '*.js', ttl: 31536000 },
      { pattern: '*.{jpg,jpeg,png,gif,webp,svg}', ttl: 31536000 },
      { pattern: '/api/*', ttl: 0, bypassCache: false },
    ],
  },

  // Build Optimization
  build: {
    minify: {
      js: true,
      css: true,
      html: true,
    },
    treeshake: true,
    purgeCSS: {
      enabled: true,
      safelist: ['html', 'body', /^data-/],
    },
    bundleAnalyzer: {
      enabled: process.env.ANALYZE === 'true',
      openAnalyzer: true,
    },
  },

  // Performance Budget
  budget: {
    bundles: [
      {
        name: 'main',
        maxSize: '200kb',
      },
      {
        name: 'vendor',
        maxSize: '150kb',
      },
    ],
    resources: {
      scripts: '300kb',
      styles: '100kb',
      images: '500kb',
      fonts: '100kb',
      total: '1mb',
    },
  },
};