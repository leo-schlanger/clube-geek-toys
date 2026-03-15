/**
 * LazyImage - Componente de imagem com lazy loading
 *
 * Utiliza loading="lazy" nativo do navegador e exibe
 * um placeholder enquanto a imagem carrega.
 *
 * @example
 * <LazyImage
 *   src="/images/photo.jpg"
 *   alt="Foto do usuário"
 *   className="w-32 h-32 rounded-full"
 * />
 */

import { useState, useCallback } from 'react'
import { cn } from '../../lib/utils'

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** URL da imagem */
  src: string
  /** Texto alternativo */
  alt: string
  /** URL da imagem de fallback em caso de erro */
  fallbackSrc?: string
  /** Mostrar skeleton enquanto carrega */
  showSkeleton?: boolean
  /** Classes do container */
  containerClassName?: string
}

/**
 * Componente de imagem com lazy loading e fallback
 */
export function LazyImage({
  src,
  alt,
  fallbackSrc = '/placeholder.svg',
  showSkeleton = true,
  className,
  containerClassName,
  ...props
}: LazyImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => {
    setIsLoading(false)
  }, [])

  const handleError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
  }, [])

  const imageSrc = hasError ? fallbackSrc : src

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      {/* Skeleton placeholder */}
      {showSkeleton && isLoading && (
        <div
          className={cn(
            'absolute inset-0 bg-muted animate-pulse',
            className
          )}
          aria-hidden="true"
        />
      )}

      {/* Imagem */}
      <img
        src={imageSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          'transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
          className
        )}
        {...props}
      />
    </div>
  )
}

/**
 * Avatar com lazy loading
 */
interface LazyAvatarProps {
  src?: string | null
  alt: string
  fallback?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
}

export function LazyAvatar({
  src,
  alt,
  fallback,
  size = 'md',
  className,
}: LazyAvatarProps) {
  const [hasError, setHasError] = useState(false)

  // Se não tem src ou deu erro, mostra iniciais
  if (!src || hasError) {
    const initials = fallback || alt
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()

    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium',
          SIZE_CLASSES[size],
          className
        )}
        aria-label={alt}
      >
        {initials}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setHasError(true)}
      className={cn(
        'rounded-full object-cover',
        SIZE_CLASSES[size],
        className
      )}
    />
  )
}
