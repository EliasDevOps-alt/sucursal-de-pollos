import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Grid,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconAlertTriangle, IconDeviceMobile, IconLock, IconPlus, IconStack2, IconTrash } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../../api/client';
import type { Customer, PresaleDetail, Product, SaleDetail, SaleQuote, Warehouse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { fmtBob, fmtDate, fmtKg, fmtPct, fmtPerKg, PAYMENT_STATUS } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';
import { LotChoice, LotPicker } from './LotPicker';

interface Line {
  key: string;
  productId: string | null;
  weightKg: number | '';
  /** Venta por canastillo (solo productos con kg por canastillo); weightKg es el peso real de la balanza. */
  crates: number | '';
  unitPrice: number | '';
  priceChangeReason: string;
  lots?: LotChoice[];
}

const newLine = (): Line => ({ key: crypto.randomUUID(), productId: null, weightKg: '', crates: '', unitPrice: '', priceChangeReason: '' });

export function SaleNewPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'credit'>('full');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [received, setReceived] = useState<number | ''>('');
  const [forceReason, setForceReason] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [supervisor, setSupervisor] = useState({ username: '', password: '' });
  const [notes, setNotes] = useState('');
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // Atender una preventa: /ventas/nueva?preventa=ID precarga cliente, productos y notas.
  const [searchParams] = useSearchParams();
  const presaleId = searchParams.get('preventa');
  const presale = useQuery({
    queryKey: ['presales', presaleId],
    queryFn: async () => (await api.get<PresaleDetail>(`/presales/${presaleId}`)).data,
    enabled: !!presaleId,
  });
  useEffect(() => {
    const p = presale.data;
    if (!p) return;
    setCustomerId(p.customer.id);
    setCustomerSearch(p.customer.name);
    setLines(p.items.map((i) => ({ ...newLine(), productId: i.productId, weightKg: Number(i.weightKg), crates: i.crates || '' })));
    setNotes(p.notes ? `Preventa ${p.presaleNumber}: ${p.notes}` : `Preventa ${p.presaleNumber}`);
  }, [presale.data]);

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });
  // Un vendedor de sucursal solo ve el almacén de su sucursal.
  const allowedWarehouses = (warehouses.data ?? []).filter((w) => !user?.branchId || w.branch?.id === user.branchId);
  const effectiveWarehouse = warehouseId ?? allowedWarehouses[0]?.id ?? null;

  const products = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get<Product[]>('/products')).data });
  const kgPerCrate = (id: string | null) => {
    const v = products.data?.find((p) => p.id === id)?.kgPerCrate;
    return v ? Number(v) : null;
  };
  const [cratesToCustomer, setCratesToCustomer] = useState(true);
  const [debouncedSearch] = useDebouncedValue(customerSearch, 300);
  const customers = useQuery({
    queryKey: ['customers', { debounced: debouncedSearch, withDebt: false }],
    queryFn: async () => (await api.get<Customer[]>('/customers', { params: { search: debouncedSearch || undefined } })).data,
  });

  // Memorizado: payload y la vista previa con debounce necesitan una referencia estable.
  const validLines = useMemo(() => lines.filter((l) => l.productId && Number(l.weightKg) > 0), [lines]);
  const totalCrates = validLines.reduce((t, l) => t + (kgPerCrate(l.productId) ? Number(l.crates) || 0 : 0), 0);

  const payload = useMemo(() => {
    if (!effectiveWarehouse || validLines.length === 0) return null;
    return {
      warehouseId: effectiveWarehouse,
      customerId: customerId ?? undefined,
      items: validLines.map((l) => ({
        productId: l.productId!,
        weightKg: Number(l.weightKg),
        crates: Number(l.crates) > 0 && kgPerCrate(l.productId) ? Number(l.crates) : undefined,
        unitPrice: l.unitPrice === '' ? undefined : Number(l.unitPrice),
        priceChangeReason: l.priceChangeReason.trim() || undefined,
        lots: l.lots,
      })),
      paymentMethod,
      forceReason: forceReason.trim() || undefined,
      creditExceptionReason: creditReason.trim() || undefined,
      notes: notes.trim() || undefined,
      presaleId: presaleId ?? undefined,
      cratesToCustomer: customerId ? cratesToCustomer : undefined,
    };
  }, [effectiveWarehouse, customerId, validLines, paymentMethod, forceReason, creditReason, notes, presaleId, cratesToCustomer, products.data]);

  // La vista previa se pide sin el pago para conocer el total; el pago se agrega después.
  const [debouncedPayload] = useDebouncedValue(payload, 350);
  const quoteBase = useQuery({
    queryKey: ['sale-quote', debouncedPayload, paymentMode, paidAmount],
    queryFn: async ({ signal }) => {
      const body = { ...debouncedPayload!, ...paidFor(paymentMode, paidAmount) };
      return (await api.post<SaleQuote>('/sales/quote', body, { signal })).data;
    },
    enabled: !!debouncedPayload,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const quote = debouncedPayload ? quoteBase.data : undefined;

  const pendingApproval = quote?.issues.filter((i) => !i.approver) ?? [];
  const needsSupervisor = pendingApproval.length > 0;
  const missingReason =
    (quote?.issues.some((i) => i.type === 'LOT_OVERRIDE') && !forceReason.trim()) ||
    (quote?.issues.some((i) => i.type === 'CREDIT_LIMIT') && !creditReason.trim()) ||
    quote?.issues.some((i) => i.type === 'PRICE_CHANGE' && !validLines[i.lineIndex!]?.priceChangeReason.trim());

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        ...payload!,
        ...paidFor(paymentMode, paidAmount),
        authorization: needsSupervisor ? supervisor : undefined,
      };
      return (await api.post<SaleDetail>('/sales', body)).data;
    },
    onSuccess: (sale) => {
      notifyOk(`Venta ${sale.saleNumber} registrada`);
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['presales'] });
      navigate(`/ventas/${sale.id}`);
    },
    onError: notifyError,
  });

  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickerLine = lines.find((l) => l.key === pickerFor);
  const productName = (id: string | null) => products.data?.find((p) => p.id === id)?.name ?? '';
  const change = received !== '' && quote ? Number(received) - Number(quote.paid) : null;

  return (
    <>
      <PageHeader title="Nueva venta" subtitle="El sistema asigna los lotes por vencimiento y calcula precio, descuento y crédito" />
      {presale.data && (
        <Alert mb="md" color="blue" icon={<IconDeviceMobile size={16} />} title={`Atendiendo la preventa ${presale.data.presaleNumber}`}>
          Pedido de {presale.data.customer.name} tomado por {presale.data.preventista.fullName}. Puede ajustar los kilos según lo pesado;
          el precio final sale de los lotes asignados.
        </Alert>
      )}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack>
            <Card withBorder>
              <Group grow align="flex-start">
                <Select
                  label="Almacén"
                  allowDeselect={false}
                  value={effectiveWarehouse}
                  onChange={setWarehouseId}
                  data={allowedWarehouses.map((w) => ({ value: w.id, label: w.name }))}
                />
                <Select
                  label="Cliente"
                  placeholder="Venta rápida (sin cliente)"
                  searchable
                  clearable
                  value={customerId}
                  onChange={(v) => {
                    setCustomerId(v);
                    // Sin cliente solo se permite contado.
                    if (!v) setPaymentMode('full');
                  }}
                  searchValue={customerSearch}
                  onSearchChange={setCustomerSearch}
                  filter={({ options }) => options}
                  nothingFoundMessage="Sin resultados"
                  data={(customers.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
                />
              </Group>
              {quote?.customer && (
                <Group gap="xs" mt="xs">
                  {quote.customer.rank && <Badge variant="light">Rango {quote.customer.rank} · {fmtPct(quote.discountPercentage)} desc.</Badge>}
                  <Badge variant="light" color={quote.customer.creditEnabled ? 'teal' : 'gray'}>
                    {quote.customer.creditEnabled ? `Crédito disponible ${fmtBob(quote.customer.creditAvailable)}` : 'Sin crédito'}
                  </Badge>
                </Group>
              )}
            </Card>

            <Card withBorder p={0}>
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Producto</Table.Th>
                      <Table.Th>Kg</Table.Th>
                      <Table.Th>Precio/kg</Table.Th>
                      <Table.Th>Lotes</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {lines.map((l) => {
                      const qLineIdx = validLines.findIndex((v) => v.key === l.key);
                      const qLine = qLineIdx >= 0 ? quote?.lines[qLineIdx] : undefined;
                      const priceChanged = l.unitPrice !== '' && qLine && Math.abs(Number(qLine.originalUnitPrice) - Number(l.unitPrice)) > 0.00005;
                      return (
                        <Table.Tr key={l.key}>
                          <Table.Td>
                            <Select
                              searchable
                              placeholder="Producto"
                              value={l.productId}
                              onChange={(v) => updateLine(l.key, { productId: v, lots: undefined, unitPrice: '', crates: '' })}
                              data={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                            />
                            {kgPerCrate(l.productId) && (
                              <Group gap={6} mt={6} wrap="nowrap">
                                <NumberInput
                                  size="xs"
                                  w={110}
                                  min={0}
                                  max={500}
                                  allowDecimal={false}
                                  placeholder="Canastillos"
                                  aria-label="Canastillos"
                                  value={l.crates}
                                  onChange={(v) => {
                                    const n = Number(v) || 0;
                                    // Propone el peso (canastillos × peso aproximado); se corrige con el de la balanza.
                                    updateLine(l.key, { crates: v as number | '', weightKg: n > 0 ? Math.round(n * kgPerCrate(l.productId)! * 1000) / 1000 : l.weightKg, lots: undefined });
                                  }}
                                />
                                <Text size="xs" c="dimmed">canastillos · ≈ {fmtKg(kgPerCrate(l.productId)!)} c/u; ponga el peso real</Text>
                              </Group>
                            )}
                            {priceChanged && (
                              <TextInput
                                mt={6}
                                size="xs"
                                placeholder="Motivo del cambio de precio"
                                value={l.priceChangeReason}
                                onChange={(e) => updateLine(l.key, { priceChangeReason: e.currentTarget.value })}
                                error={!l.priceChangeReason.trim()}
                              />
                            )}
                          </Table.Td>
                          <Table.Td>
                            <NumberInput min={0} decimalScale={3} w={90} value={l.weightKg} onChange={(v) => updateLine(l.key, { weightKg: v as number | '', lots: undefined })} />
                          </Table.Td>
                          <Table.Td>
                            <NumberInput
                              min={0}
                              decimalScale={4}
                              w={110}
                              placeholder={qLine ? Number(qLine.originalUnitPrice).toFixed(2) : 'Sugerido'}
                              value={l.unitPrice}
                              onChange={(v) => updateLine(l.key, { unitPrice: v as number | '' })}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Tooltip label="Elegir lotes a mano">
                              <Button
                                size="xs"
                                variant={l.lots ? 'filled' : 'light'}
                                color={l.lots ? 'grape' : undefined}
                                leftSection={<IconStack2 size={14} />}
                                disabled={!l.productId || !(Number(l.weightKg) > 0)}
                                onClick={() => setPickerFor(l.key)}
                              >
                                {l.lots ? 'Manual' : 'FEFO'}
                              </Button>
                            </Tooltip>
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon variant="subtle" color="red" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Quitar">
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <Group p="sm">
                <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setLines((ls) => [...ls, newLine()])}>
                  Agregar producto
                </Button>
              </Group>
            </Card>

            <Textarea label="Observaciones" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card withBorder style={{ position: 'sticky', top: 72 }}>
            <Stack gap="sm">
              <Text fw={600}>Detalle calculado</Text>
              {!payload && <Text c="dimmed" size="sm">Agregue productos y kilos para ver la asignación de lotes.</Text>}
              {payload && quoteBase.error && <Alert color="red" icon={<IconAlertTriangle size={16} />}>{apiErrorMessage(quoteBase.error)}</Alert>}

              {quote?.lines.map((ql, idx) => (
                <div key={idx}>
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>{ql.productName} · {fmtKg(ql.weightKg)}</Text>
                    <Text size="sm" fw={600}>{fmtBob(ql.subtotal)}</Text>
                  </Group>
                  {ql.allocations.map((a) => (
                    <Group key={a.lotId} justify="space-between" pl="sm">
                      <Group gap={6}>
                        <Text size="xs" c="dimmed">{a.lotCode} · vence {fmtDate(a.expiryDate)}</Text>
                        {a.forced && <Badge size="xs" color="red">Fuera de FEFO</Badge>}
                      </Group>
                      <Text size="xs">{fmtKg(a.weightKg)} × {fmtPerKg(a.price)}</Text>
                    </Group>
                  ))}
                </div>
              ))}

              {quote && (
                <>
                  <Divider />
                  <Group justify="space-between"><Text size="sm">Subtotal</Text><Text size="sm">{fmtBob(quote.subtotal)}</Text></Group>
                  {Number(quote.discount) > 0 && (
                    <Group justify="space-between"><Text size="sm">Descuento por rango ({fmtPct(quote.discountPercentage)})</Text><Text size="sm" c="green">−{fmtBob(quote.discount)}</Text></Group>
                  )}
                  <Group justify="space-between"><Text fw={700} size="lg">Total</Text><Text fw={700} size="lg">{fmtBob(quote.total)}</Text></Group>
                  {can('reports.financial') && (
                    <Text size="xs" c="dimmed">
                      Costo real {fmtBob(quote.cost)} · margen {fmtBob(Number(quote.total) - Number(quote.cost))}
                    </Text>
                  )}

                  {customerId && totalCrates > 0 && (
                    <Checkbox
                      label={`El cliente se lleva los ${totalCrates} canastillos (quedan en su saldo hasta que los devuelva)`}
                      checked={cratesToCustomer}
                      onChange={(e) => setCratesToCustomer(e.currentTarget.checked)}
                    />
                  )}
                  <Divider label="Pago" labelPosition="left" />
                  <SegmentedControl
                    fullWidth
                    value={paymentMode}
                    onChange={(v) => setPaymentMode(v as typeof paymentMode)}
                    data={[
                      { value: 'full', label: 'Contado' },
                      { value: 'partial', label: 'Parcial', disabled: !customerId },
                      { value: 'credit', label: 'Crédito', disabled: !customerId },
                    ]}
                  />
                  {paymentMode !== 'credit' && (
                    <Group grow>
                      <Select
                        label="Método"
                        allowDeselect={false}
                        value={paymentMethod}
                        onChange={(v) => setPaymentMethod(v!)}
                        data={[
                          { value: 'EFECTIVO', label: 'Efectivo' },
                          { value: 'QR', label: 'QR' },
                          { value: 'TRANSFERENCIA', label: 'Transferencia' },
                        ]}
                      />
                      {paymentMode === 'partial' ? (
                        <NumberInput label="Monto pagado" min={0} decimalScale={2} value={paidAmount} onChange={(v) => setPaidAmount(v as number | '')} />
                      ) : (
                        paymentMethod === 'EFECTIVO' && (
                          <NumberInput label="Recibido (para cambio)" min={0} decimalScale={2} value={received} onChange={(v) => setReceived(v as number | '')} />
                        )
                      )}
                    </Group>
                  )}
                  {change !== null && paymentMode === 'full' && (
                    <Text size="sm" c={change < 0 ? 'red' : undefined}>Cambio: <b>{fmtBob(change)}</b></Text>
                  )}
                  <Group justify="space-between">
                    <Badge variant="light" color={PAYMENT_STATUS[quote.paymentStatus].color}>{PAYMENT_STATUS[quote.paymentStatus].label}</Badge>
                    {Number(quote.credit) > 0 && <Text size="sm">A deuda: <b>{fmtBob(quote.credit)}</b></Text>}
                  </Group>

                  {quote.issues.length > 0 && (
                    <Alert color="orange" icon={<IconLock size={16} />} title="Requiere autorización">
                      <Stack gap="xs">
                        {quote.issues.map((i, k) => (
                          <Text size="sm" key={k}>
                            • {i.message}
                            {i.approver ? <Text span c="green"> — autoriza {i.approver.fullName}</Text> : null}
                          </Text>
                        ))}
                        {quote.issues.some((i) => i.type === 'LOT_OVERRIDE') && (
                          <TextInput size="xs" label="Motivo para usar otro lote" value={forceReason} onChange={(e) => setForceReason(e.currentTarget.value)} />
                        )}
                        {quote.issues.some((i) => i.type === 'CREDIT_LIMIT') && (
                          <TextInput size="xs" label="Motivo de la excepción de crédito" value={creditReason} onChange={(e) => setCreditReason(e.currentTarget.value)} />
                        )}
                        {needsSupervisor && (
                          <>
                            <Text size="xs" c="dimmed">Ingrese las credenciales de un supervisor con permiso:</Text>
                            <Group grow>
                              <TextInput size="xs" placeholder="Usuario" value={supervisor.username} onChange={(e) => setSupervisor((s) => ({ ...s, username: e.currentTarget.value }))} autoComplete="off" />
                              <PasswordInput size="xs" placeholder="Contraseña" value={supervisor.password} onChange={(e) => setSupervisor((s) => ({ ...s, password: e.currentTarget.value }))} autoComplete="new-password" />
                            </Group>
                          </>
                        )}
                      </Stack>
                    </Alert>
                  )}
                </>
              )}

              <Button
                size="md"
                loading={create.isPending}
                disabled={
                  !quote ||
                  !!quoteBase.error ||
                  quoteBase.isFetching ||
                  !!missingReason ||
                  (needsSupervisor && (!supervisor.username || !supervisor.password)) ||
                  (paymentMode === 'partial' && paidAmount === '')
                }
                onClick={() => create.mutate()}
              >
                Confirmar venta {quote ? fmtBob(quote.total) : ''}
              </Button>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {pickerLine && effectiveWarehouse && (
        <LotPicker
          opened
          onClose={() => setPickerFor(null)}
          warehouseId={effectiveWarehouse}
          productId={pickerLine.productId!}
          productName={productName(pickerLine.productId)}
          weightKg={Number(pickerLine.weightKg)}
          value={pickerLine.lots}
          onChange={(lots) => updateLine(pickerLine.key, { lots })}
        />
      )}
    </>
  );
}

/** Traduce el modo de pago al campo paidAmount de la API (omitido = contado). */
function paidFor(mode: 'full' | 'partial' | 'credit', amount: number | '') {
  if (mode === 'credit') return { paidAmount: 0 };
  if (mode === 'partial') return { paidAmount: amount === '' ? 0 : Number(amount) };
  return {};
}
