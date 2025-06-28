const helmet = require('helmet');
const csrf = require('csurf');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');
const validator = require('validator');
const DOMPurify = require('isomorphic-dompurify');
const crypto = require('crypto');

// WAF-like request filtering
class WebApplicationFirewall {
  constructor() {
    this.blacklistPatterns = [
      // SQL Injection patterns
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|where|table|database)\b)/gi,
      /(;|--|\/\*|\*\/|xp_|sp_|0x[0-9a-f]+)/gi,
      
      // XSS patterns
      /(<script[^>]*>[\s\S]*?<\/script>|javascript:|onerror=|onload=|onclick=|onmouseover=)/gi,
      /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
      
      // Command injection patterns
      /(;|\||&|`|\$\(|\)|\{|\}|<|>|\\n|\\r)/g,
      
      // Path traversal patterns
      /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%2e%2e%5c)/gi,
      
      // LDAP injection patterns
      /(\(|\)|\||\&|\*|=|!|~|\+|-|,|;|\/|\\)/g
    ];
    
    this.suspiciousHeaders = [
      'x-forwarded-host',
      'x-original-url',
      'x-rewrite-url',
      'x-originating-ip',
      'x-remote-ip',
      'x-remote-addr'
    ];
    
    this.allowedContentTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ];
  }

  inspect(req, res, next) {
    // Check request URL
    if (this.isSuspiciousUrl(req.url)) {
      return this.blockRequest(res, 'Suspicious URL detected');
    }
    
    // Check headers
    if (this.hasSuspiciousHeaders(req.headers)) {
      return this.blockRequest(res, 'Suspicious headers detected');
    }
    
    // Check request body
    if (req.body && this.isSuspiciousPayload(req.body)) {
      return this.blockRequest(res, 'Malicious payload detected');
    }
    
    // Check query parameters
    if (req.query && this.isSuspiciousPayload(req.query)) {
      return this.blockRequest(res, 'Malicious query parameters detected');
    }
    
    // Check content type
    if (req.headers['content-type'] && !this.isAllowedContentType(req.headers['content-type'])) {
      return this.blockRequest(res, 'Invalid content type');
    }
    
    // Log suspicious but allowed requests
    if (this.isSuspiciousButAllowed(req)) {
      this.logSuspiciousRequest(req);
    }
    
    next();
  }

  isSuspiciousUrl(url) {
    return this.blacklistPatterns.some(pattern => pattern.test(url));
  }

  hasSuspiciousHeaders(headers) {
    // Check for suspicious header values
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string' && this.blacklistPatterns.some(pattern => pattern.test(value))) {
        return true;
      }
    }
    
    // Check for presence of suspicious headers
    return this.suspiciousHeaders.some(header => headers[header]);
  }

  isSuspiciousPayload(payload) {
    const payloadString = JSON.stringify(payload);
    return this.blacklistPatterns.some(pattern => pattern.test(payloadString));
  }

  isAllowedContentType(contentType) {
    return this.allowedContentTypes.some(allowed => contentType.includes(allowed));
  }

  isSuspiciousButAllowed(req) {
    // Additional checks for logging purposes
    const userAgent = req.headers['user-agent'] || '';
    const suspiciousAgents = ['sqlmap', 'nikto', 'scanner', 'nmap', 'havij', 'acunetix'];
    
    return suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent));
  }

  blockRequest(res, reason) {
    console.error(`WAF blocked request: ${reason}`);
    res.status(403).json({
      error: 'Forbidden',
      message: 'Request blocked by security policy'
    });
  }

  logSuspiciousRequest(req) {
    console.warn('Suspicious request detected:', {
      ip: req.ip,
      url: req.url,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });
  }
}

// Input validation and sanitization
class InputValidator {
  static validateEmail(email) {
    return validator.isEmail(email);
  }

  static validateUsername(username) {
    return validator.isAlphanumeric(username) && 
           validator.isLength(username, { min: 3, max: 30 });
  }

  static validatePassword(password) {
    return validator.isStrongPassword(password, {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1
    });
  }

  static validateUrl(url) {
    return validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true
    });
  }

  static sanitizeHtml(html) {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      ALLOWED_ATTR: ['href', 'target']
    });
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove null bytes
    input = input.replace(/\0/g, '');
    
    // Escape HTML entities
    input = validator.escape(input);
    
    // Remove non-printable characters
    input = input.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    return input.trim();
  }

  static validateObjectId(id) {
    return validator.isMongoId(id);
  }

  static validateJSON(jsonString) {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }
}

// CSRF protection configuration
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Security headers configuration
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

// SQL injection prevention for MongoDB
const mongoSanitizeOptions = {
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Attempted NoSQL injection: ${key}`);
  }
};

// XSS prevention
const xssProtection = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  // Sanitize params
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? InputValidator.sanitizeInput(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  
  return sanitized;
}

// HTTP Parameter Pollution prevention
const hppProtection = hpp({
  whitelist: ['sort', 'filter', 'page', 'limit'] // Allow these params to have arrays
});

// Security monitoring
const securityMonitor = (req, res, next) => {
  const startTime = Date.now();
  
  // Monitor response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const suspicious = duration > 5000 || res.statusCode >= 400;
    
    if (suspicious) {
      console.log('Security event:', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
  });
  
  next();
};

// Nonce generation for inline scripts
const generateNonce = (req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
};

// Anti-automation detection
const antiAutomation = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const suspiciousPatterns = [
    /bot|crawler|spider|scraper|headless/i,
    /phantom|selenium|puppeteer|playwright/i
  ];
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspicious && !req.path.includes('/api/public')) {
    // Add challenge or rate limit
    req.automationDetected = true;
  }
  
  next();
};

// Clickjacking prevention
const clickjackingProtection = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
};

// Export middleware and utilities
module.exports = {
  // Middleware
  waf: new WebApplicationFirewall(),
  securityHeaders,
  corsProtection: cors(corsOptions),
  csrfProtection,
  mongoSanitize: mongoSanitize(mongoSanitizeOptions),
  xssProtection,
  hppProtection,
  securityMonitor,
  generateNonce,
  antiAutomation,
  clickjackingProtection,
  
  // Utilities
  InputValidator,
  sanitizeObject,
  
  // Combined security middleware
  applySecurityMiddleware: (app) => {
    app.use(securityHeaders);
    app.use(cors(corsOptions));
    app.use(mongoSanitize(mongoSanitizeOptions));
    app.use(xss());
    app.use(hppProtection);
    app.use(securityMonitor);
    app.use(antiAutomation);
    app.use(clickjackingProtection);
  }
};