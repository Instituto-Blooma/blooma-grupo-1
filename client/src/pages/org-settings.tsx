import { Link } from '@tanstack/react-router';
import {
  MembersSection,
  OrgSettingsPanel,
  TeamsSection,
  useTenantsData,
} from '@djpanda/convex-tenants/react';
import { MedBridgeWordmark } from '@/components/medbridge-brand';
import { Button } from '@/components/ui/button';
import { ImpersonationBanner } from '@/components/impersonation-banner';

type SettingsSection = 'members' | 'teams' | 'org';

function SettingsNav({ section }: { section: SettingsSection }) {
  const links: Array<{ to: string; label: string; id: SettingsSection }> = [
    { to: '/settings/members', label: 'Members', id: 'members' },
    { to: '/settings/teams', label: 'Teams', id: 'teams' },
    { to: '/settings/org', label: 'Organization', id: 'org' },
  ];

  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={link.id} to={link.to}>
          <Button variant={section === link.id ? 'default' : 'outline'} size="sm">
            {link.label}
          </Button>
        </Link>
      ))}
    </nav>
  );
}

export function OrgSettingsPage({ section }: { section: SettingsSection }) {
  const { currentOrganization, isLoading } = useTenantsData();

  if (isLoading) {
    return <div className="container p-8">Loading organization settings...</div>;
  }

  if (!currentOrganization) {
    return (
      <div className="container p-8 space-y-4">
        <p>No active organization selected.</p>
        <Link to="/">
          <Button variant="outline">Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ImpersonationBanner />
      <header className="border-b">
        <div className="container space-y-4 px-4 py-6 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <MedBridgeWordmark compact />
              <h1 className="font-serif text-2xl font-semibold">{currentOrganization.name}</h1>
              <p className="text-sm text-muted-foreground">Organization settings</p>
            </div>
            <Link to="/">
              <Button variant="outline">Dashboard</Button>
            </Link>
          </div>
          <SettingsNav section={section} />
        </div>
      </header>
      <main className="container px-4 py-6 md:px-6">
        {section === 'members' ? <MembersSection /> : null}
        {section === 'teams' ? <TeamsSection /> : null}
        {section === 'org' ? <OrgSettingsPanel /> : null}
      </main>
    </div>
  );
}

export function OrgSettingsMembersPage() {
  return <OrgSettingsPage section="members" />;
}

export function OrgSettingsTeamsPage() {
  return <OrgSettingsPage section="teams" />;
}

export function OrgSettingsOrgPage() {
  return <OrgSettingsPage section="org" />;
}
