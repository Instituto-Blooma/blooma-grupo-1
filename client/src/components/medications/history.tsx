import { CheckCircle2, History, XCircle } from 'lucide-react';
import { isFinishedStatus } from '../../../../convex/lib/medicationOptions';
import { cn } from '@/lib/utils';
import {
  StatusBadge,
  UrgencyBadge,
  formatDateTime,
  formatDuration,
  formatLocation,
  matchesBedFilter,
  medicationSummary,
  requestTitle,
  type BedFilterValue,
  type MedicationRequest,
} from './shared';

type TimelineStep = { label: string; at: number };

function timelineFor(request: MedicationRequest): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: 'Solicitado', at: request.createdAt }];
  if (request.separationStartedAt) {
    steps.push({ label: 'Aceito (em preparação)', at: request.separationStartedAt });
  }
  if (request.sentAt) {
    steps.push({ label: 'Enviado', at: request.sentAt });
  }
  if (request.receivedAt) {
    steps.push({ label: 'Recebido no leito', at: request.receivedAt });
  }
  if (request.refusedAt) {
    steps.push({ label: 'Rejeitado', at: request.refusedAt });
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
            <span className="text-lg font-semibold">{requestTitle(request)}</span>
            <UrgencyBadge urgency={request.urgency} />
            <StatusBadge status={request.status} />
          </div>
          <p className="font-medium">{formatLocation(request.sectorName, request.bedLabel)}</p>
          <p className="text-sm text-muted-foreground">
            {medicationSummary(request)} · {request.quantity}{' '}
            {request.quantity === 1 ? 'unidade' : 'unidades'}
          </p>
        </div>
        {last ? (
          <div className="text-right text-sm">
            <p className="text-muted-foreground">{refused ? 'Rejeitado em' : 'Tempo total'}</p>
            <p className="font-semibold">
              {refused ? formatDateTime(last.at, now) : formatDuration(request.createdAt, last.at)}
            </p>
          </div>
        ) : null}
      </div>

      <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-0">
        {steps.map((step, index) => {
          const previous = steps[index - 1];
          const isRefusal = step.label === 'Rejeitado';
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
          Justificativa da rejeição: {request.refusalReason}
        </p>
      ) : null}
    </li>
  );
}

/** Delivered and rejected requests, most recent first, each with its step-by-step timeline. */
export function RequestHistory({
  requests,
  filter,
  now,
}: {
  readonly requests: ReadonlyArray<MedicationRequest>;
  readonly filter: BedFilterValue;
  readonly now: number;
}) {
  const finished = requests
    .filter((request) => isFinishedStatus(request.status) && matchesBedFilter(request, filter))
    .toSorted((left, right) => right.updatedAt - left.updatedAt);
  const delivered = finished.filter((request) => request.status === 'recebido').length;
  const refused = finished.length - delivered;

  return (
    <div className="space-y-6">
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
              <XCircle className="h-4 w-4 text-red-600" /> {refused} rejeitadas
            </span>
          </span>
        </h3>

        {finished.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma solicitação entregue ou rejeitada neste filtro.
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
