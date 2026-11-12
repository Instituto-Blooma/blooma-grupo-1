import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '../../../convex/_generated/api';

export function ImpersonationBanner() {
  const { isAuthenticated } = useConvexAuth();
  const session = useQuery(api.platform.getActiveImpersonation, isAuthenticated ? {} : 'skip');
  const stopImpersonation = useMutation(api.platform.stopImpersonation);

  if (!session) {
    return null;
  }

  return (
    <div
      className="border-b bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
      data-testid="impersonation-banner"
    >
      <div className="container flex items-center justify-between gap-4 px-4 py-2 md:px-6">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>
            Acessando como {session.targetName ?? session.targetEmail ?? session.targetUserId}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          data-testid="button-stop-impersonation"
          onClick={() => void stopImpersonation({})}
        >
          Parar de acessar como este usuário
        </Button>
      </div>
    </div>
  );
}
