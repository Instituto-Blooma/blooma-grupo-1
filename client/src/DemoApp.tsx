import { Button } from '@/components/ui/button';
import { BloomaDotField } from '@/components/blooma-brand';
import { MedBridgeWordmark } from '@/components/medbridge-brand';

export function DemoApp() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <BloomaDotField />
      <div className="relative mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16 sm:py-24">
        <MedBridgeWordmark />
        <div className="inline-flex w-fit items-center rounded-full border bg-muted px-3 py-1 text-sm text-muted-foreground">
          Demo mode
        </div>

        <section className="space-y-3">
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            Convex is not configured
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Run <code className="rounded bg-muted px-1.5 py-0.5">pnpm run setup</code> or{' '}
            <code className="rounded bg-muted px-1.5 py-0.5">pnpm run dev:backend</code> to generate
            local settings, or set{' '}
            <code className="rounded bg-muted px-1.5 py-0.5">VITE_CONVEX_URL</code> for production
            hosting.
          </p>
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="font-serif text-lg font-medium">Next steps</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>1. Start Convex with `pnpm run dev:backend` in the project root.</li>
            <li>2. Confirm `.env.local` contains `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`.</li>
            <li>3. Restart Vite after updating environment variables.</li>
          </ol>
        </section>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => window.location.reload()}>Retry</Button>
          <Button asChild variant="outline">
            <a href="https://docs.convex.dev/production/hosting/" target="_blank" rel="noreferrer">
              Convex hosting guide
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}
