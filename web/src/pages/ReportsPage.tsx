import { Anchor, Badge, Card, SegmentedControl, SimpleGrid, Stack, Table, Tabs, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Profitability, ReceivablesReport, ShrinkageReport } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { useSalesFilters } from '../components/ReportFilters';
import { ChartCard } from '../components/viz/ChartCard';
import { axisFormatterBob, BAR_MAX, chartChrome, compactBob, horizontalBars } from '../components/viz/chartDefaults';
import { useDateRange } from '../components/viz/RangePicker';
import { StatTile } from '../components/viz/StatTile';
import { BranchesTab, CratesTab, CustomersTab, LogisticsTab, PurchasesTab } from './reports/OperationsReports';
import { fmtBob, fmtDate, fmtDateTime, fmtKg, fmtPct, LOSS_CAUSES, TREATMENT_LABELS } from '../lib/format';

const GROUP_LABELS = { product: 'Producto', lot: 'Lote', customer: 'Cliente', seller: 'Vendedor' } as const;
type Group = keyof typeof GROUP_LABELS;

function rowLink(group: Group, id: string | null) {
  if (!id) return null;
  return { product: null, lot: `/lotes/${id}`, customer: `/clientes/${id}`, seller: null }[group];
}

function ProfitabilityTab({ range }: { range: { from: string; to: string } }) {
  const [group, setGroup] = useState<Group>('product');
  const { filters, controls } = useSalesFilters();
  const { data, isLoading, error } = useQuery({
    queryKey: ['profitability', range, group, filters],
    queryFn: async () => (await api.get<Profitability>('/reports/profitability', { params: { ...range, ...filters, groupBy: group } })).data,
  });

  // El gráfico muestra los 10 de mayor margen; la tabla, todos.
  const chartRows = [...(data?.rows ?? [])]
    .sort((a, b) => Number(b.margin) - Number(a.margin))
    .slice(0, 10)
    .map((r) => ({ label: r.label, Margen: Number(r.margin) }));

  return (
    <Stack>
      <SegmentedControl
        w="fit-content"
        value={group}
        onChange={(v) => setGroup(v as Group)}
        data={Object.entries(GROUP_LABELS).map(([value, label]) => ({ value, label: `Por ${label.toLowerCase()}` }))}
      />
      {controls}
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
              <StatTile label="Ventas" value={fmtBob(data.totals.revenue)} hint={fmtKg(data.totals.kg)} />
              <StatTile label="Costo real de lotes" value={fmtBob(data.totals.cost)} />
              <StatTile label="Margen bruto" value={fmtBob(data.totals.margin)} />
              <StatTile label="Margen %" value={fmtPct(data.totals.marginPercentage)} />
            </SimpleGrid>

            <ChartCard
              title={`Margen por ${GROUP_LABELS[group].toLowerCase()}`}
              subtitle="Los 10 con mayor margen en el período"
              empty={chartRows.length === 0}
              rows={chartRows}
              columns={[
                { label: GROUP_LABELS[group], value: (r) => r.label },
                { label: 'Margen', value: (r) => fmtBob(r.Margen), align: 'right' },
              ]}
              chart={
                <BarChart
                  h={Math.max(160, chartRows.length * 40)}
                  data={chartRows}
                  dataKey="label"
                  orientation="vertical"
                  series={[{ name: 'Margen', color: 'var(--viz-series-2)' }]}
                  maxBarWidth={BAR_MAX}
                  barProps={{ radius: [0, 4, 4, 0] }}
                  withBarValueLabel
                  valueLabelProps={{ formatter: (v: unknown) => compactBob(Number(v)), width: 90 }}
                  valueFormatter={(v) => fmtBob(v)}
                  yAxisProps={{ width: 150 }}
                  xAxisProps={{ tickFormatter: axisFormatterBob }}
                  {...chartChrome}
                  {...horizontalBars}
                />
              }
            />

            <Card withBorder p={0}>
              <Table.ScrollContainer minWidth={760}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{GROUP_LABELS[group]}</Table.Th>
                      <Table.Th ta="right">Ventas</Table.Th>
                      <Table.Th ta="right">Kg</Table.Th>
                      <Table.Th ta="right">Ingreso</Table.Th>
                      <Table.Th ta="right">Costo real</Table.Th>
                      <Table.Th ta="right">Margen</Table.Th>
                      <Table.Th ta="right">Margen %</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {data.rows.map((r) => {
                      const link = rowLink(group, r.id);
                      return (
                        <Table.Tr key={r.id ?? 'none'}>
                          <Table.Td>
                            {link ? <Anchor component={Link} to={link} fw={500} size="sm">{r.label}</Anchor> : <Text size="sm" fw={500}>{r.label}</Text>}
                            {r.detail && <Text size="xs" c="dimmed">{r.detail}</Text>}
                          </Table.Td>
                          <Table.Td ta="right">{r.sales}</Table.Td>
                          <Table.Td ta="right">{fmtKg(r.kg)}</Table.Td>
                          <Table.Td ta="right">{fmtBob(r.revenue)}</Table.Td>
                          <Table.Td ta="right">{fmtBob(r.cost)}</Table.Td>
                          <Table.Td ta="right" fw={600} c={Number(r.margin) < 0 ? 'red' : undefined}>{fmtBob(r.margin)}</Table.Td>
                          <Table.Td ta="right">{fmtPct(r.marginPercentage)}</Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Card>
          </>
        )}
      </QueryState>
    </Stack>
  );
}

function ShrinkageTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['shrinkage', range],
    queryFn: async () => (await api.get<ShrinkageReport>('/reports/shrinkage', { params: range })).data,
  });
  const chartRows = (data?.bySupplier ?? []).map((s) => ({ proveedor: s.supplier, 'Merma %': Number(s.shrinkagePercentage) }));
  const losses = data?.inventoryLosses;
  const lossRows = (losses?.byCause ?? []).map((c) => ({ causa: LOSS_CAUSES[c.cause] ?? c.cause, Pérdida: Number(c.amount) }));
  const eventLink = (e: NonNullable<typeof losses>['events'][number]) =>
    e.kind === 'return' ? `/ventas/${e.referenceId}` : e.kind === 'transfer' ? '/inventario?tab=transferencias' : '/inventario?tab=ajustes';

  return (
    <QueryState isLoading={isLoading} error={error}>
      {data && (
        <Stack>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
            <StatTile label="Kg comprados" value={fmtKg(data.totals.purchasedKg)} />
            <StatTile label="Merma" value={fmtKg(data.totals.shrinkageKg)} hint={`${fmtPct(data.totals.shrinkagePercentage)} de lo comprado`} />
            <StatTile label="Valor de la merma" value={fmtBob(data.totals.loss)} hint="a costo de compra" />
            <StatTile label="Lotes recibidos" value={String(data.lots.length)} />
          </SimpleGrid>

          <ChartCard
            title="Merma por proveedor"
            subtitle="Porcentaje del peso comprado que no llegó (neto de tara)"
            empty={chartRows.length === 0}
            rows={data.bySupplier}
            columns={[
              { label: 'Proveedor', value: (s) => s.supplier },
              { label: 'Lotes', value: (s) => s.lots, align: 'right' },
              { label: 'Comprado', value: (s) => fmtKg(s.purchasedKg), align: 'right' },
              { label: 'Merma', value: (s) => fmtKg(s.shrinkageKg), align: 'right' },
              { label: 'Merma %', value: (s) => fmtPct(s.shrinkagePercentage), align: 'right' },
              { label: 'Valor', value: (s) => fmtBob(s.loss), align: 'right' },
            ]}
            chart={
              <BarChart
                h={Math.max(140, chartRows.length * 44)}
                data={chartRows}
                dataKey="proveedor"
                orientation="vertical"
                series={[{ name: 'Merma %', color: 'var(--viz-series-1)' }]}
                maxBarWidth={BAR_MAX}
                barProps={{ radius: [0, 4, 4, 0] }}
                withBarValueLabel
                valueFormatter={(v) => `${v.toLocaleString('es-BO', { maximumFractionDigits: 2 })} %`}
                yAxisProps={{ width: 170 }}
                {...chartChrome}
                {...horizontalBars}
              />
            }
          />

          {losses && (
            <>
              <Text fw={600} size="lg" mt="sm">Pérdidas de inventario después de la recepción</Text>
              <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
                <StatTile label="Kg perdidos" value={fmtKg(losses.totals.lossKg)} hint="bajas, faltantes y devoluciones descartadas" />
                <StatTile label="Valor perdido" value={fmtBob(losses.totals.lossAmount)} hint="a costo real del lote" />
                <StatTile label="Sobrantes de conteo" value={fmtKg(losses.totals.surplusKg)} hint={fmtBob(losses.totals.surplusAmount)} />
                <StatTile label="Registros" value={String(losses.events.length)} />
              </SimpleGrid>
              <ChartCard
                title="Pérdidas por causa"
                subtitle="Valor a costo real, en el período"
                empty={lossRows.length === 0}
                rows={losses.byCause}
                columns={[
                  { label: 'Causa', value: (c) => LOSS_CAUSES[c.cause] ?? c.cause },
                  { label: 'Registros', value: (c) => c.count, align: 'right' },
                  { label: 'Kg', value: (c) => fmtKg(c.kg), align: 'right' },
                  { label: 'Valor', value: (c) => fmtBob(c.amount), align: 'right' },
                ]}
                chart={
                  <BarChart
                    h={Math.max(140, lossRows.length * 44)}
                    data={lossRows}
                    dataKey="causa"
                    orientation="vertical"
                    series={[{ name: 'Pérdida', color: 'var(--viz-series-1)' }]}
                    maxBarWidth={BAR_MAX}
                    barProps={{ radius: [0, 4, 4, 0] }}
                    withBarValueLabel
                    valueFormatter={(v) => fmtBob(v)}
                    valueLabelProps={{ formatter: (v: unknown) => compactBob(Number(v)), width: 90 }}
                    yAxisProps={{ width: 190 }}
                    {...chartChrome}
                    {...horizontalBars}
                  />
                }
              />
              {losses.events.length > 0 && (
                <Card withBorder p={0}>
                  <Text fw={600} p="md" pb={0}>Detalle de pérdidas</Text>
                  <Table.ScrollContainer minWidth={900}>
                    <Table striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Fecha</Table.Th>
                          <Table.Th>Causa</Table.Th>
                          <Table.Th>Documento</Table.Th>
                          <Table.Th>Producto / lote</Table.Th>
                          <Table.Th>Almacén</Table.Th>
                          <Table.Th ta="right">Kg</Table.Th>
                          <Table.Th ta="right">Valor</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {losses.events.map((e) => (
                          <Table.Tr key={e.id}>
                            <Table.Td>{fmtDateTime(e.at)}</Table.Td>
                            <Table.Td>
                              <Text size="sm">{LOSS_CAUSES[e.cause] ?? e.cause}</Text>
                              {e.notes && <Text size="xs" c="dimmed" maw={280}>{e.notes}</Text>}
                            </Table.Td>
                            <Table.Td><Anchor component={Link} to={eventLink(e)} size="sm">{e.document}</Anchor></Table.Td>
                            <Table.Td>
                              <Text size="sm">{e.product}</Text>
                              <Text size="xs" c="dimmed">{e.lotCode}</Text>
                            </Table.Td>
                            <Table.Td>{e.warehouse}</Table.Td>
                            <Table.Td ta="right">{e.cause === 'COUNT_SURPLUS' ? `+${fmtKg(-Number(e.kg))}` : fmtKg(e.kg)}</Table.Td>
                            <Table.Td ta="right">{e.cause === 'COUNT_SURPLUS' ? `+${fmtBob(-Number(e.amount))}` : fmtBob(e.amount)}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </Card>
              )}
            </>
          )}

          <Card withBorder p={0}>
            <Text fw={600} p="md" pb={0}>Merma de recepción por lote</Text>
            <Table.ScrollContainer minWidth={900}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Lote</Table.Th>
                    <Table.Th>Recibido</Table.Th>
                    <Table.Th>Producto / proveedor</Table.Th>
                    <Table.Th ta="right">Comprado</Table.Th>
                    <Table.Th ta="right">Neto</Table.Th>
                    <Table.Th ta="right">Merma</Table.Th>
                    <Table.Th ta="right">Valor</Table.Th>
                    <Table.Th>Tratamiento</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {data.lots.map((l) => (
                    <Table.Tr key={l.id}>
                      <Table.Td><Anchor component={Link} to={`/lotes/${l.id}`} fw={600} size="sm">{l.lotCode}</Anchor></Table.Td>
                      <Table.Td>{fmtDateTime(l.receivedAt)}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{l.product}</Text>
                        <Text size="xs" c="dimmed">{l.supplier}</Text>
                      </Table.Td>
                      <Table.Td ta="right">{fmtKg(l.purchasedKg)}</Table.Td>
                      <Table.Td ta="right">{fmtKg(l.netKg)}</Table.Td>
                      <Table.Td ta="right">{fmtKg(l.shrinkageKg)} ({fmtPct(l.shrinkagePercentage)})</Table.Td>
                      <Table.Td ta="right">{fmtBob(l.loss)}</Table.Td>
                      <Table.Td><Badge variant="light" color={l.treatment === 'INCORPORATE' ? 'grape' : 'gray'}>{TREATMENT_LABELS[l.treatment]}</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Stack>
      )}
    </QueryState>
  );
}

function ReceivablesTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['receivables'],
    queryFn: async () => (await api.get<ReceivablesReport>('/reports/receivables')).data,
  });
  const buckets = (data?.buckets ?? []).map((b) => ({ tramo: b.label, Deuda: Number(b.amount) }));

  return (
    <QueryState isLoading={isLoading} error={error}>
      {data && (
        <Stack>
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <StatTile label="Total por cobrar" value={fmtBob(data.total)} />
            <StatTile label="Clientes con deuda" value={String(data.debtors)} />
          </SimpleGrid>

          <ChartCard
            title="Antigüedad de la deuda"
            subtitle="Días desde el primer cargo aún pendiente de cada cliente"
            empty={data.debtors === 0}
            emptyText="No hay deudas pendientes."
            rows={data.buckets}
            columns={[
              { label: 'Tramo', value: (b) => b.label },
              { label: 'Deuda', value: (b) => fmtBob(b.amount), align: 'right' },
            ]}
            chart={
              <BarChart
                h={240}
                data={buckets}
                dataKey="tramo"
                series={[{ name: 'Deuda', color: 'var(--viz-series-1)' }]}
                maxBarWidth={BAR_MAX}
                barProps={{ radius: [4, 4, 0, 0] }}
                valueFormatter={(v) => fmtBob(v)}
                yAxisProps={{ tickFormatter: axisFormatterBob, width: 56 }}
                {...chartChrome}
              />
            }
          />

          <Card withBorder p={0}>
            <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th>Teléfono</Table.Th>
                    <Table.Th ta="right">Deuda</Table.Th>
                    <Table.Th ta="right">Límite</Table.Th>
                    <Table.Th ta="right">Uso</Table.Th>
                    <Table.Th>Desde</Table.Th>
                    <Table.Th ta="right">Días</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {data.customers.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/clientes/${c.id}`} fw={500} size="sm">{c.name}</Anchor>
                        <Text size="xs" c="dimmed">{c.code}</Text>
                      </Table.Td>
                      <Table.Td>{c.phone ?? '—'}</Table.Td>
                      <Table.Td ta="right" fw={600}>{fmtBob(c.debt)}</Table.Td>
                      <Table.Td ta="right">{fmtBob(c.creditLimit)}</Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" c={Number(c.usagePercentage) > 100 ? 'red' : undefined} fw={Number(c.usagePercentage) > 100 ? 600 : undefined}>
                          {fmtPct(c.usagePercentage)}
                        </Text>
                      </Table.Td>
                      <Table.Td>{c.oldestCharge ? fmtDate(c.oldestCharge) : '—'}</Table.Td>
                      <Table.Td ta="right">{c.daysOutstanding ?? '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Stack>
      )}
    </QueryState>
  );
}

const TABS = [
  { value: 'profitability', label: 'Rentabilidad', perms: ['reports.financial'] },
  { value: 'branches', label: 'Sucursales', perms: ['reports.financial'] },
  { value: 'logistics', label: 'Logística', perms: ['reports.view', 'routes.view'] },
  { value: 'purchases', label: 'Compras', perms: ['reports.financial'] },
  { value: 'customers', label: 'Clientes', perms: ['reports.financial'] },
  { value: 'crates', label: 'Canastillos', perms: ['reports.view', 'crates.view'] },
  { value: 'shrinkage', label: 'Merma', perms: ['reports.financial'] },
  { value: 'receivables', label: 'Cuentas por cobrar', perms: ['reports.view'] },
] as const;

export function ReportsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => t.perms.every((p) => can(p)));
  const requested = params.get('tab');
  // Un valor desconocido (o sin permiso) vuelve a la primera pestaña en lugar de dejar la página en blanco.
  const tab = tabs.find((t) => t.value === requested)?.value ?? tabs[0]?.value;
  const { range, picker } = useDateRange('30');

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Ventas y rentabilidad con el costo real de cada lote, sucursales, logística, compras, clientes, canastillos, merma y cobranza"
        actions={tab !== 'receivables' && picker}
      />
      <Tabs value={tab} onChange={(v) => setParams(v ? { tab: v } : {})} keepMounted={false}>
        <Tabs.List mb="md">
          {tabs.map((t) => <Tabs.Tab key={t.value} value={t.value}>{t.label}</Tabs.Tab>)}
        </Tabs.List>
        <Tabs.Panel value="profitability"><ProfitabilityTab range={range} /></Tabs.Panel>
        <Tabs.Panel value="branches"><BranchesTab range={range} /></Tabs.Panel>
        <Tabs.Panel value="logistics"><LogisticsTab range={range} /></Tabs.Panel>
        <Tabs.Panel value="purchases"><PurchasesTab range={range} /></Tabs.Panel>
        <Tabs.Panel value="customers"><CustomersTab range={range} /></Tabs.Panel>
        <Tabs.Panel value="crates"><CratesTab range={range} /></Tabs.Panel>
        <Tabs.Panel value="shrinkage"><ShrinkageTab range={range} /></Tabs.Panel>
        <Tabs.Panel value="receivables"><ReceivablesTab /></Tabs.Panel>
      </Tabs>
    </>
  );
}
