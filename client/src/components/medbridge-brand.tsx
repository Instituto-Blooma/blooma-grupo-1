import { cn } from '@/lib/utils';

export const PRODUCT_NAME = 'MedBridge';

type MedBridgeWordmarkProps = {
  className?: string;
  compact?: boolean;
  /** Height class for the logo image; defaults to the header (compact) or login size. */
  sizeClassName?: string;
};

/**
 * MedBridge logo (symbol + name) from the brand manual. The light-mode artwork is shown on light
 * backgrounds and the dark-mode artwork on dark mode and high contrast (see `.mb-logo-*` in
 * index.css). Brand rule: never below 120 px wide.
 */
export function MedBridgeWordmark({
  className,
  compact = false,
  sizeClassName,
}: MedBridgeWordmarkProps) {
  const size = sizeClassName ?? (compact ? 'h-7' : 'h-10');
  return (
    <span className={cn('inline-flex items-center', className)}>
      <img
        src="/marca/medbridge-logo-claro.png"
        alt={PRODUCT_NAME}
        className={cn('mb-logo-claro w-auto min-w-[120px] select-none', size)}
        draggable={false}
      />
      <img
        src="/marca/medbridge-logo-escuro.png"
        alt={PRODUCT_NAME}
        className={cn('mb-logo-escuro w-auto min-w-[120px] select-none', size)}
        draggable={false}
      />
    </span>
  );
}
