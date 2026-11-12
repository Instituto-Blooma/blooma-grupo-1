import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useTenantsActions, useTenantsData } from '@djpanda/convex-tenants/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type OrganizationContextControlProps = {
  isPlatformAdmin: boolean;
};

export function OrganizationContextControl({ isPlatformAdmin }: OrganizationContextControlProps) {
  const { organizations, currentOrganization, isOrganizationsLoading } = useTenantsData();
  const { switchOrganization } = useTenantsActions();

  if (isOrganizationsLoading) {
    return (
      <span className="text-sm text-muted-foreground" data-testid="org-name-loading">
        Carregando...
      </span>
    );
  }

  if (!currentOrganization) {
    return null;
  }

  if (!isPlatformAdmin || organizations.length <= 1) {
    return (
      <span className="text-sm font-medium text-muted-foreground" data-testid="org-name-label">
        {currentOrganization.name}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="org-switcher-trigger">
          <Building2 className="h-4 w-4" />
          <span data-testid="org-switcher-current">{currentOrganization.name}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid="org-switcher-menu">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org._id}
            data-testid={`org-switcher-option-${org.slug}`}
            onSelect={() => switchOrganization(org._id)}
          >
            <Check
              className={cn(
                'mr-2 h-4 w-4',
                org._id === currentOrganization._id ? 'opacity-100' : 'opacity-0'
              )}
            />
            {org.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
