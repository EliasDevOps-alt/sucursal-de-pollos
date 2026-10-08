import { Anchor, Badge, Button, Card, Grid, Group, Modal, Select, SimpleGrid, Stack, Table, Tabs, Text, Textarea } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { IconArrowsExchange, IconLock, IconLockOpen, IconMinus, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { CashAccountRow, CashMovementRow, CashSessionRow, CashSummary, SessionDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { ChartCard } from '../../components/viz/ChartCard';
import { axisFormatterBob, BAR_MAX, chartChrome, compactBob, horizontalBars } from '../../components/viz/chartDefaults';
import { useDateRange } from '../../components/viz/RangePicker';
import { StatTile } from '../../components/viz/StatTile';
import { CASH_CATEGORY_LABELS, EXPENSE_TYPE_LABELS, fmtBob, fmtDateTime, PAYMENT_LABELS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { CloseCashModal, INVALIDATE_CASH, ManualMovementModal, OpenCashModal, TransferModal } from './CashModals';
import { SettlementsTab } from './SettlementsTab';

const REF_LINKS: Record<string, (id: string) => string> = {
  purchase: (id) => `/compras/${id}`,
  sale_return: () => '/ventas',
  settlement: () => '/finanzas?tab=rendiciones',
};

function SummaryTab({ summary, range }: { summary: CashSummary; range: { from: string; to: string } }) {
  const { can } = useAuth();
  const [opening, setOpening] = useState<CashAccountRow | null>(null);
  const [closing, setClosing] = useState<CashAccountRow | null>(null);
  const label = (r: CashSummary['period']['rows'][number]) =>
    r.category === 'EXPENSE' ? EXPENSE_TYPE_LABELS[r.expenseType ?? 'OTROS'] ?? r.expenseType ?? 'Gastos' : CASH_CATEGORY_LABELS[r.category] ?? r.category;
  const merge = (dir: 'IN' | 'OUT') => {
    const m = new Map<string, number>();
    for (const r of summary.period.rows.filter((x) => x.direction === dir && x.category !== 'ADJUSTMENT' && x.category !== 'REVERSAL')) m.set(label(r), (m.get(label(r)) ?? 0) + Number(r.amount));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const income = merge('IN');
  const outcome = merge('OUT');
  const adjustments = summary.period.rows.filter((r) => r.category === 'ADJUSTMENT').reduce((t, r) => t + (r.direction === 'IN' ? 1 : -1) * Number(r.amount), 0);

  const chart = (rows: { name: string; value: number }[], color: string, serie: string) => (
    <BarChart
      h={Math.max(140, rows.length * 42)}
      data={rows.map((r) => ({ name: r.name, [serie]: r.value }))}
      dataKey="name"
      orientation="vertical"
      series={[{ name: serie, color }]}
      maxBarWidth={BAR_MAX}
      barProps={{ radius: [0, 4, 4, 0] }}
      withBarValueLabel
      valueFormatter={(v) => fmtBob(v)}
      valueLabelProps={{ formatter: (v: unknown) => compactBob(Number(v)), width: 90 }}
      yAxisProps={{ width: 170 }}
      xAxisProps={{ tickFormatter: axisFormatterBob }}
      {...chartChrome}
      {...horizontalBars}
    />
  );

  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <StatTile label="Efectivo en cajas" value={fmtBob(summary.cashOnHand)} />
        <StatTile label="En el banco" value={fmtBob(summary.inBank)} hint="QR y transferencias" />
        <StatTile label="Por rendir" value={fmtBob(Number(summary.pendingSettlement.cash) + Number(summary.pendingSettlement.digital))}
          hint={summary.pendingSettlement.people ? `${summary.pendingSettlement.people} persona(s) · ${fmtBob(summary.pendingSettlement.cash)} en efectivo` : 'nada pendiente'} />
        <StatTile label="Por pagar a proveedores" value={fmtBob(summary.supplierPayables.amount)} hint={`${summary.supplierPayables.count} compra(s) a crédito`} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {summary.accounts.map((a) => (
          <Card withBorder key={a.id}>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={600}>{a.name}</Text>
                <Text size="xs" c="dimmed">{a.type === 'BANK' ? 'Cuenta bancaria' : a.branch?.name ?? 'Caja'}</Text>
              </div>
              {a.type === 'CASH' && (
                <Badge variant="light" color={a.openSession ? 'green' : 'gray'} leftSection={a.openSession ? <IconLockOpen size={12} /> : <IconLock size={12} />}>
                  {a.openSession ? 'Abierta' : 'Cerrada'}
                </Badge>
              )}
            </Group>
            <Text fw={700} size="xl" mt="xs" c={Number(a.balance) < 0 ? 'red' : undefined}>{fmtBob(a.balance)}</Text>
            {a.openSession && <Text size="xs" c="dimmed">{a.openSession.sessionNumber} · abrió {a.openSession.openedBy.fullName} {fmtDateTime(a.openSession.openedAt)}</Text>}
            {a.type === 'CASH' && can('cash.manage') && (
              <Group mt="sm">
                {a.openSession ? (
                  <Button size="xs" variant="light" leftSection={<IconLock size={14} />} onClick={() => setClosing(a)}>Cerrar caja</Button>
                ) : (
                  <Button size="xs" variant="light" leftSection={<IconLockOpen size={14} />} onClick={() => setOpening(a)}>Abrir caja</Button>
                )}
              </Group>
            )}
          </Card>
        ))}
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard title="Ingresos por origen" subtitle={`${range.from} a ${range.to} · total ${fmtBob(summary.period.income)}`} empty={income.length === 0} rows={income}
            columns={[{ label: 'Origen', value: (r) => r.name }, { label: 'Monto', value: (r) => fmtBob(r.value), align: 'right' }]}
            chart={chart(income, 'var(--viz-series-1)', 'Ingreso')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard title="Egresos por destino" subtitle={`total ${fmtBob(summary.period.expense)}`} empty={outcome.length === 0} rows={outcome}
            columns={[{ label: 'Destino', value: (r) => r.name }, { label: 'Monto', value: (r) => fmtBob(r.value), align: 'right' }]}
            chart={chart(outcome, 'var(--viz-series-2)', 'Egreso')} />
        </Grid.Col>
      </Grid>
      {Math.abs(adjustments) >= 0.005 && (
        <Text size="sm" c={adjustments < 0 ? 'red' : 'orange'}>Diferencias de arqueo en el período: {fmtBob(adjustments)} (sin contar en los gráficos).</Text>
      )}

      <OpenCashModal account={opening} onClose={() => setOpening(null)} />
      <CloseCashModal account={closing} onClose={() => setClosing(null)} />
    </Stack>
  );
}

function MovementsTab({ accounts, range }: { accounts: CashAccountRow[]; range: { from: string; to: string } }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [kind, setKind] = useState<'EXPENSE' | 'OTHER_INCOME' | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [reversing, setReversing] = useState<CashMovementRow | null>(null);
  const [reason, setReason] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['cash', 'movements', accountId, category, range],
    queryFn: async () =>
      (await api.get<CashMovementRow[]>('/cash/movements', {
        params: { accountId: accountId ?? undefined, category: category ?? undefined, from: `${range.from}T00:00:00`, to: `${range.to}T23:59:59`, limit: 500 },
      })).data,
  });
  const reverse = useMutation({
    mutationFn: async () => api.post(`/cash/movements/${reversing!.id}/reverse`, { reason }),
    onSuccess: () => {
      notifyOk('Movimiento revertido');
      for (const k of INVALIDATE_CASH) qc.invalidateQueries({ queryKey: [k] });
      setReversing(null);
      setReason('');
    },
    onError: notifyError,
  });
  const sum = (d: 'IN' | 'OUT') => (data ?? []).filter((m) => m.direction === d).reduce((t, m) => t + Number(m.amount), 0);

  return (
    <>
      <Group justify="space-between" mb="sm" align="flex-end">
        <Group align="flex-end">
          <Select label="Cuenta" placeholder="Todas" clearable w={240} value={accountId} onChange={setAccountId} data={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          <Select label="Tipo" placeholder="Todos" clearable w={220} value={category} onChange={setCategory}
            data={Object.entries(CASH_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
          <Text size="sm" mb={6}>Entradas <b>{fmtBob(sum('IN'))}</b> · Salidas <b>{fmtBob(sum('OUT'))}</b></Text>
        </Group>
        {can('cash.manage') && (
          <Group gap="xs">
            <Button variant="light" color="red" leftSection={<IconMinus size={16} />} onClick={() => setKind('EXPENSE')}>Gasto</Button>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setKind('OTHER_INCOME')}>Ingreso</Button>
            <Button variant="light" leftSection={<IconArrowsExchange size={16} />} onClick={() => setTransfer(true)}>Traspaso</Button>
          </Group>
        )}
      </Group>
      <QueryState isLoading={isLoading} error={error}>
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={1100}>
            <Table striped style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Cuenta</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Detalle</Table.Th>
                  <Table.Th ta="right">Entrada</Table.Th>
                  <Table.Th ta="right">Salida</Table.Th>
                  <Table.Th ta="right">Saldo</Table.Th>
                  <Table.Th>Registró</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.map((m) => {
                  const link = m.referenceType && m.referenceId ? REF_LINKS[m.referenceType]?.(m.referenceId) : undefined;
                  return (
                    <Table.Tr key={m.id} opacity={m.reversedById ? 0.5 : 1}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(m.createdAt)}</Table.Td>
                      <Table.Td>{m.cashAccount.name}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={m.direction === 'IN' ? 'blue' : 'orange'}>{CASH_CATEGORY_LABELS[m.category] ?? m.category}</Badge>
                        {m.expenseType && <Text size="xs" c="dimmed">{EXPENSE_TYPE_LABELS[m.expenseType] ?? m.expenseType}</Text>}
                      </Table.Td>
                      <Table.Td>
                        {link ? <Anchor component={Link} to={link} size="sm">{m.description}</Anchor> : <Text size="sm">{m.description}</Text>}
                        {m.paymentMethod && <Text size="xs" c="dimmed">{PAYMENT_LABELS[m.paymentMethod] ?? m.paymentMethod}</Text>}
                        {m.reversedById && <Text size="xs" c="red">Revertido</Text>}
                      </Table.Td>
                      <Table.Td ta="right" c="blue" style={{ whiteSpace: 'nowrap' }}>{m.direction === 'IN' ? fmtBob(m.amount) : ''}</Table.Td>
                      <Table.Td ta="right" c="orange" style={{ whiteSpace: 'nowrap' }}>{m.direction === 'OUT' ? fmtBob(m.amount) : ''}</Table.Td>
                      <Table.Td ta="right" c={Number(m.balanceAfter) < 0 ? 'red' : undefined} style={{ whiteSpace: 'nowrap' }}>{fmtBob(m.balanceAfter)}</Table.Td>
                      <Table.Td>{m.createdBy.fullName}</Table.Td>
                      <Table.Td>
                        {can('cash.manage') && !m.reversedById && (m.category === 'EXPENSE' || m.category === 'OTHER_INCOME') && (
                          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setReversing(m)}>Revertir</Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </QueryState>
      <ManualMovementModal kind={kind} accounts={accounts} onClose={() => setKind(null)} />
      <TransferModal opened={transfer} accounts={accounts} onClose={() => setTransfer(false)} />
      <Modal opened={!!reversing} onClose={() => setReversing(null)} title="Revertir movimiento">
        <Stack>
          <Text size="sm">{reversing?.description} · {fmtBob(reversing?.amount)}. No se borra: se registra el movimiento contrario.</Text>
          <Textarea label="Motivo" withAsterisk autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          <Button color="red" disabled={!reason.trim()} loading={reverse.isPending} onClick={() => reverse.mutate()}>Revertir</Button>
        </Stack>
      </Modal>
    </>
  );
}

function SessionsTab() {
  const [viewing, setViewing] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['cash', 'sessions'], queryFn: async () => (await api.get<CashSessionRow[]>('/cash/sessions')).data });
  const detail = useQuery({ queryKey: ['cash', 'session', viewing], queryFn: async () => (await api.get<SessionDetail>(`/cash/sessions/${viewing}`)).data, enabled: !!viewing });
  const d = detail.data;
  return (
    <QueryState isLoading={isLoading} error={error}>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover style={{ fontVariantNumeric: 'tabular-nums' }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>N.º</Table.Th>
                <Table.Th>Caja</Table.Th>
                <Table.Th>Apertura</Table.Th>
                <Table.Th>Cierre</Table.Th>
                <Table.Th ta="right">Esperado</Table.Th>
                <Table.Th ta="right">Contado</Table.Th>
                <Table.Th ta="right">Diferencia</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.map((s) => (
                <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setViewing(s.id)}>
                  <Table.Td fw={600}>{s.sessionNumber}</Table.Td>
                  <Table.Td>{s.cashAccount.name}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(s.openedAt)}<Text size="xs" c="dimmed">{s.openedBy.fullName}</Text></Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {s.closedAt ? <>{fmtDateTime(s.closedAt)}<Text size="xs" c="dimmed">{s.closedBy?.fullName}</Text></> : <Badge color="green" variant="light">Abierta</Badge>}
                  </Table.Td>
                  <Table.Td ta="right">{s.closingExpected ? fmtBob(s.closingExpected) : '—'}</Table.Td>
                  <Table.Td ta="right">{s.closingCounted ? fmtBob(s.closingCounted) : '—'}</Table.Td>
                  <Table.Td ta="right" c={Number(s.closingDifference ?? 0) < 0 ? 'red' : Number(s.closingDifference ?? 0) > 0 ? 'orange' : undefined}>
                    {s.closingDifference == null ? '—' : Number(s.closingDifference) === 0 ? 'Cuadró' : fmtBob(s.closingDifference)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
      <Modal opened={!!viewing} onClose={() => setViewing(null)} title={d ? `${d.sessionNumber} · ${d.cashAccount.name}` : 'Caja'} size="lg">
        <QueryState isLoading={detail.isLoading} error={detail.error}>
          {d && (
            <Stack>
              <SimpleGrid cols={2}>
                <div>
                  <Text size="xs" c="dimmed">Apertura</Text>
                  <Text size="sm">{fmtDateTime(d.openedAt)} · {d.openedBy.fullName}</Text>
                  <Text size="sm">Esperado {fmtBob(d.openingExpected)} · contado {fmtBob(d.openingCounted)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Cierre</Text>
                  {d.closedAt ? (
                    <>
                      <Text size="sm">{fmtDateTime(d.closedAt)} · {d.closedBy?.fullName}</Text>
                      <Text size="sm">Esperado {fmtBob(d.closingExpected)} · contado {fmtBob(d.closingCounted)}</Text>
                    </>
                  ) : <Text size="sm">Abierta</Text>}
                </div>
              </SimpleGrid>
              <Table>
                <Table.Tbody>
                  {d.byCategory.map((c) => (
                    <Table.Tr key={`${c.direction}${c.category}`}>
                      <Table.Td>{CASH_CATEGORY_LABELS[c.category] ?? c.category} <Text span size="xs" c="dimmed">({c.count})</Text></Table.Td>
                      <Table.Td ta="right" c={c.direction === 'IN' ? 'blue' : 'orange'}>{c.direction === 'IN' ? '+' : '−'}{fmtBob(c.amount)}</Table.Td>
                    </Table.Tr>
                  ))}
                  <Table.Tr>
                    <Table.Td fw={700}>Entradas − salidas</Table.Td>
                    <Table.Td ta="right" fw={700}>{fmtBob(Number(d.totals.in) - Number(d.totals.out))}</Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
              {d.denominations && (
                <Text size="sm">Arqueo: {Object.entries(d.denominations).sort((a, b) => Number(b[0]) - Number(a[0])).map(([v, q]) => `${q} × Bs ${v.replace('.', ',')}`).join(' · ')}</Text>
              )}
              {d.notes && <Text size="sm">Observaciones: {d.notes}</Text>}
            </Stack>
          )}
        </QueryState>
      </Modal>
    </QueryState>
  );
}

export function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = ['movimientos', 'cajas', 'rendiciones'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'resumen';
  const { range, picker } = useDateRange('30');
  const { data, isLoading, error } = useQuery({
    queryKey: ['cash', 'summary', range],
    queryFn: async () => (await api.get<CashSummary>('/cash/summary', { params: { from: `${range.from}T00:00:00`, to: `${range.to}T23:59:59` } })).data,
  });
  return (
    <>
      <PageHeader title="Finanzas" subtitle="Cajas, banco, ingresos y egresos, rendiciones de choferes y cobradores" actions={tab === 'resumen' || tab === 'movimientos' ? picker : undefined} />
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <Tabs value={tab} onChange={(v) => setParams(v && v !== 'resumen' ? { tab: v } : {})} keepMounted={false}>
            <Tabs.List mb="md">
              <Tabs.Tab value="resumen">Resumen</Tabs.Tab>
              <Tabs.Tab value="movimientos">Movimientos</Tabs.Tab>
              <Tabs.Tab value="cajas">Aperturas y cierres</Tabs.Tab>
              <Tabs.Tab value="rendiciones">
                Rendiciones {data.pendingSettlement.people > 0 && <Badge size="xs" color="orange" ml={4}>{data.pendingSettlement.people}</Badge>}
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="resumen"><SummaryTab summary={data} range={range} /></Tabs.Panel>
            <Tabs.Panel value="movimientos"><MovementsTab accounts={data.accounts} range={range} /></Tabs.Panel>
            <Tabs.Panel value="cajas"><SessionsTab /></Tabs.Panel>
            <Tabs.Panel value="rendiciones"><SettlementsTab accounts={data.accounts} /></Tabs.Panel>
          </Tabs>
        )}
      </QueryState>
    </>
  );
}
