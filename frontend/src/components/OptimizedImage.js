import React, { useEffect, useRef, useState } from 'react';
import { ImageLazyLoader, generatePictureData, detectBestImageFormat } from '../utils/imageOptimizer';

const imageLoader = new ImageLazyLoader();

export const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  sizes = '100vw',
  priority = false,
  placeholder = null,
  aspectRatio = null,
  onLoad = null,
  onError = null,
}) => {
  const imgRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const img = imgRef.current;
    
    if (img && !priority) {
      // Use lazy loading for non-priority images
      img.dataset.src = src;
      imageLoader.observe(img);
      
      const handleLoad = () => {
        setIsLoaded(true);
        onLoad?.();
      };
      
      const handleError = () => {
        setHasError(true);
        onError?.();
      };
      
      img.addEventListener('load', handleLoad);
      img.addEventListener('error', handleError);
      
      return () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
      };
    } else if (img && priority) {
      // Load priority images immediately
      img.src = src;
    }
  }, [src, priority, onLoad, onError]);

  const wrapperStyle = aspectRatio ? {
    position: 'relative',
    paddingBottom: `${(1 / aspectRatio) * 100}%`,
    overflow: 'hidden',
  } : {};

  const imgStyle = aspectRatio ? {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  } : {};

  return (
    <div className={`image-wrapper ${className}`} style={wrapperStyle}>
      {placeholder && !isLoaded && (
        <img
          src={placeholder}
          alt=""
          className="placeholder-image"
          style={{
            ...imgStyle,
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
          aria-hidden="true"
        />
      )}
      
      <img
        ref={imgRef}
        alt={alt}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`optimized-image ${isLoaded ? 'loaded' : ''} ${hasError ? 'error' : ''}`}
        style={imgStyle}
        src={priority ? src : undefined}
      />
      
      {hasError && (
        <div className="image-error" style={imgStyle}>
          <span>Failed to load image</span>
        </div>
      )}
    </div>
  );
};

export const Picture = ({ 
  src, 
  alt, 
  sizes = '100vw',
  formats = ['webp', 'jpeg'],
  className = '',
}) => {
  const baseSrc = src.replace(/\.[^.]+$/, '');
  const pictureData = generatePictureData(baseSrc, alt, sizes);

  return (
    <picture className={className}>
      {pictureData.sources.map((source, index) => (
        <source
          key={index}
          type={source.type}
          srcSet={source.srcSet}
          sizes={sizes}
        />
      ))}
      <img
        {...pictureData.img}
        className="picture-img"
      />
    </picture>
  );
};

export const ResponsiveImage = ({ 
  src, 
  alt, 
  breakpoints = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
  sizes = {
    default: '100vw',
    sm: '100vw',
    md: '50vw',
    lg: '33vw',
  },
  className = '',
}) => {
  const sizesString = Object.entries(breakpoints)
    .reverse()
    .map(([key, breakpoint]) => `(min-width: ${breakpoint}) ${sizes[key] || sizes.default}`)
    .concat(sizes.default)
    .join(', ');

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      sizes={sizesString}
      className={className}
    />
  );
};

export default OptimizedImage;