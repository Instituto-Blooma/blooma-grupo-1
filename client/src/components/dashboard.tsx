import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { usePermission, useTenantsData } from '@djpanda/convex-tenants/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { LogOut } from 'lucide-react';
import { MedBridgeWordmark } from '@/components/medbridge-brand';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/theme-toggle';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { OrganizationContextControl } from '@/components/organization-context-control';
import { HospitalHome, ProfileArea } from '@/components/medications/workspace';
import type { HospitalProfile } from '@/lib/hospital-profile';
import { api } from '../../../convex/_generated/api';

function HospitalArea({
  organizationId,
  hospitalName,
}: {
  readonly organizationId: string;
  readonly hospitalName: string;
}) {
  // Not remembered between visits: every time the site opens, the home page comes first.
  const [profile, setProfile] = useState<HospitalProfile | null>(null);

  if (!profile) {
    return <HospitalHome hospitalName={hospitalName} onSelect={setProfile} />;
  }

  return (
    <ProfileArea
      key={profile}
      organizationId={organizationId}
      hospitalName={hospitalName}
      profile={profile}
      onExit={() => setProfile(null)}
    />
  );
}

export function Dashboard() {
  const { signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const onboardingStatus = useQuery(
    api.onboarding.getMyOnboardingStatus,
    isAuthenticated ? {} : 'skip'
  );
  const isPlatformAdmin = useQuery(
    api.platform.isCurrentUserPlatformAdmin,
    isAuthenticated ? {} : 'skip'
  );
  const { currentOrganization, isOrganizationsLoading } = useTenantsData();
  const canManageSettings = usePermission({
    organizationId: currentOrganization?._id,
    permission: 'settings:manage',
    checkPermissionQuery: api.tenants.checkPermission,
  });

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Você saiu da conta.');
    } catch {
      toast.error('Não foi possível sair da conta');
    }
  };

  const displayName = currentUser?.name ?? 'Usuário';
  const displayEmail = currentUser?.email ?? '';
  const avatarFallback = displayName.charAt(0).toUpperCase() || 'U';

  return (
    <div className="min-h-screen flex flex-col">
      <ImpersonationBanner />
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <MedBridgeWordmark compact />
            <div data-testid="org-switcher">
              <OrganizationContextControl isPlatformAdmin={Boolean(isPlatformAdmin)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManageSettings.allowed ? (
              <Link to="/settings/members">
                <Button variant="ghost" size="sm" data-testid="nav-settings-members">
                  Membros
                </Button>
              </Link>
            ) : null}
            {isPlatformAdmin ? (
              <Link to="/admin">
                <Button variant="ghost" size="sm" data-testid="nav-platform-admin">
                  Admin
                </Button>
              </Link>
            ) : null}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={currentUser?.image ?? undefined} />
                    <AvatarFallback>{avatarFallback}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{displayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{displayEmail}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} data-testid="menu-signout">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 container px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-6">
          {currentUser && isOrganizationsLoading ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Carregando o hospital...
            </div>
          ) : null}

          {currentUser && !isOrganizationsLoading && !currentOrganization && !isPlatformAdmin ? (
            <div
              className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
              data-testid="waiting-for-invitation"
            >
              {onboardingStatus?.status === 'invited'
                ? 'Seu convite está pronto. Entre com o Google usando o e-mail convidado para ativar o acesso.'
                : 'Esta conta ainda não está ligada a nenhum hospital. Fale com a equipe da plataforma.'}
            </div>
          ) : null}

          {currentUser && !isOrganizationsLoading && !currentOrganization && isPlatformAdmin ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Conta de administração da plataforma. Use o{' '}
              <Link to="/admin" className="underline">
                painel de admin
              </Link>{' '}
              para cadastrar hospitais e contas.
            </div>
          ) : null}

          {currentUser && currentOrganization ? (
            <HospitalArea
              key={currentOrganization._id}
              organizationId={currentOrganization._id}
              hospitalName={currentOrganization.name}
            />
          ) : null}
        </div>
      </main>

      <footer className="border-t py-4">
        <div className="container px-4 md:px-6">
          <p className="text-center text-sm text-muted-foreground">
            MedBridge · Solicitação de medicamentos entre enfermagem e farmácia
          </p>
        </div>
      </footer>
    </div>
  );
}
