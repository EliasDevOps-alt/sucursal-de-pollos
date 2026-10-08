import { Button, type ButtonProps } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import type { ReceiptSlug } from '../api/types';

/** Abre el comprobante en una pestaña aparte, listo para la impresora térmica o para guardarlo como PDF. */
export function ReceiptButton({ type, id, label = 'Imprimir comprobante', ...props }: { type: ReceiptSlug; id: string; label?: string } & ButtonProps) {
  return (
    <Button variant="light" leftSection={<IconPrinter size={16} />} {...props}
      onClick={() => window.open(`/comprobante/${type}/${id}`, '_blank', 'noopener')}>
      {label}
    </Button>
  );
}
