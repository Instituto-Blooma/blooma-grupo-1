import { cn } from '@/lib/utils';

export const PRODUCT_NAME = 'MedBridge';

type MedBridgeWordmarkProps = {
  className?: string;
  compact?: boolean;
};

/** Product name as plain text until the team's logo is ready. */
export function MedBridgeWordmark({ className, compact = false }: MedBridgeWordmarkProps) {
  return (
    <p
      className={cn(
        'font-serif font-semibold leading-none tracking-tight',
        compact ? 'text-xl' : 'text-2xl',
        className
      )}
    >
      {PRODUCT_NAME}
    </p>
  );
}
