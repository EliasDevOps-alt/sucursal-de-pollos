import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CashAccountRow } from '../../api/types';
import { BOB_DENOMINATIONS, EXPENSE_TYPE_LABELS, fmtBob } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

export const INVALIDATE_CASH = ['cash', 'purchases', 'sales', 'collections'];

function useCashMutation<T>(fn: (v: T) => Promise<unknown>, ok: string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      notifyOk(ok);
      for (const k of INVALIDATE_CASH) qc.invalidateQueries({ queryKey: [k] });
      onDone();
    },
    onError: notifyError,
  });
}

/** Apertura de caja: se cuenta el efectivo con que empieza el turno. */
export function OpenCashModal({ account, onClose }: { account: CashAccountRow | null; onClose: () => void }) {
  const [counted, setCounted] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (account) {
      setCounted(Number(account.balance));
      setNotes('');
    }
  }, [account]);
  const open = useCashMutation(() => api.post('/cash/sessions', { accountId: account!.id, countedAmount: Number(counted || 0), notes: notes || undefined }), 'Caja abierta', onClose);
  const diff = Number(counted || 0) - Number(account?.balance ?? 0);
  return (
    <Modal opened={!!account} onClose={onClose} title={`Abrir ${account?.name ?? ''}`}>
      <Stack>
        <Text size="sm">Según el sistema hay <b>{fmtBob(account?.balance)}</b>. Cuente el efectivo y registre lo que hay realmente.</Text>
        <NumberInput label="Efectivo contado" withAsterisk min={0} decimalScale={2} value={counted} onChange={(v) => setCounted(v as number | '')} />
        {Math.abs(diff) >= 0.005 && <Alert color="orange">Diferencia de {fmtBob(diff)}: se registrará como {diff > 0 ? 'sobrante' : 'faltante'} de apertura.</Alert>}
        <Textarea label="Observaciones" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        <Button loading={open.isPending} onClick={() => open.mutate(undefined)}>Abrir caja</Button>
      </Stack>
    </Modal>
  );
}

/** Cierre de caja con arqueo por billetes y monedas. */
export function CloseCashModal({ account, onClose }: { account: CashAccountRow | null; onClose: () => void }) {
  const [byBill, setByBill] = useState<Record<string, number | ''>>({});
  const [mode, setMode] = useState<'bills' | 'total'>('bills');
  const [total, setTotal] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!account) return;
    setByBill({});
    setTotal(Number(account.balance));
    setNotes('');
    setMode('bills');
  }, [account]);
  const counted = mode === 'bills' ? Math.round(BOB_DENOMINATIONS.reduce((t, d) => t + Number(d) * Number(byBill[d] || 0), 0) * 100) / 100 : Number(total || 0);
  const expected = Number(account?.balance ?? 0);
  const diff = Math.round((counted - expected) * 100) / 100;
  const close = useCashMutation(
    () =>
      api.post(`/cash/sessions/${account!.openSession!.id}/close`, {
        countedAmount: counted,
        denominations: mode === 'bills' ? Object.fromEntries(Object.entries(byBill).filter(([, q]) => Number(q) > 0).map(([d, q]) => [d, Number(q)])) : undefined,
        notes: notes || undefined,
      }),
    'Caja cerrada',
    onClose,
  );
  return (
    <Modal opened={!!account} onClose={onClose} title={`Cerrar ${account?.name ?? ''} · ${account?.openSession?.sessionNumber ?? ''}`} size="lg">
      <Stack>
        <Group justify="space-between">
          <Text size="sm">Debería haber <b>{fmtBob(expected)}</b> en efectivo.</Text>
          <SegmentedControl size="xs" value={mode} onChange={(v) => setMode(v as 'bills' | 'total')} data={[{ value: 'bills', label: 'Por billetes' }, { value: 'total', label: 'Solo el total' }]} />
        </Group>
        {mode === 'bills' ? (
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            {BOB_DENOMINATIONS.map((d) => (
              <NumberInput key={d} label={`Bs ${d.replace('.', ',')}`} min={0} allowDecimal={false} value={byBill[d] ?? ''} placeholder="0"
                onChange={(v) => setByBill((b) => ({ ...b, [d]: v as number | '' }))} />
            ))}
          </SimpleGrid>
        ) : (
          <NumberInput label="Efectivo contado" min={0} decimalScale={2} value={total} onChange={(v) => setTotal(v as number | '')} />
        )}
        <Group justify="space-between">
          <Text fw={700}>Contado {fmtBob(counted)}</Text>
          <Text fw={600} c={diff === 0 ? 'green' : 'red'}>{diff === 0 ? 'Cuadra' : `${diff > 0 ? 'Sobran' : 'Faltan'} ${fmtBob(Math.abs(diff))}`}</Text>
        </Group>
        <Textarea label="Observaciones" withAsterisk={diff !== 0} autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder={diff !== 0 ? 'Explique la diferencia' : undefined} />
        <Button loading={close.isPending} disabled={diff !== 0 && !notes.trim()} onClick={() => close.mutate(undefined)}>Cerrar caja</Button>
      </Stack>
    </Modal>
  );
}

/** Gasto u otro ingreso registrado a mano. */
export function ManualMovementModal({ kind, accounts, onClose }: { kind: 'EXPENSE' | 'OTHER_INCOME' | null; accounts: CashAccountRow[]; onClose: () => void }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (!kind) return;
    setAccountId(accounts.find((a) => a.type === 'CASH')?.id ?? null);
    setExpenseType(null);
    setAmount('');
    setDescription('');
  }, [kind, accounts]);
  const save = useCashMutation(
    () => api.post('/cash/movements', { accountId, category: kind, expenseType: kind === 'EXPENSE' ? expenseType : undefined, amount: Number(amount), description }),
    kind === 'EXPENSE' ? 'Gasto registrado' : 'Ingreso registrado',
    onClose,
  );
  const account = accounts.find((a) => a.id === accountId);
  return (
    <Modal opened={!!kind} onClose={onClose} title={kind === 'EXPENSE' ? 'Registrar gasto' : 'Registrar otro ingreso'}>
      <Stack>
        <Select label={kind === 'EXPENSE' ? 'Sale de' : 'Entra a'} allowDeselect={false} value={accountId} onChange={setAccountId}
          data={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${fmtBob(a.balance)}` }))} />
        {kind === 'EXPENSE' && (
          <Select label="Tipo de gasto" withAsterisk value={expenseType} onChange={setExpenseType} data={Object.entries(EXPENSE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        )}
        <NumberInput label="Monto" withAsterisk min={0} decimalScale={2} value={amount} onChange={(v) => setAmount(v as number | '')}
          error={kind === 'EXPENSE' && account && Number(amount) > Number(account.balance) ? `${account.name} tiene ${fmtBob(account.balance)}` : undefined} />
        <TextInput label="Descripción" withAsterisk value={description} onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={kind === 'EXPENSE' ? 'Ej.: diésel camioneta 3456-KTR' : 'Ej.: aporte del socio'} />
        <Button color={kind === 'EXPENSE' ? 'red' : undefined} loading={save.isPending}
          disabled={!accountId || !Number(amount) || description.trim().length < 3 || (kind === 'EXPENSE' && !expenseType)} onClick={() => save.mutate(undefined)}>
          Registrar
        </Button>
      </Stack>
    </Modal>
  );
}

/** Traspaso entre cuentas: depósito del efectivo al banco, fondo para la sucursal, etc. */
export function TransferModal({ opened, accounts, onClose }: { opened: boolean; accounts: CashAccountRow[]; onClose: () => void }) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (!opened) return;
    setFrom(accounts.find((a) => a.code === 'CAJA-CEN')?.id ?? null);
    setTo(accounts.find((a) => a.type === 'BANK')?.id ?? null);
    setAmount('');
    setDescription('');
  }, [opened, accounts]);
  const save = useCashMutation(
    () => api.post('/cash/transfers', { fromAccountId: from, toAccountId: to, amount: Number(amount), description: description || undefined }),
    'Traspaso registrado',
    onClose,
  );
  const source = accounts.find((a) => a.id === from);
  const options = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${fmtBob(a.balance)}` }));
  return (
    <Modal opened={opened} onClose={onClose} title="Traspaso entre cuentas">
      <Stack>
        <Select label="Desde" allowDeselect={false} value={from} onChange={setFrom} data={options} />
        <Select label="Hacia" allowDeselect={false} value={to} onChange={setTo} data={options.filter((o) => o.value !== from)} />
        <NumberInput label="Monto" withAsterisk min={0} decimalScale={2} value={amount} onChange={(v) => setAmount(v as number | '')}
          error={source && Number(amount) > Number(source.balance) ? `Hay ${fmtBob(source.balance)}` : undefined} />
        <TextInput label="Detalle" value={description} onChange={(e) => setDescription(e.currentTarget.value)} placeholder="Ej.: depósito del día" />
        <Button loading={save.isPending} disabled={!from || !to || from === to || !Number(amount)} onClick={() => save.mutate(undefined)}>Registrar traspaso</Button>
      </Stack>
    </Modal>
  );
}
