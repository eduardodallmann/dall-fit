import { useRef } from 'react';

import {
  Alert,
  Button,
  Card,
  Meter,
  Skeleton,
  Table,
  Typography,
} from '@heroui/react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

import type {
  AdminDashboard,
  Dashboard,
  DashboardWeeklyTrendItem,
} from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';
import {
  formatDashboardDateTime,
  formatDashboardDuration,
  formatDashboardWeek,
} from '~/routes/dashboard/dashboard-formatters';
import {
  adminDashboardQueryOptions,
  dashboardQueryOptions,
} from '~/routes/dashboard/dashboard-queries';
import type { MockDashboardScenario } from '~/routes/dashboard/dashboard-service';
import { dashboardStyles } from '~/routes/dashboard/styles';

const styles = dashboardStyles();
const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

interface DashboardPageProps {
  isAdmin: boolean;
  scenario: MockDashboardScenario;
}

export function DashboardPage({
  isAdmin,
  scenario,
}: Readonly<DashboardPageProps>) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const personal = useQuery(dashboardQueryOptions(scenario, timezone));
  const admin = useQuery({
    ...adminDashboardQueryOptions(scenario, timezone),
    enabled: isAdmin,
  });

  return (
    <div className={styles.content()}>
      <section aria-labelledby="dashboard-heading" className={styles.page()}>
        <header className={styles.heading()}>
          <h1 className={styles.headingLarge()} id="dashboard-heading">
            Visão geral
          </h1>
          <Typography color="muted">Seu treino em um só lugar.</Typography>
        </header>
        <PersonalDashboardState query={personal} timezone={timezone} />
      </section>
      {isAdmin ? <AdminDashboardState query={admin} /> : null}
    </div>
  );
}

type DashboardQuery = UseQueryResult<Dashboard>;
type AdminDashboardQuery = UseQueryResult<AdminDashboard>;

function PersonalDashboardState({
  query,
  timezone,
}: Readonly<{ query: DashboardQuery; timezone: string }>) {
  if (query.isPending)
    return <DashboardLoading label="Carregando sua visão geral" />;
  if (query.isError || query.data === undefined)
    return (
      <DashboardError
        message="Não foi possível carregar sua visão geral."
        onRetry={() => query.refetch()}
        resource="dashboard"
      />
    );

  return <PersonalDashboardContent data={query.data} timezone={timezone} />;
}

function PersonalDashboardContent({
  data,
  timezone,
}: Readonly<{ data: Dashboard; timezone: string }>) {
  return (
    <>
      <div className={styles.cardGrid()}>
        <NextActionCard data={data} />
        <CurrentWeekCard data={data} />
      </div>
      <section aria-labelledby="last-30-days-heading" className={styles.page()}>
        <h2 className={styles.headingSmall()} id="last-30-days-heading">
          Últimos 30 dias
        </h2>
        <div className={styles.kpiGrid()}>
          <MetricCard
            label="Treinos concluídos"
            value={String(data.last30Days.completedWorkoutCount)}
          />
          <MetricCard
            label="Tempo total"
            value={formatDashboardDuration(
              data.last30Days.totalDurationSeconds,
            )}
          />
          <MetricCard
            label="Conclusões completas"
            value={`${data.last30Days.fullCompletionPercentage}%`}
          />
        </div>
      </section>
      <TrendCard items={data.weeklyTrend} />
      <RecentWorkouts data={data} timezone={timezone} />
    </>
  );
}

function NextActionCard({ data }: Readonly<{ data: Dashboard }>) {
  const navigate = useNavigate();
  const action = data.nextAction;
  const label = actionLabel(action.type);
  const description =
    action.type === 'select-plan'
      ? 'Escolha um plano para preparar seu próximo treino.'
      : `${action.planName} · ${action.workoutName}`;
  const destination = actionDestination(action.type);

  return (
    <Card>
      <Card.Header>
        <Card.Title>Próximo treino</Card.Title>
      </Card.Header>
      <Card.Content className={styles.actionRow()}>
        <div className={styles.actionCopy()}>
          <Typography color="muted">{description}</Typography>
        </div>
        <Button
          onPress={() => {
            trackUiEvent({
              control: 'dashboard_action',
              destination,
              eventName: 'ui_navigation_selected',
              navigationKind: 'dashboard_action',
              surface: 'dashboard',
            });
            void (action.type === 'select-plan'
              ? navigate({ to: '/training-plan' })
              : navigate({
                  params: { workoutId: action.workoutId },
                  to: '/training/workout/$workoutId',
                }));
          }}
          variant="primary"
        >
          {label}
        </Button>
      </Card.Content>
    </Card>
  );
}

function actionLabel(type: Dashboard['nextAction']['type']): string {
  if (type === 'select-plan') return 'Escolher um plano';
  if (type === 'start-workout') return 'Começar treino';
  return 'Retomar treino';
}

function actionDestination(type: Dashboard['nextAction']['type']) {
  if (type === 'select-plan') return 'training_plans' as const;
  if (type === 'start-workout') return 'training_start' as const;
  return 'training_resume' as const;
}

function CurrentWeekCard({ data }: Readonly<{ data: Dashboard }>) {
  const count = data.currentWeek.completedWorkoutCount;
  return (
    <Card>
      <Card.Header>
        <Card.Title>Esta semana</Card.Title>
      </Card.Header>
      <Card.Content className={styles.page()}>
        <div className={styles.weekSummary()}>
          <Typography weight="semibold">
            {count} {count === 1 ? 'treino concluído' : 'treinos concluídos'}
          </Typography>
          {data.currentWeek.workoutCount === null ? null : (
            <Typography color="muted">
              {count} de {data.currentWeek.workoutCount} treinos
            </Typography>
          )}
        </div>
        <div aria-label="Dias da semana" className={styles.days()} role="list">
          {data.currentWeek.days.map((day, index) => (
            <div className={styles.day()} key={day.date} role="listitem">
              <span>{weekdayLabels[index]}</span>
              <span
                className={styles.dayDot()}
                data-completed={day.completed}
              />
              <span>{day.date.slice(-2)}</span>
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}

function MetricCard({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <Card variant="secondary">
      <Card.Content className={styles.metric()}>
        <Typography color="muted" type="body-sm">
          {label}
        </Typography>
        <strong className={styles.metricValue()}>{value}</strong>
      </Card.Content>
    </Card>
  );
}

function TrendCard({
  items,
}: Readonly<{ items: readonly DashboardWeeklyTrendItem[] }>) {
  const maximum = Math.max(
    1,
    ...items.map((item) => item.completedWorkoutCount),
  );
  return (
    <Card>
      <Card.Header>
        <Card.Title>Ritmo de treino</Card.Title>
      </Card.Header>
      <Card.Content>
        <div
          aria-label="Treinos concluídos nas últimas oito semanas"
          className={styles.trendList()}
          role="list"
        >
          {items.map((item) => (
            <div
              className={styles.trendRow()}
              key={item.startDate}
              role="listitem"
            >
              <span>{formatDashboardWeek(item.startDate, item.endDate)}</span>
              <Meter
                aria-label={`${item.completedWorkoutCount} treinos concluídos`}
                maxValue={maximum}
                value={item.completedWorkoutCount}
              >
                <Meter.Track>
                  <Meter.Fill />
                </Meter.Track>
              </Meter>
              <span className={styles.trendValue()}>
                {item.completedWorkoutCount}
              </span>
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}

function RecentWorkouts({
  data,
  timezone,
}: Readonly<{ data: Dashboard; timezone: string }>) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Atividades recentes</Card.Title>
      </Card.Header>
      <Card.Content>
        {data.recentWorkouts.length === 0 ? (
          <Typography color="muted">
            Suas conclusões aparecerão aqui depois do primeiro treino.
          </Typography>
        ) : (
          <div className={styles.list()}>
            {data.recentWorkouts.map((workout) => (
              <Link
                className={styles.recentLink()}
                key={workout.id}
                onClick={() =>
                  trackUiEvent({
                    control: 'recent_workout',
                    destination: 'training_completion',
                    eventName: 'ui_navigation_selected',
                    navigationKind: 'row_link',
                    surface: 'dashboard',
                  })
                }
                params={{ workoutExecutionId: workout.id }}
                to="/training/completion/$workoutExecutionId"
              >
                <div>
                  <Typography weight="semibold">
                    {workout.workoutName}
                  </Typography>
                  <Typography color="muted" type="body-sm">
                    {workout.planName}
                  </Typography>
                </div>
                <div className={styles.recentMeta()}>
                  <span>
                    {formatDashboardDateTime(workout.completedAt, timezone)}
                  </span>
                  <span>
                    {formatDashboardDuration(workout.durationSeconds)}
                  </span>
                  <span>{workout.fullCompletion ? 'Completo' : 'Parcial'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

function AdminDashboardState({
  query,
}: Readonly<{ query: AdminDashboardQuery }>) {
  let content;
  if (query.isPending) {
    content = <DashboardLoading label="Carregando visão administrativa" />;
  } else if (query.isError || query.data === undefined) {
    content = (
      <DashboardError
        message="Não foi possível carregar a visão administrativa."
        onRetry={() => query.refetch()}
        resource="admin_dashboard"
      />
    );
  } else {
    content = <AdminDashboardContent data={query.data} />;
  }
  return (
    <section
      aria-labelledby="admin-dashboard-heading"
      className={styles.adminSection()}
    >
      <h2 className={styles.headingMedium()} id="admin-dashboard-heading">
        Visão administrativa
      </h2>
      {content}
    </section>
  );
}

function AdminDashboardContent({ data }: Readonly<{ data: AdminDashboard }>) {
  return (
    <>
      <div className={styles.kpiGridFour()}>
        <MetricCard label="Pessoas" value={String(data.people.totalCount)} />
        <MetricCard
          label="Novas nos últimos 30 dias"
          value={String(data.people.newLast30DaysCount)}
        />
        <MetricCard
          label="Com plano ativo"
          value={String(data.people.activePlanCount)}
        />
        <MetricCard
          label="Treinaram nos últimos 30 dias"
          value={String(data.people.trainedLast30DaysCount)}
        />
      </div>
      <div className={styles.kpiGrid()}>
        <MetricCard
          label="Treinos concluídos"
          value={String(data.training.completedWorkoutCount)}
        />
        <MetricCard
          label="Tempo total"
          value={formatDashboardDuration(data.training.totalDurationSeconds)}
        />
        <MetricCard
          label="Conclusões completas"
          value={`${data.training.fullCompletionPercentage}%`}
        />
      </div>
      <AdminTrendCard data={data} />
      <div className={styles.kpiGridFour()}>
        <MetricCard
          label="Modelos globais"
          value={String(data.plans.globalTemplateCount)}
        />
        <MetricCard
          label="Planos próprios"
          value={String(data.plans.ownedCount)}
        />
        <MetricCard
          label="Referências globais"
          value={String(data.plans.globalReferenceCount)}
        />
        <MetricCard
          label="Seleções ativas"
          value={String(data.plans.activeSelectionCount)}
        />
      </div>
      <TopPlansTable data={data} />
    </>
  );
}

function AdminTrendCard({ data }: Readonly<{ data: AdminDashboard }>) {
  const maximum = Math.max(
    1,
    ...data.weeklyTrend.map((item) => item.completedWorkoutCount),
  );
  return (
    <Card>
      <Card.Header>
        <Card.Title>Atividade nas últimas oito semanas</Card.Title>
      </Card.Header>
      <Card.Content>
        <div className={styles.trendList()} role="list">
          {data.weeklyTrend.map((item) => (
            <div
              className={styles.trendRow()}
              key={item.startDate}
              role="listitem"
            >
              <span>{formatDashboardWeek(item.startDate, item.endDate)}</span>
              <Meter
                aria-label={`${item.completedWorkoutCount} treinos e ${item.activePeopleCount} pessoas ativas`}
                maxValue={maximum}
                value={item.completedWorkoutCount}
              >
                <Meter.Track>
                  <Meter.Fill />
                </Meter.Track>
              </Meter>
              <span className={styles.trendValue()}>
                {item.completedWorkoutCount} · {item.activePeopleCount} pessoas
              </span>
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}

function TopPlansTable({ data }: Readonly<{ data: AdminDashboard }>) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Modelos mais utilizados</Card.Title>
      </Card.Header>
      <Card.Content>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Modelos mais utilizados">
              <Table.Header>
                <Table.Column id="name" isRowHeader>
                  Modelo
                </Table.Column>
                <Table.Column id="linked">Pessoas vinculadas</Table.Column>
                <Table.Column id="active">Modelo ativo</Table.Column>
              </Table.Header>
              <Table.Body renderEmptyState={() => 'Nenhum modelo em uso.'}>
                {data.topGlobalPlans.map((plan) => (
                  <Table.Row id={plan.id} key={plan.id}>
                    <Table.Cell className={styles.tableName()}>
                      {plan.name}
                    </Table.Cell>
                    <Table.Cell>{plan.linkedPeopleCount}</Table.Cell>
                    <Table.Cell>{plan.activePeopleCount}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Card.Content>
    </Card>
  );
}

function DashboardLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-label={label} className={styles.skeletonGrid()} role="status">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton className={styles.skeleton()} key={index} />
      ))}
    </div>
  );
}

function DashboardError({
  message,
  onRetry,
  resource,
}: Readonly<{
  message: string;
  onRetry: () => Promise<unknown>;
  resource: 'admin_dashboard' | 'dashboard';
}>) {
  const alertRef = useRef<HTMLDivElement>(null);
  return (
    <div className={styles.error()} ref={alertRef} tabIndex={-1}>
      <Alert status="danger">
        <Alert.Title>{message}</Alert.Title>
        <Alert.Description>Tente novamente em instantes.</Alert.Description>
        <Button
          onPress={() => {
            trackUiEvent({
              control: 'retry',
              eventName: 'ui_retry_requested',
              resource,
              surface: 'dashboard',
            });
            void onRetry().then(() => alertRef.current?.focus());
          }}
          variant="secondary"
        >
          Tentar novamente
        </Button>
      </Alert>
    </div>
  );
}
