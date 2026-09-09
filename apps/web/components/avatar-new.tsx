import { cn } from '@/lib/utils';
import { AvatarRoot, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  className?: string;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n, i) => (i < 2 ? n[0]?.toUpperCase() : ''))
    .join('');
}

export function Avatar({ name, src, className }: AvatarProps) {
  return (
    <AvatarRoot className={cn('size-8', className)}>
      {src && <AvatarImage src={src} alt={name ?? 'User'} />}
      <AvatarFallback>{name ? getInitials(name) : '?'}</AvatarFallback>
    </AvatarRoot>
  );
}
