// Critical CSS extraction and optimization utilities

class CriticalCSSManager {
  constructor() {
    this.criticalStyles = new Map();
    this.loadedStyles = new Set();
    this.observer = null;
  }

  // Extract critical CSS for above-the-fold content
  extractCriticalCSS(selector = '[data-critical]') {
    const criticalElements = document.querySelectorAll(selector);
    const usedSelectors = new Set();
    
    // Get all stylesheets
    const stylesheets = Array.from(document.styleSheets);
    
    criticalElements.forEach(element => {
      const computedStyles = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      // Check if element is above the fold
      if (rect.top < window.innerHeight) {
        // Get matching CSS rules
        stylesheets.forEach(stylesheet => {
          try {
            const rules = Array.from(stylesheet.cssRules || []);
            rules.forEach(rule => {
              if (rule.selectorText && element.matches(rule.selectorText)) {
                usedSelectors.add(rule.cssText);
              }
            });
          } catch (e) {
            // Cross-origin stylesheets may throw
          }
        });
      }
    });
    
    return Array.from(usedSelectors).join('\n');
  }

  // Inline critical CSS
  inlineCriticalCSS(css) {
    const style = document.createElement('style');
    style.textContent = css;
    style.setAttribute('data-critical', 'true');
    document.head.insertBefore(style, document.head.firstChild);
  }

  // Lazy load non-critical CSS
  loadNonCriticalCSS(href, media = 'all') {
    if (this.loadedStyles.has(href)) return;
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'print'; // Temporarily set to print to avoid render blocking
    
    link.onload = () => {
      link.media = media; // Switch to intended media after load
      this.loadedStyles.add(href);
    };
    
    document.head.appendChild(link);
  }

  // Preload critical fonts
  preloadFonts(fonts) {
    fonts.forEach(font => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'font';
      link.href = font.url;
      link.type = font.type || 'font/woff2';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }

  // Generate resource hints
  generateResourceHints(resources) {
    const hints = {
      preconnect: [],
      prefetch: [],
      preload: [],
      modulepreload: [],
    };
    
    resources.forEach(resource => {
      const link = document.createElement('link');
      link.rel = resource.type;
      
      switch (resource.type) {
        case 'preconnect':
          link.href = resource.url;
          if (resource.crossOrigin) {
            link.crossOrigin = 'anonymous';
          }
          hints.preconnect.push(link);
          break;
          
        case 'prefetch':
          link.href = resource.url;
          link.as = resource.as || 'fetch';
          hints.prefetch.push(link);
          break;
          
        case 'preload':
          link.href = resource.url;
          link.as = resource.as;
          if (resource.type) link.type = resource.type;
          if (resource.crossOrigin) link.crossOrigin = 'anonymous';
          hints.preload.push(link);
          break;
          
        case 'modulepreload':
          link.href = resource.url;
          hints.modulepreload.push(link);
          break;
      }
      
      document.head.appendChild(link);
    });
    
    return hints;
  }

  // Optimize CSS delivery
  optimizeCSSDelivery() {
    // Find all link elements
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    
    links.forEach(link => {
      // Skip already optimized links
      if (link.hasAttribute('data-optimized')) return;
      
      const href = link.href;
      const media = link.media || 'all';
      
      // Create a new link element
      const newLink = document.createElement('link');
      newLink.rel = 'preload';
      newLink.as = 'style';
      newLink.href = href;
      newLink.setAttribute('data-optimized', 'true');
      
      // Load the stylesheet
      newLink.onload = function() {
        this.onload = null;
        this.rel = 'stylesheet';
        this.media = media;
      };
      
      // Insert before the original link
      link.parentNode.insertBefore(newLink, link);
      
      // Remove the original link
      link.remove();
    });
  }

  // Monitor and lazy load below-the-fold CSS
  setupLazyCSS() {
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const element = entry.target;
              const cssFile = element.dataset.css;
              
              if (cssFile) {
                this.loadNonCriticalCSS(cssFile);
                this.observer.unobserve(element);
              }
            }
          });
        },
        { rootMargin: '50px' }
      );
      
      // Observe elements with lazy CSS
      document.querySelectorAll('[data-css]').forEach(el => {
        this.observer.observe(el);
      });
    }
  }

  // Remove unused CSS
  removeUnusedCSS() {
    const stylesheets = Array.from(document.styleSheets);
    const usedSelectors = new Set();
    
    // Find all used selectors
    document.querySelectorAll('*').forEach(element => {
      stylesheets.forEach(stylesheet => {
        try {
          const rules = Array.from(stylesheet.cssRules || []);
          rules.forEach(rule => {
            if (rule.selectorText && element.matches(rule.selectorText)) {
              usedSelectors.add(rule.selectorText);
            }
          });
        } catch (e) {
          // Ignore cross-origin errors
        }
      });
    });
    
    // Remove unused rules
    stylesheets.forEach(stylesheet => {
      try {
        const rules = Array.from(stylesheet.cssRules || []);
        for (let i = rules.length - 1; i >= 0; i--) {
          const rule = rules[i];
          if (rule.selectorText && !usedSelectors.has(rule.selectorText)) {
            stylesheet.deleteRule(i);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    });
  }

  // Get performance metrics
  getMetrics() {
    const metrics = {
      stylesheets: document.styleSheets.length,
      criticalStyles: this.criticalStyles.size,
      loadedStyles: this.loadedStyles.size,
      totalCSSSize: 0,
      renderBlockingCSS: 0,
    };
    
    // Calculate CSS sizes
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        const rules = Array.from(sheet.cssRules || []);
        const cssText = rules.map(r => r.cssText).join('');
        metrics.totalCSSSize += cssText.length;
        
        // Check if render blocking
        const link = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .find(l => l.href === sheet.href);
        
        if (link && !link.media || link.media === 'all') {
          metrics.renderBlockingCSS++;
        }
      } catch (e) {
        // Ignore cross-origin errors
      }
    });
    
    return metrics;
  }
}

// Resource hint manager
export class ResourceHintManager {
  constructor() {
    this.hints = new Map();
    this.applied = new Set();
  }

  // Add preconnect hints for external domains
  addPreconnect(origins) {
    origins.forEach(origin => {
      if (!this.applied.has(`preconnect:${origin}`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = origin;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
        this.applied.add(`preconnect:${origin}`);
      }
    });
  }

  // Add DNS prefetch for external domains
  addDNSPrefetch(domains) {
    domains.forEach(domain => {
      if (!this.applied.has(`dns-prefetch:${domain}`)) {
        const link = document.createElement('link');
        link.rel = 'dns-prefetch';
        link.href = `//${domain}`;
        document.head.appendChild(link);
        this.applied.add(`dns-prefetch:${domain}`);
      }
    });
  }

  // Preload critical resources
  preloadResources(resources) {
    resources.forEach(resource => {
      if (!this.applied.has(`preload:${resource.href}`)) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = resource.href;
        link.as = resource.as;
        
        if (resource.type) link.type = resource.type;
        if (resource.crossOrigin) link.crossOrigin = resource.crossOrigin;
        if (resource.integrity) link.integrity = resource.integrity;
        
        document.head.appendChild(link);
        this.applied.add(`preload:${resource.href}`);
      }
    });
  }

  // Prefetch resources for future navigation
  prefetchResources(urls) {
    urls.forEach(url => {
      if (!this.applied.has(`prefetch:${url}`)) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = 'document';
        document.head.appendChild(link);
        this.applied.add(`prefetch:${url}`);
      }
    });
  }
}

export default new CriticalCSSManager();