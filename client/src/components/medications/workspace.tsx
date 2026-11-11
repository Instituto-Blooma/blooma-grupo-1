import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import {
  ClipboardList,
  PackageCheck,
  PackageOpen,
  Pill,
  Plus,
  Send,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import { isFinishedStatus } from '../../../../convex/lib/medicationOptions';
import { Button } from '@/components/ui/button';
import type { HospitalProfile } from '@/lib/hospital-profile';
import { NewRequestDialog } from './new-request-dialog';
import { RefuseDialog } from './refuse-dialog';
import { RequestTable, type RequestAction } from './request-table';
import {
  BedFilter,
  formatLocation,
  matchesBedFilter,
  useHospitalData,
  useNow,
  type BedFilterValue,
  type MedicationRequest,
} from './shared';

function run(action: () => Promise<unknown>, success: string) {
  action()
    .then(() => toast.success(success))
    .catch((error: unknown) => toast.error(errorMessage(error)));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^.*Uncaught Error: /, '')
    : 'Algo deu errado';
}

/** Shown right after signing in with the hospital account. */
export function ProfilePicker({
  hospitalName,
  onSelect,
}: {
  readonly hospitalName: string;
  readonly onSelect: (profile: HospitalProfile) => void;
}) {
  const options = [
    {
      profile: 'enfermagem' as const,
      title: 'Enfermagem',
      description: 'Solicitar medicamentos para os leitos e confirmar o recebimento.',
      icon: Stethoscope,
    },
    {
      profile: 'farmacia' as const,
      title: 'Farmácia',
      description: 'Ver a fila por urgência, separar, enviar ou recusar pedidos.',
      icon: Pill,
    },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-6 text-center">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Quem está usando?</h2>
        <p className="mt-1 text-muted-foreground">{hospitalName} · escolha o seu perfil</p>
      </div>
      <div className="grid w-full gap-4 sm:grid-cols-2">
        {options.map(({ profile, title, description, icon: Icon }) => (
          <button
            key={profile}
            type="button"
            onClick={() => onSelect(profile)}
            data-testid={`profile-${profile}`}
            className="flex flex-col items-center gap-3 rounded-xl border-2 bg-card p-6 text-card-foreground transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-7 w-7" />
            </span>
            <span className="text-lg font-semibold">{title}</span>
            <span className="text-sm text-muted-foreground">{description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function splitRequests(requests: ReadonlyArray<MedicationRequest>, filter: BedFilterValue) {
  const visible = requests.filter((request) => matchesBedFilter(request, filter));
  // Server order is already: most urgent first, oldest first within the same urgency.
  const active = visible.filter((request) => !isFinishedStatus(request.status));
  const finished = visible
    .filter((request) => isFinishedStatus(request.status))
    .toSorted((left, right) => right.updatedAt - left.updatedAt);
  return { active, finished };
}

function SectionTitle({
  icon: Icon,
  title,
  count,
}: {
  readonly icon: typeof Pill;
  readonly title: string;
  readonly count: number;
}) {
  return (
    <h3 className="flex items-center gap-2 text-lg font-semibold">
      <Icon className="h-5 w-5 text-muted-foreground" />
      {title}
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {count}
      </span>
    </h3>
  );
}

export function MedicationWorkspace({
  organizationId,
  profile,
}: {
  readonly organizationId: string;
  readonly profile: HospitalProfile;
}) {
  const { sectors, requests } = useHospitalData(organizationId);
  const now = useNow();
  const [filter, setFilter] = useState<BedFilterValue>({ sectorId: null, bedId: null });
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [refusing, setRefusing] = useState<MedicationRequest | null>(null);

  const startSeparation = useMutation(api.medications.startSeparation);
  const markSent = useMutation(api.medications.markSent);
  const refuse = useMutation(api.medications.refuse);
  const confirmReceived = useMutation(api.medications.confirmReceived);

  const isLoading = sectors === undefined || requests === undefined;
  const { active, finished } = useMemo(
    () => splitRequests(requests ?? [], filter),
    [requests, filter]
  );
  const actions = useMemo<ReadonlyArray<RequestAction>>(() => {
    if (profile === 'enfermagem') {
      return [
        {
          id: 'confirm-received',
          label: 'Confirmar recebimento',
          icon: PackageCheck,
          isVisible: (request) => request.status === 'enviado',
          onSelect: (request) =>
            run(
              () => confirmReceived({ organizationId, requestId: request._id }),
              `Recebimento confirmado (${formatLocation(request.sectorName, request.bedLabel)})`
            ),
        },
      ];
    }
    return [
      {
        id: 'start-separation',
        label: 'Iniciar separação',
        icon: PackageOpen,
        isVisible: (request) => request.status === 'solicitado',
        onSelect: (request) =>
          run(
            () => startSeparation({ organizationId, requestId: request._id }),
            `Separação iniciada: ${request.medication}`
          ),
      },
      {
        id: 'mark-sent',
        label: 'Marcar como enviado',
        icon: Send,
        isVisible: (request) => request.status === 'em_separacao',
        onSelect: (request) =>
          run(
            () => markSent({ organizationId, requestId: request._id }),
            `Enviado para ${formatLocation(request.sectorName, request.bedLabel)}`
          ),
      },
      {
        id: 'refuse',
        label: 'Recusar',
        icon: XCircle,
        variant: 'outline',
        isVisible: (request) =>
          request.status === 'solicitado' || request.status === 'em_separacao',
        onSelect: (request) => setRefusing(request),
      },
    ];
  }, [profile, organizationId, confirmReceived, startSeparation, markSent]);

  if (!isLoading && sectors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Este hospital ainda não tem setores e leitos cadastrados.
      </div>
    );
  }

  const isPharmacy = profile === 'farmacia';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <BedFilter sectors={sectors ?? []} value={filter} onChange={setFilter} />
        {!isPharmacy ? (
          <Button onClick={() => setIsNewOpen(true)} disabled={isLoading} data-testid="new-request">
            <Plus className="mr-1 h-4 w-4" />
            Nova solicitação
          </Button>
        ) : null}
      </div>

      <section className="space-y-3">
        <SectionTitle
          icon={isPharmacy ? Pill : ClipboardList}
          title={isPharmacy ? 'Fila da farmácia' : 'Solicitações em andamento'}
          count={active.length}
        />
        <p className="text-sm text-muted-foreground">
          {isPharmacy
            ? 'Ordem de atendimento: Urgente, depois Prioritário, depois Rotina. Dentro de cada nível, o pedido mais antigo vem primeiro.'
            : 'Quando a farmácia marcar um pedido como "Enviado", confirme o recebimento assim que o medicamento chegar ao leito.'}
        </p>
        <RequestTable
          testId={isPharmacy ? 'pharmacy-queue' : 'nursing-active'}
          requests={active}
          now={now}
          isLoading={isLoading}
          actions={actions}
          emptyMessage={
            isPharmacy
              ? 'Nenhum pedido aguardando a farmácia neste filtro.'
              : 'Nenhuma solicitação em andamento neste filtro.'
          }
        />
      </section>

      <section className="space-y-3">
        <SectionTitle icon={PackageCheck} title="Finalizadas" count={finished.length} />
        <RequestTable
          testId="finished-requests"
          requests={finished}
          now={now}
          isLoading={isLoading}
          actions={[]}
          showRefusalReason
          emptyMessage="Nenhuma solicitação recebida ou recusada neste filtro."
        />
      </section>

      {!isPharmacy && sectors ? (
        <NewRequestDialog
          key={isNewOpen ? 'aberto' : 'fechado'}
          open={isNewOpen}
          onOpenChange={setIsNewOpen}
          organizationId={organizationId}
          sectors={sectors}
          preset={filter}
        />
      ) : null}

      <RefuseDialog
        request={refusing}
        onClose={() => setRefusing(null)}
        onConfirm={async (reason) => {
          if (!refusing) return;
          try {
            await refuse({ organizationId, requestId: refusing._id, reason });
            toast.success('Solicitação recusada. A enfermagem verá o motivo.');
            setRefusing(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}
