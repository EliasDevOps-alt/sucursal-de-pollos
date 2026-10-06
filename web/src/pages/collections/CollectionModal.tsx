import { Alert, Button, Checkbox, Group, Modal, NumberInput, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Collection } from '../../api/types';
import { fmtBob } from '../../lib/format';
import { notifyError, notifyOk } from '../../lib/notify';

interface Props {
  opened: boolean;
  onClose: () => void;
  customer: { id: string; name: string; currentDebt: string } | null;
  onDone?: (c: Collection) => void;
}

/** Registrar un cobro de deuda. Un solo método por cobro; un pago combinado se registra como varios cobros. */
export function CollectionModal({ opened, onClose, customer, onDone }: Props) {
  const qc = useQueryClient();
  const debt = Math.max(0, Number(customer?.currentDebt ?? 0));
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState('EFECTIVO');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [advance, setAdvance] = useState(false);

  useEffect(() => {
    if (opened) {
      setAmount(debt > 0 ? debt : '');
      setMethod('EFECTIVO');
      setReference('');
      setNotes('');
      setAdvance(false);
    }
  }, [opened, debt]);

  const exceeds = amount !== '' && amount > debt + 0.004;
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post<Collection>('/collections', {
          customerId: customer!.id,
          amount: Number(amount),
          paymentMethod: method,
          referenceNumber: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          allowAdvance: exceeds ? advance : undefined,
        })
      ).data,
    onSuccess: (c) => {
      notifyOk(`Cobro ${c.receiptNumber} registrado por ${fmtBob(c.amount)}`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone?.(c);
      onClose();
    },
    onError: notifyError,
  });

  return (
    <Modal opened={opened} onClose={onClose} title={`Registrar cobro${customer ? ` · ${customer.name}` : ''}`}>
      <Stack>
        <Group justify="space-between">
          <Text size="sm">Deuda actual</Text>
          <Text fw={700}>{Number(customer?.currentDebt ?? 0) < 0 ? `Saldo a favor ${fmtBob(-Number(customer?.currentDebt))}` : fmtBob(debt)}</Text>
        </Group>
        <NumberInput label="Monto cobrado (Bs)" withAsterisk min={0} decimalScale={2} value={amount} onChange={(v) => setAmount(v as number | '')} autoFocus />
        {exceeds && (
          <Alert color="yellow" variant="light">
            El monto supera la deuda por {fmtBob(Number(amount) - debt)}.
            <Checkbox mt="xs" label="Registrar el excedente como anticipo (saldo a favor del cliente)" checked={advance} onChange={(e) => setAdvance(e.currentTarget.checked)} />
          </Alert>
        )}
        <Group grow>
          <Select
            label="Método"
            allowDeselect={false}
            value={method}
            onChange={(v) => setMethod(v!)}
            data={[
              { value: 'EFECTIVO', label: 'Efectivo' },
              { value: 'QR', label: 'QR' },
              { value: 'TRANSFERENCIA', label: 'Transferencia' },
            ]}
          />
          {method !== 'EFECTIVO' && <TextInput label="N.º de transacción" value={reference} onChange={(e) => setReference(e.currentTarget.value)} />}
        </Group>
        <Textarea label="Observaciones" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">Si el cliente paga con dos métodos (por ejemplo, parte en efectivo y parte por QR), registre un cobro por cada uno.</Text>
        <Button loading={save.isPending} disabled={!customer || !(Number(amount) > 0) || (exceeds && !advance)} onClick={() => save.mutate()}>
          Registrar cobro {amount !== '' ? fmtBob(Number(amount)) : ''}
        </Button>
      </Stack>
    </Modal>
  );
}
