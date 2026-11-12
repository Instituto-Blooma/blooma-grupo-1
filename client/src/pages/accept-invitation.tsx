import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AcceptInvitation, useAcceptInvitation } from '@djpanda/convex-tenants/react';
import { Authenticated, Unauthenticated, useConvexAuth } from 'convex/react';
import { AuthForm } from '@/components/auth-form';
import { BloomaDotField } from '@/components/blooma-brand';
import { Button } from '@/components/ui/button';
import { api } from '../../../convex/_generated/api';

function AcceptInvitationContent() {
  const { id: invitationId } = useParams({ from: '/accept-invitation/$id' });
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  const acceptState = useAcceptInvitation({
    invitationId,
    getInvitationQuery: api.tenants.getInvitation as never,
    acceptInvitationMutation: api.tenants.acceptInvitation,
    declineInvitationMutation: api.tenants.declineInvitation,
  });

  return (
    <div className="container max-w-lg space-y-4 px-4 py-10">
      <AcceptInvitation
        invitation={acceptState.invitation ?? null}
        organizationName={acceptState.organizationName}
        isLoading={acceptState.isLoading}
        isAuthenticated={isAuthenticated}
        isAccepting={acceptState.isAccepting}
        isDeclining={acceptState.isDeclining}
        accepted={acceptState.accepted}
        declined={acceptState.declined}
        error={acceptState.error ?? undefined}
        onAccept={async () => {
          await acceptState.acceptInvitation();
        }}
        onDecline={async () => {
          await acceptState.declineInvitation();
        }}
        onNavigateToLogin={() => {
          void navigate({ to: '/login' });
        }}
        onNavigateHome={() => {
          void navigate({ to: '/' });
        }}
      />
      <div className="text-sm text-muted-foreground" data-testid="accept-invitation-status">
        {acceptState.isLoading ? 'Carregando convite...' : (acceptState.error ?? 'Pronto')}
      </div>
      <Link to="/login">
        <Button data-testid="button-go-to-login">Ir para o login</Button>
      </Link>
    </div>
  );
}

export function AcceptInvitationPage() {
  return (
    <>
      <Unauthenticated>
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-4">
          <BloomaDotField />
          <div className="relative z-10 w-full max-w-md space-y-6">
            <AcceptInvitationContent />
            <AuthForm />
          </div>
        </div>
      </Unauthenticated>
      <Authenticated>
        <AcceptInvitationContent />
      </Authenticated>
    </>
  );
}
