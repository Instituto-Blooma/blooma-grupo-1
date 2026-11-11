import { useMemo, useState } from 'react';
import { CheckCircle2, History, XCircle } from 'lucide-react';
import { isFinishedStatus } from '../../../../convex/lib/medicationOptions';
import { cn } from '@/lib/utils';
import {
  BedFilter,
  StatusBadge,
  UrgencyBadge,
  formatDateTime,
  formatDuration,
  matchesBedFilter,
  useHospitalData,
  useNow,
  type BedFilterValue,
  type MedicationRequest,
} from './shared';

type TimelineStep = { label: string; at: number };

function timelineFor(request: MedicationRequest): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: 'Solicitado', at: request.createdAt }];
  if (request.separationStartedAt) {
    steps.push({ label: 'Separação iniciada', at: request.separationStartedAt });
  }
  if (request.sentAt) {
    steps.push({ label: 'Enviado', at: request.sentAt });
  }
  if (request.receivedAt) {
    steps.push({ label: 'Recebido no leito', at: request.receivedAt });
  }
  if (request.refusedAt) {
    steps.push({ label: 'Recusado', at: request.refusedAt });
  }
  return steps;
}

function HistoryItem({
  request,
  now,
}: {
  readonly request: MedicationRequest;
  readonly now: number;
}) {
  const steps = timelineFor(request);
  const last = steps.at(-1);
  const refused = request.status === 'recusado';

  return (
    <li className="rounded-lg border bg-card p-4" data-testid="history-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={request.urgency} />
            <StatusBadge status={request.status} />
          </div>
          <p className="font-semibold">
            {request.medication}{' '}
            <span className="font-normal text-muted-foreground">
              · {request.dose} · {request.route} · {request.quantity}{' '}
              {request.quantity === 1 ? 'unidade' : 'unidades'}
            </span>
          </p>
          <p className="text-sm">
            <span className="font-medium">Setor: {request.sectorName}</span>
            <span className="text-muted-foreground"> · {request.bedLabel}</span>
          </p>
        </div>
        {last ? (
          <div className="text-right text-sm">
            <p className="text-muted-foreground">{refused ? 'Recusado em' : 'Tempo total'}</p>
            <p className="font-semibold">
              {refused ? formatDateTime(last.at, now) : formatDuration(request.createdAt, last.at)}
            </p>
          </div>
        ) : null}
      </div>

      <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-0">
        {steps.map((step, index) => {
          const previous = steps[index - 1];
          const isRefusal = step.label === 'Recusado';
          return (
            <li key={step.label} className="flex items-start gap-2 sm:items-center">
              {index > 0 ? (
                <span className="hidden text-xs text-muted-foreground sm:mx-2 sm:inline">
                  {previous ? `— ${formatDuration(previous.at, step.at)} →` : '→'}
                </span>
              ) : null}
              <span
                className={cn(
                  'mt-1 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0',
                  isRefusal ? 'bg-red-500' : 'bg-primary'
                )}
              />
              <span className="text-sm">
                <span className="font-medium">{step.label}</span>{' '}
                <span className="text-muted-foreground">{formatDateTime(step.at, now)}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {request.deadline ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Prazo informado: {formatDateTime(request.deadline, now)}
        </p>
      ) : null}
      {request.notes ? (
        <p className="mt-1 text-sm text-muted-foreground">Observação: {request.notes}</p>
      ) : null}
      {refused && request.refusalReason ? (
        <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">
          Motivo da recusa: {request.refusalReason}
        </p>
      ) : null}
    </li>
  );
}

/** Delivered and refused requests, most recent first, each with its step-by-step timeline. */
export function RequestHistory({ organizationId }: { readonly organizationId: string }) {
  const { sectors, requests } = useHospitalData(organizationId);
  const now = useNow();
  const [filter, setFilter] = useState<BedFilterValue>({ sectorId: null, bedId: null });

  const finished = useMemo(
    () =>
      (requests ?? [])
        .filter((request) => isFinishedStatus(request.status) && matchesBedFilter(request, filter))
        .toSorted((left, right) => right.updatedAt - left.updatedAt),
    [requests, filter]
  );
  const delivered = finished.filter((request) => request.status === 'recebido').length;
  const refused = finished.length - delivered;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <BedFilter sectors={sectors ?? []} value={filter} onChange={setFilter} />
      </div>

      <section className="space-y-3">
        <h3 className="flex flex-wrap items-center gap-x-4 gap-y-1 text-lg font-semibold">
          <span className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Histórico de solicitações
          </span>
          <span className="flex items-center gap-3 text-sm font-normal text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {delivered} entregues
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-600" /> {refused} recusadas
            </span>
          </span>
        </h3>

        {requests === undefined ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Carregando histórico...
          </div>
        ) : finished.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma solicitação entregue ou recusada neste filtro.
          </div>
        ) : (
          <ul className="space-y-3">
            {finished.map((request) => (
              <HistoryItem key={request._id} request={request} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
