import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Short explanation shown when the mouse passes over (or the keyboard focuses) a button.
 * The child must be a single element that accepts a ref, such as a Button or Link.
 */
export function Hint({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-center" data-testid="hint">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
