import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge, UrgencyBadge, formatElapsed, type MedicationRequest } from './shared';

export type RequestAction = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  variant?: 'default' | 'outline' | 'destructive';
  isVisible: (request: MedicationRequest) => boolean;
  onSelect: (request: MedicationRequest) => void;
};

/**
 * Medication requests with every action as a visible button on its row, so nobody has to hunt
 * for a menu during a shift (or a pitch). Sector and bed are always written out in full.
 */
export function RequestTable({
  requests,
  now,
  isLoading,
  actions,
  showRefusalReason = false,
  emptyMessage,
  testId,
}: {
  readonly requests: ReadonlyArray<MedicationRequest>;
  readonly now: number;
  readonly isLoading: boolean;
  readonly actions: ReadonlyArray<RequestAction>;
  readonly showRefusalReason?: boolean;
  readonly emptyMessage: string;
  readonly testId: string;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Carregando solicitações...
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const hasActions = actions.length > 0;

  return (
    <div className="overflow-x-auto rounded-lg border bg-card" data-testid={testId}>
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Urgência</th>
            <th className="px-3 py-2 font-medium">Setor e leito</th>
            <th className="px-3 py-2 font-medium">Medicamento</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Pedido</th>
            <th className="px-3 py-2 font-medium">
              {showRefusalReason ? 'Observação / motivo da recusa' : 'Observação'}
            </th>
            {hasActions ? <th className="px-3 py-2 text-right font-medium">Ações</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {requests.map((request) => {
            const visibleActions = actions.filter((action) => action.isVisible(request));
            return (
              <tr key={request._id} className="align-top" data-testid="request-row">
                <td className="px-3 py-3">
                  <UrgencyBadge urgency={request.urgency} />
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">Setor: {request.sectorName}</div>
                  <div className="text-muted-foreground">{request.bedLabel}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{request.medication}</div>
                  <div className="text-muted-foreground">
                    {request.dose} · {request.route} · {request.quantity}{' '}
                    {request.quantity === 1 ? 'unidade' : 'unidades'}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={request.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  {formatElapsed(request.createdAt, now)}
                </td>
                <td className="max-w-[260px] px-3 py-3">
                  {request.notes ? <p>{request.notes}</p> : null}
                  {showRefusalReason && request.refusalReason ? (
                    <p className="mt-1 font-medium text-red-700 dark:text-red-300">
                      Motivo da recusa: {request.refusalReason}
                    </p>
                  ) : null}
                  {!request.notes && !(showRefusalReason && request.refusalReason) ? (
                    <span className="text-muted-foreground">—</span>
                  ) : null}
                </td>
                {hasActions ? (
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {visibleActions.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {request.status === 'enviado'
                            ? 'Aguardando a enfermagem'
                            : 'Aguardando a farmácia'}
                        </span>
                      ) : (
                        visibleActions.map(({ id, label, icon: Icon, variant, onSelect }) => (
                          <Button
                            key={id}
                            size="sm"
                            variant={variant ?? 'default'}
                            onClick={() => onSelect(request)}
                            data-testid={`action-${id}`}
                          >
                            <Icon className="mr-1 h-4 w-4" />
                            {label}
                          </Button>
                        ))
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
