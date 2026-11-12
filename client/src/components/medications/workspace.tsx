import { useState } from 'react';
import { ArrowLeftRight, History, Home, Pill, Stethoscope } from 'lucide-react';
import { isFinishedStatus } from '../../../../convex/lib/medicationOptions';
import { PRODUCT_NAME } from '@/components/medbridge-brand';
import { Button } from '@/components/ui/button';
import { PROFILE_LABEL, type HospitalProfile } from '@/lib/hospital-profile';
import { RequestHistory } from './history';
import { NursingDashboard, RequestForm, TrackDeliveries } from './nursing';
import { PharmacyQueue } from './pharmacy';
import {
  BedFilter,
  isUnseenRejection,
  matchesBedFilter,
  useHospitalData,
  useNow,
  type BedFilterValue,
} from './shared';

/** Hospital home page: the first screen after signing in with the hospital account. */
export function HospitalHome({
  hospitalName,
  onSelect,
}: {
  readonly hospitalName: string;
  readonly onSelect: (profile: HospitalProfile) => void;
}) {
  const options = [
    { profile: 'enfermagem' as const, title: 'Enfermagem', icon: Stethoscope },
    { profile: 'farmacia' as const, title: 'Farmácia', icon: Pill },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-10 py-10 text-center">
      <div className="space-y-3">
        <h1 className="font-serif text-5xl font-semibold tracking-tight sm:text-7xl">
          {PRODUCT_NAME}
        </h1>
        <p className="text-lg text-muted-foreground">
          Solicitação de medicamentos entre enfermagem e farmácia
        </p>
        <p className="text-xl font-semibold">{hospitalName}</p>
      </div>
      <div className="grid w-full gap-6 sm:grid-cols-2">
        {options.map(({ profile, title, icon: Icon }) => (
          <button
            key={profile}
            type="button"
            onClick={() => onSelect(profile)}
            data-testid={`profile-${profile}`}
            className="flex min-h-56 flex-col items-center justify-center gap-5 rounded-2xl border-2 bg-card p-8 text-card-foreground shadow-sm transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
          >
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-12 w-12" />
            </span>
            <span className="text-3xl font-semibold">Entrar como {title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type NursingScreen = 'painel' | 'solicitar' | 'acompanhar' | 'historico';
type PharmacyScreen = 'fila' | 'historico';

/**
 * Everything inside one profile. The bed filter and the Histórico button stay pinned at the top
 * of every screen of the profile.
 */
export function ProfileArea({
  organizationId,
  hospitalName,
  profile,
  onExit,
}: {
  readonly organizationId: string;
  readonly hospitalName: string;
  readonly profile: HospitalProfile;
  readonly onExit: () => void;
}) {
  const { sectors, requests } = useHospitalData(organizationId);
  const now = useNow();
  const [filter, setFilter] = useState<BedFilterValue>({ sectorId: null, bedId: null });
  const [screen, setScreen] = useState<NursingScreen | PharmacyScreen>(
    profile === 'enfermagem' ? 'painel' : 'fila'
  );

  const isNursing = profile === 'enfermagem';
  const mainScreen = isNursing ? 'painel' : 'fila';
  const isLoading = sectors === undefined || requests === undefined;
  const ProfileIcon = isNursing ? Stethoscope : Pill;
  const visible = (requests ?? []).filter((request) => matchesBedFilter(request, filter));
  const activeCount = visible.filter((request) => !isFinishedStatus(request.status)).length;
  const rejectedCount = visible.filter(isUnseenRejection).length;

  return (
    <div className="space-y-6">
      <div className="sticky top-14 z-40 -mx-4 space-y-4 border-b bg-background/95 px-4 pb-4 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-serif text-2xl font-semibold tracking-tight">{hospitalName}</p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <ProfileIcon className="h-4 w-4" />
              Perfil: <strong className="text-foreground">{PROFILE_LABEL[profile]}</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {screen !== mainScreen ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setScreen(mainScreen)}
                data-testid="go-main"
              >
                <Home className="mr-2 h-4 w-4" />
                {isNursing ? 'Painel' : 'Solicitações'}
              </Button>
            ) : null}
            <Button
              variant={screen === 'historico' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setScreen('historico')}
              data-testid="go-history"
            >
              <History className="mr-2 h-4 w-4" />
              Histórico
            </Button>
            <Button variant="outline" size="lg" onClick={onExit} data-testid="switch-profile">
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Trocar perfil
            </Button>
          </div>
        </div>
        <BedFilter sectors={sectors ?? []} value={filter} onChange={setFilter} />
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Carregando...
        </div>
      ) : sectors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Este hospital ainda não tem setores e leitos cadastrados.
        </div>
      ) : screen === 'historico' ? (
        <RequestHistory requests={requests} filter={filter} now={now} />
      ) : isNursing && screen === 'solicitar' ? (
        <RequestForm
          organizationId={organizationId}
          sectors={sectors}
          preset={filter}
          onCancel={() => setScreen('painel')}
          onCreated={() => setScreen('acompanhar')}
        />
      ) : isNursing && screen === 'acompanhar' ? (
        <TrackDeliveries
          organizationId={organizationId}
          requests={requests}
          filter={filter}
          now={now}
        />
      ) : isNursing ? (
        <NursingDashboard
          onRequest={() => setScreen('solicitar')}
          onTrack={() => setScreen('acompanhar')}
          activeCount={activeCount}
          rejectedCount={rejectedCount}
        />
      ) : (
        <PharmacyQueue
          organizationId={organizationId}
          requests={requests}
          filter={filter}
          now={now}
        />
      )}
    </div>
  );
}
