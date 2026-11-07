import { memo } from 'react'
import { defaultAvatar } from '@/lib/format'

/** Circular profile photograph with generated monogram fallback. */
export const Avatar = memo(function Avatar({
  src,
  name,
  size = 36,
  className,
}: {
  src?: string | null
  name: string
  size?: number
  className?: string
}) {
  const style = { width: size, height: size }
  return (
    <img
      src={src ?? defaultAvatar(name)}
      alt={name}
      width={size}
      height={size}
      style={style}
      draggable={false}
      className={`shrink-0 rounded-full border border-white/10 bg-vault-bg2 object-cover ${className ?? ''}`}
    />
  )
})
