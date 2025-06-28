// Image optimization utilities for performance

export const IMAGE_SIZES = {
  thumbnail: { width: 150, height: 150 },
  small: { width: 300, height: 300 },
  medium: { width: 600, height: 600 },
  large: { width: 1200, height: 1200 },
  hero: { width: 1920, height: 1080 },
};

export const IMAGE_FORMATS = ['webp', 'jpeg', 'png'];

// Generate responsive image srcset
export const generateSrcSet = (baseUrl, sizes = ['small', 'medium', 'large']) => {
  return sizes
    .map(size => {
      const { width } = IMAGE_SIZES[size];
      return `${baseUrl}?w=${width} ${width}w`;
    })
    .join(', ');
};

// Generate picture element with multiple formats
export const generatePictureData = (baseUrl, alt, sizes = '100vw') => {
  const formats = IMAGE_FORMATS.slice(0, -1); // Exclude last format (fallback)
  
  return {
    sources: formats.map(format => ({
      type: `image/${format}`,
      srcSet: generateSrcSet(`${baseUrl}.${format}`),
    })),
    img: {
      src: `${baseUrl}.${IMAGE_FORMATS[IMAGE_FORMATS.length - 1]}`,
      srcSet: generateSrcSet(`${baseUrl}.${IMAGE_FORMATS[IMAGE_FORMATS.length - 1]}`),
      sizes,
      alt,
      loading: 'lazy',
      decoding: 'async',
    },
  };
};

// Lazy load images with Intersection Observer
export class ImageLazyLoader {
  constructor(options = {}) {
    this.options = {
      rootMargin: '50px',
      threshold: 0.01,
      ...options,
    };
    
    this.observer = null;
    this.init();
  }

  init() {
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        this.handleIntersection.bind(this),
        this.options
      );
    }
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        this.loadImage(entry.target);
        this.observer.unobserve(entry.target);
      }
    });
  }

  loadImage(img) {
    const src = img.dataset.src;
    const srcset = img.dataset.srcset;
    
    if (src) {
      img.src = src;
    }
    
    if (srcset) {
      img.srcset = srcset;
    }
    
    img.classList.add('loaded');
    
    // Preload next image if available
    const nextImg = img.parentElement?.nextElementSibling?.querySelector('img[data-src]');
    if (nextImg) {
      this.preloadImage(nextImg);
    }
  }

  preloadImage(img) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = img.dataset.src;
    
    if (img.dataset.srcset) {
      link.imageSrcset = img.dataset.srcset;
    }
    
    document.head.appendChild(link);
  }

  observe(element) {
    if (this.observer && element) {
      this.observer.observe(element);
    } else if (!this.observer) {
      // Fallback for browsers without IntersectionObserver
      this.loadImage(element);
    }
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

// Progressive image loading
export class ProgressiveImage {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      blurRadius: 20,
      transitionDuration: 300,
      ...options,
    };
    
    this.init();
  }

  init() {
    // Load low quality placeholder
    const placeholder = this.element.dataset.placeholder;
    if (placeholder) {
      this.loadPlaceholder(placeholder);
    }
    
    // Load full image
    this.loadFullImage();
  }

  loadPlaceholder(src) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      this.element.style.backgroundImage = `url(${src})`;
      this.element.style.filter = `blur(${this.options.blurRadius}px)`;
      this.element.classList.add('placeholder-loaded');
    };
  }

  loadFullImage() {
    const img = new Image();
    const src = this.element.dataset.src;
    
    if (this.element.dataset.srcset) {
      img.srcset = this.element.dataset.srcset;
    }
    
    img.src = src;
    img.onload = () => {
      this.element.style.backgroundImage = `url(${src})`;
      this.element.style.filter = 'none';
      this.element.style.transition = `filter ${this.options.transitionDuration}ms`;
      this.element.classList.add('image-loaded');
      
      // Clean up placeholder
      setTimeout(() => {
        this.element.classList.remove('placeholder-loaded');
      }, this.options.transitionDuration);
    };
  }
}

// Image format detection
export const detectBestImageFormat = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  
  const formats = {
    webp: canvas.toDataURL('image/webp').indexOf('image/webp') === 5,
    avif: canvas.toDataURL('image/avif').indexOf('image/avif') === 5,
  };
  
  if (formats.avif) return 'avif';
  if (formats.webp) return 'webp';
  return 'jpeg';
};

// Create optimized image component
export const createOptimizedImage = (src, alt, options = {}) => {
  const {
    sizes = '100vw',
    loading = 'lazy',
    className = '',
    aspectRatio = null,
  } = options;

  const format = detectBestImageFormat();
  const srcWithFormat = src.includes('.') 
    ? src.replace(/\.[^.]+$/, `.${format}`)
    : `${src}.${format}`;

  const imgElement = document.createElement('img');
  imgElement.src = srcWithFormat;
  imgElement.alt = alt;
  imgElement.loading = loading;
  imgElement.decoding = 'async';
  imgElement.className = className;
  
  if (aspectRatio) {
    imgElement.style.aspectRatio = aspectRatio;
    imgElement.style.width = '100%';
    imgElement.style.height = 'auto';
  }

  // Add responsive srcset
  imgElement.srcset = generateSrcSet(srcWithFormat);
  imgElement.sizes = sizes;

  return imgElement;
};

export default {
  ImageLazyLoader,
  ProgressiveImage,
  generateSrcSet,
  generatePictureData,
  detectBestImageFormat,
  createOptimizedImage,
};