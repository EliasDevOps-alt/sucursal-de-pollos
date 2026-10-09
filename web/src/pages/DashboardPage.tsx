import { Alert, Anchor, Badge, Card, Grid, Group, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { IconAlertTriangle, IconPackageOff } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Dashboard, LotListItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { useSalesFilters } from '../components/ReportFilters';
import { ChartCard } from '../components/viz/ChartCard';
import { axisFormatterBob, BAR_MAX, chartChrome, compactBob, horizontalBars, surfaceGap } from '../components/viz/chartDefaults';
import { useDateRange } from '../components/viz/RangePicker';
import { StatTile } from '../components/viz/StatTile';
import { expiryColor, expiryLabel, fmtBob, fmtDate, fmtKg, fmtKgShort, fmtPct } from '../lib/format';

const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function DashboardPage() {
  const { can } = useAuth();
  return can('reports.view') ? <ManagementDashboard /> : <OperationalHome />;
}

function ManagementDashboard() {
  const { user, can } = useAuth();
  const financial = can('reports.financial');
  const { range, picker } = useDateRange('30');
  const { filters, controls } = useSalesFilters(['branchId', 'categoryId']);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', range, filters],
    queryFn: async () => (await api.get<Dashboard>('/reports/dashboard', { params: { ...range, ...filters } })).data,
    refetchInterval: 60_000, // la operación del día (rutas, caja) cambia durante la jornada
  });
  const filtered = Object.keys(filters).length > 0;

  const k = data?.kpis;
  const series = (data?.salesByDay ?? []).map((d) => ({
    day: dayLabel(d.day),
    Ventas: Number(d.revenue),
    Costo: Number(d.cost ?? 0),
    Margen: Number(d.margin ?? 0),
    ventas: d.count,
  }));
  const noSales = (data?.salesByDay ?? []).every((d) => d.count === 0);
  const top = (data?.topProducts ?? []).map((p) => ({ producto: p.label, Ventas: Number(p.revenue), raw: p }));
  const alerts = data?.alerts;
  const MAX_ALERTS = 7;
  const shownLots = (alerts?.expiringLots ?? []).slice(0, Math.max(0, MAX_ALERTS - (alerts?.lowStock.length ?? 0)));
  const hiddenLots = (alerts?.expiringLots.length ?? 0) - shownLots.length;

  return (
    <>
      <PageHeader
        title={`Hola, ${user?.fullName.split(' ')[0]}`}
        subtitle={data ? `Del ${fmtDate(data.range.from)} al ${fmtDate(data.range.to)}, comparado con el período anterior` : 'Resumen de la operación'}
        actions={picker}
      />
      <QueryState isLoading={isLoading} error={error}>
        {data && k && (
          <Stack>
            <TodayStrip today={data.today} />
            <Group justify="space-between" align="flex-end" wrap="wrap" gap="xs">
              <Text fw={600}>Ventas del período{filtered ? ' (filtradas)' : ''}</Text>
              {controls}
            </Group>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
              <StatTile label="Ventas" value={fmtBob(k.revenue)} delta={k.revenueDeltaPercentage} hint={`${k.salesCount} ventas · ${fmtKgShort(k.kgSold)}`} />
              {financial ? (
                <StatTile label="Margen bruto" value={fmtBob(k.margin)} delta={k.marginDeltaPercentage} hint={`${fmtPct(k.marginPercentage)} sobre ventas`} />
              ) : (
                <StatTile label="Ticket promedio" value={fmtBob(k.averageTicket)} />
              )}
              <StatTile label="Por cobrar" value={fmtBob(k.receivables)} hint={k.debtors === 1 ? '1 cliente con deuda' : `${k.debtors} clientes con deuda`} />
              <StatTile label="Stock disponible" value={fmtKgShort(k.stockKg)} hint={financial ? `${fmtBob(k.stockValue)} a costo real` : undefined} />
            </SimpleGrid>

            <ChartCard
              title="Ventas por día"
              subtitle={financial ? 'Cada barra es la venta del día: costo real de los lotes + margen' : 'Total vendido por día'}
              empty={noSales}
              emptyText="No hay ventas en el período."
              rows={data.salesByDay.filter((d) => d.count > 0)}
              columns={[
                { label: 'Día', value: (d) => fmtDate(d.day) },
                { label: 'Ventas', value: (d) => d.count, align: 'right' },
                { label: 'Kg', value: (d) => fmtKg(d.kg), align: 'right' },
                { label: 'Total', value: (d) => fmtBob(d.revenue), align: 'right' },
                ...(financial
                  ? [
                      { label: 'Costo', value: (d: (typeof data.salesByDay)[number]) => fmtBob(d.cost), align: 'right' as const },
                      { label: 'Margen', value: (d: (typeof data.salesByDay)[number]) => fmtBob(d.margin), align: 'right' as const },
                    ]
                  : []),
              ]}
              chart={
                <BarChart
                  h={280}
                  data={series}
                  dataKey="day"
                  type={financial ? 'stacked' : 'default'}
                  series={
                    financial
                      ? [
                          { name: 'Costo', color: 'var(--viz-series-1)' },
                          { name: 'Margen', color: 'var(--viz-series-2)' },
                        ]
                      : [{ name: 'Ventas', color: 'var(--viz-series-1)' }]
                  }
                  withLegend={financial}
                  legendProps={{ verticalAlign: 'top', height: 36 }}
                  maxBarWidth={BAR_MAX}
                  // Extremo redondeado solo en el segmento superior; base cuadrada.
                  barProps={(s) => ({ ...surfaceGap, radius: s.name === 'Costo' ? 0 : [4, 4, 0, 0] })}
                  valueFormatter={(v) => fmtBob(v)}
                  yAxisProps={{ tickFormatter: axisFormatterBob, width: 56 }}
                  xAxisProps={{ interval: 'preserveStartEnd', minTickGap: 16 }}
                  {...chartChrome}
                />
              }
            />

            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <ChartCard
                  title="Productos más vendidos"
                  subtitle="Por monto vendido en el período"
                  empty={top.length === 0}
                  rows={data.topProducts}
                  columns={[
                    { label: 'Producto', value: (p) => p.label },
                    { label: 'Kg', value: (p) => fmtKg(p.kg), align: 'right' },
                    { label: 'Ventas', value: (p) => fmtBob(p.revenue), align: 'right' },
                    ...(financial ? [{ label: 'Margen', value: (p: Dashboard['topProducts'][number]) => `${fmtBob(p.margin)} (${fmtPct(p.marginPercentage)})`, align: 'right' as const }] : []),
                  ]}
                  chart={
                    <BarChart
                      h={Math.max(160, top.length * 44)}
                      data={top}
                      dataKey="producto"
                      orientation="vertical"
                      series={[{ name: 'Ventas', color: 'var(--viz-series-1)' }]}
                      maxBarWidth={BAR_MAX}
                      barProps={{ radius: [0, 4, 4, 0] }}
                      withBarValueLabel
                      valueLabelProps={{ formatter: (v: unknown) => compactBob(Number(v)), width: 90 }}
                      valueFormatter={(v) => fmtBob(v)}
                      yAxisProps={{ width: 140 }}
                      xAxisProps={{ tickFormatter: axisFormatterBob }}
                      {...chartChrome}
                      {...horizontalBars}
                    />
                  }
                />
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 6 }}>
                <Card withBorder h="100%">
                  <Text fw={600} mb="sm">Alertas</Text>
                  <Stack gap="sm">
                    {alerts && alerts.expiringLots.length === 0 && alerts.lowStock.length === 0 && (
                      <Text size="sm" c="dimmed">Sin alertas: no hay lotes por vencer ni productos bajo el mínimo.</Text>
                    )}
                    {shownLots.map((l) => (
                      <Group key={l.id} justify="space-between" gap="xs">
                        <div>
                          <Anchor component={Link} to={`/lotes/${l.id}`} fw={600} size="sm">{l.lotCode}</Anchor>
                          <Text size="xs" c="dimmed">{l.product} · {fmtKgShort(l.weightKg)} · {l.warehouse}</Text>
                        </div>
                        <Badge
                          variant="light"
                          color={expiryColor(l.daysToExpiry)}
                          leftSection={<IconAlertTriangle size={12} />}
                        >
                          {l.daysToExpiry < 0 ? `Vencido ${-l.daysToExpiry} d` : l.daysToExpiry === 0 ? 'Vence hoy' : `Vence en ${l.daysToExpiry} d`}
                        </Badge>
                      </Group>
                    ))}
                    {alerts?.lowStock.map((p) => (
                      <Group key={p.id} justify="space-between" gap="xs">
                        <div>
                          <Text fw={600} size="sm">{p.name}</Text>
                          <Text size="xs" c="dimmed">{fmtKgShort(p.stockKg)} disponibles · mínimo {fmtKgShort(p.minStockKg)}</Text>
                        </div>
                        <Badge variant="light" color="orange" leftSection={<IconPackageOff size={12} />}>Stock bajo</Badge>
                      </Group>
                    ))}
                    {hiddenLots > 0 && (
                      <Anchor component={Link} to="/inventario" size="sm">
                        y {hiddenLots} lote{hiddenLots === 1 ? '' : 's'} más por vencer · ver inventario
                      </Anchor>
                    )}
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>

            {data.topDebtors.length > 0 && (
              <Card withBorder p={0}>
                <Group justify="space-between" p="md" pb={0}>
                  <Text fw={600}>Clientes con mayor deuda</Text>
                  {can('reports.financial') && <Anchor component={Link} to="/reportes?tab=receivables" size="sm">Ver cuentas por cobrar</Anchor>}
                </Group>
                <Table.ScrollContainer minWidth={520}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Cliente</Table.Th>
                        <Table.Th ta="right">Deuda</Table.Th>
                        <Table.Th ta="right">Uso del límite</Table.Th>
                        <Table.Th ta="right">Antigüedad</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.topDebtors.map((d) => (
                        <Table.Tr key={d.id}>
                          <Table.Td><Anchor component={Link} to={`/clientes/${d.id}`} size="sm" fw={500}>{d.name}</Anchor></Table.Td>
                          <Table.Td ta="right" fw={600}>{fmtBob(d.debt)}</Table.Td>
                          <Table.Td ta="right">{fmtPct(d.usagePercentage)}</Table.Td>
                          <Table.Td ta="right">{d.daysOutstanding === null ? '—' : `${d.daysOutstanding} d`}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Card>
            )}
          </Stack>
        )}
      </QueryState>
    </>
  );
}

/** La operación de hoy: rutas, dinero y canastillos (cada bloque según los permisos del usuario). */
function TodayStrip({ today }: { today: Dashboard['today'] }) {
  const { routes, money, crates } = today;
  if (!routes && !money && !crates) return null;
  const tiles: React.ReactNode[] = [];
  if (routes) {
    tiles.push(
      <Anchor key="r" component={Link} to="/logistica" underline="never" c="inherit">
        <StatTile
          label="Reparto de hoy"
          value={routes.stops ? `${routes.delivered} de ${routes.stops}` : 'Sin rutas'}
          hint={routes.stops ? `entregadas · ${routes.pending} pendientes${routes.failed ? ` · ${routes.failed} fallidas` : ''}` : 'no hay rutas para hoy'}
        />
      </Anchor>,
    );
  }
  if (money) {
    const pending = Number(money.pendingSettlement.cash) + Number(money.pendingSettlement.digital);
    tiles.push(
      <Anchor key="c" component={Link} to="/finanzas" underline="never" c="inherit">
        <StatTile label="Efectivo en cajas" value={fmtBob(money.cashOnHand)} hint={`banco ${fmtBob(money.inBank)}`} />
      </Anchor>,
      <Anchor key="p" component={Link} to="/finanzas?tab=rendiciones" underline="never" c="inherit">
        <StatTile label="Por rendir" value={fmtBob(pending)} hint={money.pendingSettlement.people ? `${money.pendingSettlement.people} persona(s) sin rendir` : 'todo rendido'} />
      </Anchor>,
    );
  }
  if (crates) {
    tiles.push(
      <Anchor key="k" component={Link} to="/canastillos" underline="never" c="inherit">
        <StatTile label="Canastillos con clientes" value={String(crates.withCustomers)} hint={`${crates.customersHolding} clientes${crates.withPeople ? ` · ${crates.withPeople} con el personal` : ''}`} />
      </Anchor>,
    );
  }
  return (
    <div>
      <Text fw={600} mb="xs">Hoy, {fmtDate(today.date)}</Text>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>{tiles}</SimpleGrid>
    </div>
  );
}

/** Inicio para roles sin reportes (vendedores): stock y lotes por vencer. */
function OperationalHome() {
  const { user, can } = useAuth();
  const lots = useQuery({
    queryKey: ['lots', { onlyAvailable: true }],
    queryFn: async () => (await api.get<LotListItem[]>('/lots', { params: { onlyAvailable: true } })).data,
    enabled: can('lots.view'),
  });
  const available = lots.data ?? [];
  const stockKg = available.reduce((s, l) => s + Number(l.availableWeightKg), 0);
  const expiring = available.filter((l) => l.daysToExpiry <= 3);

  return (
    <>
      <PageHeader title={`Hola, ${user?.fullName.split(' ')[0]}`} subtitle="Resumen de la operación" />
      {!can('lots.view') ? (
        <Alert variant="light">Use el menú para acceder a sus operaciones.</Alert>
      ) : (
        <QueryState isLoading={lots.isLoading} error={lots.error}>
          <SimpleGrid cols={{ base: 1, xs: 2 }} mb="lg">
            <StatTile label="Stock disponible" value={fmtKg(stockKg)} hint={`${available.length} lotes con saldo`} />
            <StatTile label="Lotes por vencer" value={String(expiring.length)} hint="en los próximos 3 días" />
          </SimpleGrid>
          <Card withBorder>
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Lotes próximos a vencer</Text>
              <Anchor component={Link} to="/inventario" size="sm">Ver inventario</Anchor>
            </Group>
            {expiring.length === 0 ? (
              <Text c="dimmed" size="sm">No hay lotes por vencer en los próximos 3 días.</Text>
            ) : (
              <Stack gap="xs">
                {expiring.map((l) => (
                  <Group key={l.id} justify="space-between">
                    <Text size="sm"><b>{l.lotCode}</b> · {l.product.name} · {fmtKg(l.availableWeightKg)}</Text>
                    <Badge variant="light" color={expiryColor(l.daysToExpiry)} leftSection={<IconAlertTriangle size={12} />}>
                      {expiryLabel(l.daysToExpiry)}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </QueryState>
      )}
    </>
  );
}
