import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import '@talentum-ventures/convex-datatable/styles.css';
import './index.css';
// Applies saved accessibility preferences (font size, high contrast) before the first render.
import '@/lib/accessibility';
import { DemoApp } from './DemoApp';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { AuthRouterProvider } from '@/components/auth-router-provider';

const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim();
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

const root = createRoot(rootElement);

if (convexUrl) {
  const convex = new ConvexReactClient(convexUrl);

  root.render(
    <StrictMode>
      <ConvexAuthProvider client={convex}>
        <ThemeProvider defaultTheme="system" storageKey="app-theme">
          <TooltipProvider>
            <Toaster />
            <AuthRouterProvider />
          </TooltipProvider>
        </ThemeProvider>
      </ConvexAuthProvider>
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <DemoApp />
    </StrictMode>
  );
}
