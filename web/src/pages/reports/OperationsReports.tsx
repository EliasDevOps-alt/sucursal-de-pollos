import { Anchor, Badge, Card, Grid, Group, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { BranchesReport, CratesReport, CustomersReport, LogisticsReport, PurchasesReport } from '../../api/types';
import { QueryState } from '../../components/QueryState';
import { FilterSelect, useReportOptions } from '../../components/ReportFilters';
import { ChartCard } from '../../components/viz/ChartCard';
import { axisFormatterBob, BAR_MAX, chartChrome, compactBob, horizontalBars, surfaceGap } from '../../components/viz/chartDefaults';
import { StatTile } from '../../components/viz/StatTile';
import { CRATE_MOVEMENT_LABELS, DELIVERY_PROBLEMS, fmtBob, fmtDate, fmtDateTime, fmtKg, fmtKgShort, fmtPct } from '../../lib/format';

type Range = { from: string; to: string };
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const num = { fontVariantNumeric: 'tabular-nums' } as const;

/** Barras horizontales de una sola serie (ranking): etiqueta del extremo y eje compacto. */
function RankBars({ rows, serie, color = 'var(--viz-series-1)', money = true, labelWidth = 150 }: {
  rows: { name: string; value: number }[]; serie: string; color?: string; money?: boolean; labelWidth?: number;
}) {
  return (
    <BarChart
      h={Math.max(140, rows.length * 42)}
      data={rows.map((r) => ({ name: r.name, [serie]: r.value }))}
      dataKey="name"
      orientation="vertical"
      series={[{ name: serie, color }]}
      maxBarWidth={BAR_MAX}
      barProps={{ radius: [0, 4, 4, 0] }}
      withBarValueLabel
      valueLabelProps={{ formatter: (v: unknown) => (money ? compactBob(Number(v)) : String(v)), width: 90 }}
      valueFormatter={(v) => (money ? fmtBob(v) : String(v))}
      yAxisProps={{ width: labelWidth }}
      xAxisProps={{ tickFormatter: money ? axisFormatterBob : undefined, allowDecimals: false }}
      {...chartChrome}
      {...horizontalBars}
    />
  );
}

function TableCard({ title, minWidth, head, children, action }: { title: string; minWidth: number; head: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card withBorder p={0}>
      <Group justify="space-between" p="md" pb={0}>
        <Text fw={600}>{title}</Text>
        {action}
      </Group>
      <Table.ScrollContainer minWidth={minWidth}>
        <Table striped highlightOnHover style={num}>
          <Table.Thead>{head}</Table.Thead>
          <Table.Tbody>{children}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

const rate = (v: string | null) => (v === null ? '—' : fmtPct(v));

// ── Logística ───────────────────────────────────────────────

export function LogisticsTab({ range }: { range: Range }) {
  const { data: o } = useReportOptions();
  const [driverId, setDriver] = useState<string | null>(null);
  const [vehicleId, setVehicle] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-logistics', range, driverId, vehicleId],
    queryFn: async () => (await api.get<LogisticsReport>('/reports/logistics', { params: { ...range, driverId: driverId ?? undefined, vehicleId: vehicleId ?? undefined } })).data,
  });
  const t = data?.totals;
  const days = (data?.byDay ?? []).map((d) => ({ day: dayLabel(d.day), Entregadas: d.delivered + d.partial, 'No entregadas': d.failed }));
  const problems = (data?.problems ?? []).map((p) => ({ name: DELIVERY_PROBLEMS[p.problemType] ?? p.problemType, value: p.count }));
  return (
    <Stack>
      <Group gap="xs" wrap="wrap">
        <FilterSelect label="Chofer" value={driverId} onChange={setDriver} data={(o?.drivers ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <FilterSelect label="Vehículo" value={vehicleId} onChange={setVehicle} data={(o?.vehicles ?? []).map((v) => ({ value: v.id, label: `${v.plate} · ${v.description}` }))} />
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        {data && t && (
          <>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
              <StatTile label="Cumplimiento" value={rate(t.deliveryRate)} hint={`${t.delivered + t.partial} de ${t.delivered + t.partial + t.failed} paradas resueltas`} />
              <StatTile label="Rutas" value={String(t.routes)} hint={`${t.stops} paradas · ${t.pending} pendientes`} />
              <StatTile label="Kilos entregados" value={fmtKgShort(t.deliveredKg)} hint={`de ${fmtKgShort(t.orderedKg)} pedidos`} />
              <StatTile label="Vendido en ruta" value={fmtBob(t.soldAmount)} hint={`a crédito ${fmtBob(t.credit)}`} />
            </SimpleGrid>
            <Grid>
              <Grid.Col span={{ base: 12, md: 7 }}>
                <ChartCard
                  title="Entregas por día"
                  subtitle="Paradas entregadas (completas o con diferencia) y no entregadas, por fecha de la ruta"
                  empty={days.length === 0}
                  emptyText="No hay rutas en el período."
                  rows={data.byDay}
                  columns={[
                    { label: 'Día', value: (d) => fmtDate(d.day) },
                    { label: 'Rutas', value: (d) => d.routes, align: 'right' },
                    { label: 'Entregadas', value: (d) => d.delivered + d.partial, align: 'right' },
                    { label: 'No entregadas', value: (d) => d.failed, align: 'right' },
                    { label: 'Kg', value: (d) => fmtKg(d.deliveredKg), align: 'right' },
                  ]}
                  chart={
                    <BarChart
                      h={260}
                      data={days}
                      dataKey="day"
                      type="stacked"
                      series={[
                        { name: 'Entregadas', color: 'var(--viz-series-1)' },
                        { name: 'No entregadas', color: 'var(--viz-series-2)' },
                      ]}
                      withLegend
                      legendProps={{ verticalAlign: 'top', height: 36 }}
                      maxBarWidth={BAR_MAX}
                      barProps={(s) => ({ ...surfaceGap, radius: s.name === 'Entregadas' ? 0 : [4, 4, 0, 0] })}
                      yAxisProps={{ allowDecimals: false, width: 32 }}
                      xAxisProps={{ interval: 'preserveStartEnd', minTickGap: 16 }}
                      {...chartChrome}
                    />
                  }
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }}>
                <ChartCard
                  title="Motivos de no entrega"
                  subtitle={`${t.failed} paradas no entregadas`}
                  empty={problems.length === 0}
                  emptyText="Todas las paradas resueltas se entregaron."
                  rows={problems}
                  columns={[{ label: 'Motivo', value: (p) => p.name }, { label: 'Paradas', value: (p) => p.value, align: 'right' }]}
                  chart={<RankBars rows={problems} serie="Paradas" color="var(--viz-series-2)" money={false} labelWidth={170} />}
                />
              </Grid.Col>
            </Grid>
            <TableCard
              title="Por chofer"
              minWidth={860}
              head={
                <Table.Tr>
                  <Table.Th>Chofer</Table.Th>
                  <Table.Th ta="right">Rutas</Table.Th>
                  <Table.Th ta="right">Paradas</Table.Th>
                  <Table.Th ta="right">Cumplimiento</Table.Th>
                  <Table.Th ta="right">No entregadas</Table.Th>
                  <Table.Th ta="right">Kg entregados</Table.Th>
                  <Table.Th ta="right">Vendido</Table.Th>
                  <Table.Th ta="right">Cobrado</Table.Th>
                </Table.Tr>
              }
            >
              {data.byDriver.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td fw={500}>{d.name}</Table.Td>
                  <Table.Td ta="right">{d.routes}</Table.Td>
                  <Table.Td ta="right">{d.stops}</Table.Td>
                  <Table.Td ta="right">{rate(d.deliveryRate)}</Table.Td>
                  <Table.Td ta="right">{d.failed}</Table.Td>
                  <Table.Td ta="right">{fmtKg(d.deliveredKg)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(d.soldAmount)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(d.collected)}</Table.Td>
                </Table.Tr>
              ))}
            </TableCard>
            <TableCard
              title="Por vehículo"
              minWidth={640}
              head={
                <Table.Tr>
                  <Table.Th>Vehículo</Table.Th>
                  <Table.Th ta="right">Rutas</Table.Th>
                  <Table.Th ta="right">Paradas</Table.Th>
                  <Table.Th ta="right">Kg entregados</Table.Th>
                  <Table.Th ta="right">Kg por ruta</Table.Th>
                </Table.Tr>
              }
            >
              {data.byVehicle.map((v) => (
                <Table.Tr key={v.id}>
                  <Table.Td fw={500}>{v.plate}</Table.Td>
                  <Table.Td ta="right">{v.routes}</Table.Td>
                  <Table.Td ta="right">{v.stops}</Table.Td>
                  <Table.Td ta="right">{fmtKg(v.deliveredKg)}</Table.Td>
                  <Table.Td ta="right">{v.routes ? fmtKg((Number(v.deliveredKg) / v.routes).toFixed(1)) : '—'}</Table.Td>
                </Table.Tr>
              ))}
            </TableCard>
            <Text size="xs" c="dimmed">Canastillos en el período: {t.cratesDelivered} dejados con clientes y {t.cratesPickedUp} recogidos en las entregas.</Text>
          </>
        )}
      </QueryState>
    </Stack>
  );
}

// ── Sucursales ──────────────────────────────────────────────

export function BranchesTab({ range }: { range: Range }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-branches', range],
    queryFn: async () => (await api.get<BranchesReport>('/reports/branches', { params: range })).data,
  });
  const bars = (data?.rows ?? []).map((r) => ({ name: r.name, value: Number(r.revenue) }));
  return (
    <QueryState isLoading={isLoading} error={error}>
      {data && (
        <Stack>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
            <StatTile label="Ventas" value={fmtBob(data.totals.revenue)} hint={fmtKgShort(data.totals.kgSold)} />
            <StatTile label="Margen bruto" value={fmtBob(data.totals.margin)} hint={`${fmtPct(Number(data.totals.revenue) ? ((Number(data.totals.margin) / Number(data.totals.revenue)) * 100).toFixed(2) : 0)} sobre ventas`} />
            <StatTile label="Stock en almacenes" value={fmtKgShort(data.totals.stockKg)} />
            <StatTile label="Puntos de venta" value={String(data.rows.filter((r) => r.salesCount > 0).length)} hint="con ventas en el período" />
          </SimpleGrid>
          <ChartCard
            title="Ventas por sucursal"
            subtitle="El reparto en ruta son las entregas de las preventas (salen de los vehículos)"
            empty={bars.every((b) => b.value === 0)}
            rows={data.rows}
            columns={[
              { label: 'Sucursal', value: (r) => r.name },
              { label: 'Ventas', value: (r) => fmtBob(r.revenue), align: 'right' },
              { label: 'Margen', value: (r) => fmtBob(r.margin), align: 'right' },
            ]}
            chart={<RankBars rows={bars} serie="Ventas" labelWidth={190} />}
          />
          <TableCard
            title="Comparativo"
            minWidth={1080}
            head={
              <Table.Tr>
                <Table.Th>Sucursal</Table.Th>
                <Table.Th ta="right">Ventas</Table.Th>
                <Table.Th ta="right">Monto</Table.Th>
                <Table.Th ta="right">Margen</Table.Th>
                <Table.Th ta="right">Margen %</Table.Th>
                <Table.Th ta="right">Kg vendidos</Table.Th>
                <Table.Th ta="right">A crédito</Table.Th>
                <Table.Th ta="right">Recibido por transferencia</Table.Th>
                <Table.Th ta="right">Pérdidas</Table.Th>
                <Table.Th ta="right">Stock hoy</Table.Th>
              </Table.Tr>
            }
          >
            {data.rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td fw={500}>{r.name}</Table.Td>
                <Table.Td ta="right">{r.salesCount}</Table.Td>
                <Table.Td ta="right">{fmtBob(r.revenue)}</Table.Td>
                <Table.Td ta="right" c={Number(r.margin) < 0 ? 'red' : undefined}>{fmtBob(r.margin)}</Table.Td>
                <Table.Td ta="right">{fmtPct(r.marginPercentage)}</Table.Td>
                <Table.Td ta="right">{fmtKg(r.kgSold)}</Table.Td>
                <Table.Td ta="right">{fmtBob(r.credit)}</Table.Td>
                <Table.Td ta="right">
                  {r.transfersReceived ? `${fmtKg(r.transferredKg)} (${r.transfersReceived})` : '—'}
                  {Number(r.transitLossKg) > 0 && <Text size="xs" c="dimmed">faltó {fmtKg(r.transitLossKg)} en tránsito</Text>}
                </Table.Td>
                <Table.Td ta="right">{Number(r.lossAmount) || Number(r.transitLoss) ? fmtBob(Number(r.lossAmount) + Number(r.transitLoss)) : '—'}</Table.Td>
                <Table.Td ta="right">{r.id === 'routes' ? '—' : fmtKg(r.stockKg)}</Table.Td>
              </Table.Tr>
            ))}
          </TableCard>
          <Text size="xs" c="dimmed">Pérdidas: bajas y faltantes de conteo del almacén, más lo que faltó al recibir transferencias, a costo real. En la central, lo recibido incluye los sobrantes que vuelven del reparto.</Text>
        </Stack>
      )}
    </QueryState>
  );
}

// ── Compras ─────────────────────────────────────────────────

export function PurchasesTab({ range }: { range: Range }) {
  const { data: o } = useReportOptions();
  const [supplierId, setSupplier] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-purchases', range, supplierId],
    queryFn: async () => (await api.get<PurchasesReport>('/reports/purchases', { params: { ...range, supplierId: supplierId ?? undefined } })).data,
  });
  const days = (data?.byDay ?? []).map((d) => ({ day: dayLabel(d.day), Compras: Number(d.amount) }));
  return (
    <Stack>
      <Group gap="xs">
        <FilterSelect label="Proveedor" value={supplierId} onChange={setSupplier} data={(o?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))} />
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
              <StatTile label="Comprado" value={fmtBob(data.totals.amount)} hint={`${data.totals.purchases} compras`} />
              <StatTile label="Kilos comprados" value={fmtKgShort(data.totals.kg)} />
              <StatTile label="Costo promedio" value={`${fmtBob(data.totals.costPerKg)}/kg`} hint="precio de compra, antes de la merma" />
              <StatTile label="Por pagar a proveedores" value={fmtBob(data.totals.unpaid)} hint="compras a crédito sin pagar (todas las fechas)" />
            </SimpleGrid>
            <ChartCard
              title="Compras por día"
              subtitle="Monto comprado (sin compras anuladas)"
              empty={days.every((d) => d.Compras === 0)}
              rows={data.byDay.filter((d) => Number(d.amount) > 0)}
              columns={[
                { label: 'Día', value: (d) => fmtDate(d.day) },
                { label: 'Kg', value: (d) => fmtKg(d.kg), align: 'right' },
                { label: 'Monto', value: (d) => fmtBob(d.amount), align: 'right' },
              ]}
              chart={
                <BarChart
                  h={240}
                  data={days}
                  dataKey="day"
                  series={[{ name: 'Compras', color: 'var(--viz-series-1)' }]}
                  maxBarWidth={BAR_MAX}
                  barProps={{ radius: [4, 4, 0, 0] }}
                  valueFormatter={(v) => fmtBob(v)}
                  yAxisProps={{ tickFormatter: axisFormatterBob, width: 56 }}
                  xAxisProps={{ interval: 'preserveStartEnd', minTickGap: 16 }}
                  {...chartChrome}
                />
              }
            />
            <TableCard
              title="Por proveedor"
              minWidth={860}
              head={
                <Table.Tr>
                  <Table.Th>Proveedor</Table.Th>
                  <Table.Th ta="right">Compras</Table.Th>
                  <Table.Th ta="right">Kg</Table.Th>
                  <Table.Th ta="right">Monto</Table.Th>
                  <Table.Th ta="right">Bs/kg</Table.Th>
                  <Table.Th ta="right">Merma</Table.Th>
                  <Table.Th ta="right">Por pagar</Table.Th>
                </Table.Tr>
              }
            >
              {data.bySupplier.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td fw={500}>{s.name}</Table.Td>
                  <Table.Td ta="right">{s.purchases}</Table.Td>
                  <Table.Td ta="right">{fmtKg(s.kg)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(s.amount)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(s.costPerKg)}</Table.Td>
                  <Table.Td ta="right">{s.shrinkagePercentage === null ? '—' : fmtPct(s.shrinkagePercentage)}</Table.Td>
                  <Table.Td ta="right">{Number(s.unpaid) ? `${fmtBob(s.unpaid)} (${s.unpaidCount})` : '—'}</Table.Td>
                </Table.Tr>
              ))}
            </TableCard>
            <TableCard
              title="Por producto"
              minWidth={720}
              head={
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th ta="right">Kg</Table.Th>
                  <Table.Th ta="right">Monto</Table.Th>
                  <Table.Th ta="right">Bs/kg promedio</Table.Th>
                  <Table.Th ta="right">Mínimo – máximo</Table.Th>
                </Table.Tr>
              }
            >
              {data.byProduct.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td fw={500}>{p.name}</Table.Td>
                  <Table.Td ta="right">{fmtKg(p.kg)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(p.amount)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(p.costPerKg)}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{fmtBob(p.minCostPerKg)} – {fmtBob(p.maxCostPerKg)}</Table.Td>
                </Table.Tr>
              ))}
            </TableCard>
          </>
        )}
      </QueryState>
    </Stack>
  );
}

// ── Clientes ────────────────────────────────────────────────

export function CustomersTab({ range }: { range: Range }) {
  const { data: o } = useReportOptions();
  const [typeId, setType] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-customers', range, typeId],
    queryFn: async () => (await api.get<CustomersReport>('/reports/customers', { params: { ...range, customerTypeId: typeId ?? undefined } })).data,
  });
  const top = (data?.customers ?? []).slice(0, 10).map((c) => ({ name: c.name, value: Number(c.revenue) }));
  return (
    <Stack>
      <Group gap="xs">
        <FilterSelect label="Tipo de cliente" value={typeId} onChange={setType} data={(o?.customerTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} />
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
              <StatTile label="Clientes que compraron" value={String(data.totals.active)} hint={`${data.totals.newCustomers} nuevos en el período`} />
              <StatTile label="Venta a clientes" value={fmtBob(data.totals.revenue)} hint={`los 5 primeros: ${fmtPct(data.totals.top5Percentage)}`} />
              <StatTile label="Ventas rápidas" value={fmtBob(data.totals.walkInRevenue)} hint={`${data.totals.walkInSales} ventas sin cliente registrado`} />
              <StatTile label="Dejaron de comprar" value={String(data.totals.lapsed)} hint="sin compras en el período" />
            </SimpleGrid>
            <Grid>
              <Grid.Col span={{ base: 12, md: 7 }}>
                <ChartCard
                  title="Mejores clientes"
                  subtitle="Los 10 que más compraron en el período"
                  empty={top.length === 0}
                  rows={data.customers.slice(0, 10)}
                  columns={[{ label: 'Cliente', value: (c) => c.name }, { label: 'Compras', value: (c) => fmtBob(c.revenue), align: 'right' }]}
                  chart={<RankBars rows={top} serie="Compras" labelWidth={200} />}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }}>
                <TableCard
                  title="Por tipo de cliente"
                  minWidth={320}
                  head={
                    <Table.Tr>
                      <Table.Th>Tipo</Table.Th>
                      <Table.Th ta="right">Clientes</Table.Th>
                      <Table.Th ta="right">Compras</Table.Th>
                    </Table.Tr>
                  }
                >
                  {data.byType.map((t) => (
                    <Table.Tr key={t.id}>
                      <Table.Td>{t.name}</Table.Td>
                      <Table.Td ta="right">{t.customers}</Table.Td>
                      <Table.Td ta="right">{fmtBob(t.revenue)}</Table.Td>
                    </Table.Tr>
                  ))}
                </TableCard>
              </Grid.Col>
            </Grid>
            <TableCard
              title="Clientes del período"
              minWidth={960}
              head={
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th ta="right">Ventas</Table.Th>
                  <Table.Th ta="right">Kg</Table.Th>
                  <Table.Th ta="right">Compras</Table.Th>
                  <Table.Th ta="right">Ticket promedio</Table.Th>
                  <Table.Th>Última compra</Table.Th>
                  <Table.Th ta="right">Deuda hoy</Table.Th>
                  <Table.Th ta="right">Canastillos</Table.Th>
                </Table.Tr>
              }
            >
              {data.customers.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/clientes/${c.id}`} size="sm" fw={500}>{c.name}</Anchor>
                    <Text size="xs" c="dimmed">{c.code} · {c.type}</Text>
                  </Table.Td>
                  <Table.Td ta="right">{c.sales}</Table.Td>
                  <Table.Td ta="right">{fmtKg(c.kg)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(c.revenue)}</Table.Td>
                  <Table.Td ta="right">{fmtBob(c.averageTicket)}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{c.lastSale ? fmtDateTime(c.lastSale) : '—'}</Table.Td>
                  <Table.Td ta="right">{Number(c.debt) > 0 ? fmtBob(c.debt) : '—'}</Table.Td>
                  <Table.Td ta="right">{c.crates || '—'}</Table.Td>
                </Table.Tr>
              ))}
            </TableCard>
            {data.lapsed.length > 0 && (
              <TableCard
                title="Dejaron de comprar"
                minWidth={600}
                head={
                  <Table.Tr>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th>Teléfono</Table.Th>
                    <Table.Th>Última compra</Table.Th>
                    <Table.Th ta="right">Compró antes</Table.Th>
                  </Table.Tr>
                }
              >
                {data.lapsed.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td><Anchor component={Link} to={`/clientes/${c.id}`} size="sm" fw={500}>{c.name}</Anchor></Table.Td>
                    <Table.Td>{c.phone ?? '—'}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(c.lastSale)}</Table.Td>
                    <Table.Td ta="right">{fmtBob(c.previousRevenue)}</Table.Td>
                  </Table.Tr>
                ))}
              </TableCard>
            )}
          </>
        )}
      </QueryState>
    </Stack>
  );
}

// ── Canastillos ─────────────────────────────────────────────

export function CratesTab({ range }: { range: Range }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-crates', range],
    queryFn: async () => (await api.get<CratesReport>('/reports/crates', { params: range })).data,
  });
  const t = data?.totals;
  const where = t
    ? [
        { name: 'En almacenes', value: t.inWarehouses },
        { name: 'En vehículos', value: t.inVehicles },
        { name: 'Con clientes', value: t.withCustomers },
        { name: 'A cargo de choferes y cobradores', value: t.withPeople },
      ]
    : [];
  return (
    <QueryState isLoading={isLoading} error={error}>
      {data && t && (
        <Stack>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
            <StatTile label="Canastillos en total" value={String(t.total)} hint={`${t.inWarehouses} en almacenes hoy`} />
            <StatTile label="Con clientes" value={String(t.withCustomers)} hint={`${t.customersHolding} clientes los tienen`} />
            <StatTile label="Bajas en el período" value={String(t.writtenOff)} hint={Number(t.charged) ? `sanciones cobradas ${fmtBob(t.charged)}` : 'sin sanciones'} />
            <StatTile label="Faltantes al liquidar" value={String(t.shortages)} hint="quedaron a cargo del chofer" />
          </SimpleGrid>
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <ChartCard
                title="Dónde están hoy"
                empty={t.total === 0}
                rows={where}
                columns={[{ label: 'Lugar', value: (r) => r.name }, { label: 'Canastillos', value: (r) => r.value, align: 'right' }]}
                chart={<RankBars rows={where} serie="Canastillos" money={false} labelWidth={210} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <TableCard
                title="Movimientos del período"
                minWidth={380}
                head={
                  <Table.Tr>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th ta="right">Veces</Table.Th>
                    <Table.Th ta="right">Canastillos</Table.Th>
                  </Table.Tr>
                }
              >
                {data.movements.map((m) => (
                  <Table.Tr key={m.type}>
                    <Table.Td>{CRATE_MOVEMENT_LABELS[m.type] ?? m.type}</Table.Td>
                    <Table.Td ta="right">{m.count}</Table.Td>
                    <Table.Td ta="right">{m.quantity}</Table.Td>
                  </Table.Tr>
                ))}
              </TableCard>
            </Grid.Col>
          </Grid>
          <TableCard
            title="Clientes con canastillos"
            minWidth={560}
            action={<Anchor component={Link} to="/canastillos" size="sm">Ir a Canastillos</Anchor>}
            head={
              <Table.Tr>
                <Table.Th>Cliente</Table.Th>
                <Table.Th ta="right">Canastillos</Table.Th>
                <Table.Th>Último movimiento</Table.Th>
              </Table.Tr>
            }
          >
            {data.customers.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td><Anchor component={Link} to={`/clientes/${c.id}`} size="sm" fw={500}>{c.name}</Anchor></Table.Td>
                <Table.Td ta="right" fw={600}>{c.quantity}</Table.Td>
                <Table.Td>
                  {c.lastMovement ? fmtDateTime(c.lastMovement) : '—'}{' '}
                  {(c.daysSinceMovement ?? 0) > 14 && <Badge size="xs" color="orange" variant="light" style={{ minWidth: 'max-content' }}>hace {c.daysSinceMovement} días</Badge>}
                </Table.Td>
              </Table.Tr>
            ))}
          </TableCard>
          {data.people.length > 0 && (
            <Text size="sm">
              A cargo de personas: {data.people.map((p) => `${p.name} (${p.role}): ${p.quantity}`).join(' · ')}
            </Text>
          )}
        </Stack>
      )}
    </QueryState>
  );
}
