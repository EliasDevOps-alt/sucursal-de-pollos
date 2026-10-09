import { Alert, Button, Modal, NumberInput, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CustomerDetail } from '../../api/types';
import { fmtBob } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

/** Saldo inicial (deuda anterior al sistema) o corrección autorizada de la deuda. No mueve dinero ni crea ventas. */
export function DebtAdjustmentModal({ customer, opened, onClose }: { customer: CustomerDetail; opened: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<'OPENING' | 'CORRECTION'>('OPENING');
  const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!opened) return;
    setKind(Number(customer.currentDebt) === 0 ? 'OPENING' : 'CORRECTION');
    setDirection('UP');
    setAmount('');
    setReason('');
  }, [opened, customer.currentDebt]);
  const signed = (direction === 'UP' ? 1 : -1) * Number(amount || 0);
  const after = Math.round((Number(customer.currentDebt) + signed) * 100) / 100;
  const save = useMutation({
    mutationFn: async () => api.post('/collections/adjustments', { customerId: customer.id, amount: signed, kind, reason: reason.trim() }),
    onSuccess: () => {
      notifyOk(`Deuda de ${customer.name}: ${fmtBob(after)}`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      onClose();
    },
    onError: notifyError,
  });
  return (
    <Modal opened={opened} onClose={onClose} title={`Ajustar deuda · ${customer.name}`}>
      <Stack>
        <SegmentedControl value={kind} onChange={(v) => setKind(v as typeof kind)} data={[{ value: 'OPENING', label: 'Saldo inicial' }, { value: 'CORRECTION', label: 'Corrección' }]} />
        <Text size="sm" c="dimmed">
          {kind === 'OPENING'
            ? 'Lo que el cliente ya debía antes de usar el sistema (cuaderno, sistema anterior).'
            : 'Solo para errores que no se corrigen anulando la venta o el cobro. No mueve dinero de ninguna caja.'}
        </Text>
        <SegmentedControl value={direction} onChange={(v) => setDirection(v as typeof direction)} data={[{ value: 'UP', label: 'Aumenta la deuda' }, { value: 'DOWN', label: 'Reduce la deuda' }]} />
        <NumberInput label="Monto (Bs)" withAsterisk min={0.01} decimalScale={2} value={amount} onChange={(v) => setAmount(v as number | '')} />
        <Textarea label="Motivo" withAsterisk autosize minRows={2} placeholder="Ej.: deuda del cuaderno al 30/09" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Alert variant="light" color={after < 0 ? 'blue' : 'gray'}>
          Deuda actual {fmtBob(customer.currentDebt)} → queda en <b>{fmtBob(after)}</b>{after < 0 ? ' (saldo a favor)' : ''}. Queda registrado en sus movimientos y en la auditoría.
        </Alert>
        <Button loading={save.isPending} disabled={!amount || reason.trim().length < 5} onClick={() => save.mutate()}>Registrar ajuste</Button>
      </Stack>
    </Modal>
  );
}
