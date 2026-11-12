import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { AccessibilityBar } from '@/components/accessibility-bar';
import NotFound from '@/pages/not-found';
import { isDevToolsEnabled } from '@/lib/dev-tools';
import type { RouterAuthContext } from '@/lib/router-auth-context';

export const Route = createRootRouteWithContext<RouterAuthContext>()({
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <>
      <AccessibilityBar />
      <Outlet />
      {isDevToolsEnabled() ? <TanStackRouterDevtools /> : null}
    </>
  );
}
