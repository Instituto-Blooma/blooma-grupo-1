import { createFileRoute } from '@tanstack/react-router';
import { OrgSettingsSectorsPage } from '@/pages/org-settings';

export const Route = createFileRoute('/_authenticated/settings/setores')({
  component: OrgSettingsSectorsPage,
});
