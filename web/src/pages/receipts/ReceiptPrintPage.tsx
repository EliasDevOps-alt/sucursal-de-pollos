import { Alert, Box, Button, Center, Group, Loader, SegmentedControl, Text } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Receipt } from '../../api/types';
import { notifyError } from '../../lib/notify';
import './receipt.css';

const WIDTH_KEY = 'erp_receipt_width';
const readWidth = () => {
  try {
    return localStorage.getItem(WIDTH_KEY) === '58' ? '58' : '80';
  } catch {
    return '80';
  }
};

/** El ticket: el mismo contenido que imprime la app por Bluetooth. */
export function ReceiptTicket({ r, copyLabel }: { r: Receipt; copyLabel?: string }) {
  return (
    <div className="ticket">
      <div className="t-center t-strong t-big">{r.company.name}</div>
      {r.company.nit && <div className="t-center">NIT {r.company.nit}</div>}
      {r.company.address && <div className="t-center">{r.company.address}</div>}
      {r.company.phone && <div className="t-center">Tel. {r.company.phone}</div>}
      <hr />
      <div className="t-center t-strong">{r.title}</div>
      <div className="t-center">N.º {r.number}</div>
      <div className="t-center">{r.issuedAt}</div>
      {copyLabel && <div className="t-center t-strong">{copyLabel}</div>}
      {r.notice && <div className="t-center t-strong t-notice">*** {r.notice} ***</div>}
      <hr />
      {r.meta.map((m) => (
        <div key={m.label} className="t-row"><span>{m.label}:</span><span className="t-right">{m.value}</span></div>
      ))}
      {r.items.length > 0 && <hr />}
      {r.items.map((i, n) => (
        <div key={n} className="t-item">
          <div className="t-row"><span className="t-strong">{i.description}</span>{i.amount && <span className="t-right t-nowrap">{i.amount}</span>}</div>
          {i.detail && <div className="t-small">{i.detail}</div>}
        </div>
      ))}
      {r.totals.length > 0 && <hr />}
      {r.totals.map((t) => (
        <div key={t.label} className={`t-row${t.strong ? ' t-strong t-big' : ''}`}><span>{t.label}</span><span className="t-nowrap">{t.value}</span></div>
      ))}
      {r.extra.length > 0 && <hr />}
      {r.extra.map((e, n) => (
        <div key={n} className="t-row"><span>{e.label}:</span><span className="t-right">{e.value}</span></div>
      ))}
      {(r.signature || r.signatureLabel) && (
        <div className="t-sign">
          {r.signature ? <img src={r.signature} alt={r.signatureLabel ?? 'Firma'} /> : <div className="t-sign-space" />}
          <div className="t-sign-line">{r.signatureLabel ?? 'Firma'}</div>
        </div>
      )}
      {r.footer && <div className="t-center t-footer">{r.footer}</div>}
    </div>
  );
}

/** Comprobante para impresora térmica (80 o 58 mm) o PDF. Cada impresión queda registrada: la primera es el original y las siguientes, copias. */
export function ReceiptPrintPage() {
  const { type, id } = useParams();
  const qc = useQueryClient();
  const [width, setWidth] = useState(readWidth);
  const [copyLabel, setCopyLabel] = useState<string>();
  const { data: r, isLoading, error } = useQuery({
    queryKey: ['receipt', type, id],
    queryFn: async () => (await api.get<Receipt>(`/receipts/${type}/${id}`)).data,
  });
  useEffect(() => {
    if (r) document.title = `${r.title} ${r.number}`;
  }, [r]);
  const print = useMutation({
    mutationFn: async () => (await api.post<Receipt>(`/receipts/${type}/${id}/print`, { channel: 'WEB' })).data,
    onSuccess: (p) => {
      flushSync(() => setCopyLabel(p.copyNumber ? `COPIA ${p.copyNumber}` : 'ORIGINAL'));
      window.print();
      qc.setQueryData(['receipt', type, id], p);
      qc.invalidateQueries({ queryKey: ['receipt-prints'] });
    },
    onError: notifyError,
  });

  if (isLoading) return <Center h="60vh"><Loader /></Center>;
  if (error || !r) return <Center h="60vh"><Alert color="red">No se pudo cargar el comprobante.</Alert></Center>;

  const changeWidth = (w: string) => {
    setWidth(w);
    try {
      localStorage.setItem(WIDTH_KEY, w);
    } catch {
      /* sin almacenamiento: vale solo para esta vez */
    }
  };

  return (
    <Box className={`receipt-page w${width}`}>
      <style>{`@page { size: ${width}mm auto; margin: 0; }`}</style>
      <Group className="no-print" justify="center" gap="sm" p="md" wrap="wrap">
        <SegmentedControl value={width} onChange={changeWidth} data={[{ value: '80', label: '80 mm' }, { value: '58', label: '58 mm' }]} />
        <Button leftSection={<IconPrinter size={16} />} loading={print.isPending} onClick={() => print.mutate()}>
          {r.printCount ? `Reimprimir (copia ${r.printCount})` : 'Imprimir'}
        </Button>
        <Text size="xs" c="dimmed" w="100%" ta="center">
          Para PDF elija «Guardar como PDF» en el diálogo de impresión.
          {r.printCount ? ` Impreso ${r.printCount} ${r.printCount === 1 ? 'vez' : 'veces'}.` : ''}
        </Text>
      </Group>
      <ReceiptTicket r={r} copyLabel={copyLabel} />
    </Box>
  );
}
