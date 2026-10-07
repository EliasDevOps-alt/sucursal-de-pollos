import { Box, Button, Center, Group, Loader, Table, Text, Title } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { RouteDetail } from '../../api/types';
import { fmtBob, fmtDate, fmtDateTime, fmtKg, ROUTE_STATUS } from '../../lib/format';

/** Hoja de carga / despacho para imprimir: qué lleva el vehículo y en qué orden se entrega. */
export function LoadSheetPage() {
  const { id } = useParams();
  const { data: r, isLoading } = useQuery({ queryKey: ['routes', id], queryFn: async () => (await api.get<RouteDetail>(`/routes/${id}`)).data });
  if (isLoading || !r) return <Center h="60vh"><Loader /></Center>;
  const loaded = !!r.dispatchedAt;

  return (
    <Box p="lg" maw={900} mx="auto" className="load-sheet" bg="white" c="black">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 12mm; } } .load-sheet table td, .load-sheet table th { color: #000; }`}</style>
      <Group justify="space-between" align="flex-start" mb="md">
        <div>
          <Text size="sm" fw={600}>ERP Pollos · Distribuidora</Text>
          <Title order={2}>Hoja de carga · {r.routeNumber}</Title>
          <Text size="sm">
            Entrega {fmtDate(r.routeDate)} · {ROUTE_STATUS[r.status].label} · Vehículo {r.vehicle.plate} ({r.vehicle.description}) · Chofer {r.driver.fullName}
          </Text>
          <Text size="sm">Carga desde {r.originWarehouse.name}{r.dispatchedAt ? ` · despachado el ${fmtDateTime(r.dispatchedAt)} por ${r.dispatchedBy?.fullName}` : ' · aún no despachado'}</Text>
        </div>
        <Button className="no-print" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>Imprimir</Button>
      </Group>

      <Title order={4} mb={4}>Carga por producto</Title>
      <Table withTableBorder withColumnBorders mb="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Producto</Table.Th>
            <Table.Th ta="right">Pedido</Table.Th>
            <Table.Th ta="right">{loaded ? 'Cargado' : 'A cargar'}</Table.Th>
            <Table.Th ta="right">Verificado</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {r.loadSheet.map((l) => (
            <Table.Tr key={l.productId}>
              <Table.Td>{l.name}</Table.Td>
              <Table.Td ta="right">{fmtKg(l.orderedKg)}</Table.Td>
              <Table.Td ta="right">{loaded ? fmtKg(l.loadedKg) : fmtKg(l.orderedKg)}</Table.Td>
              <Table.Td />
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td fw={700}>Total (≈ {r.summary.estimatedCrates} canastillos)</Table.Td>
            <Table.Td ta="right" fw={700}>{fmtKg(r.summary.orderedKg)}</Table.Td>
            <Table.Td ta="right" fw={700}>{fmtKg(r.loadSheet.reduce((t, l) => t + Number(loaded ? l.loadedKg : l.orderedKg), 0).toFixed(3))}</Table.Td>
            <Table.Td />
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Title order={4} mb={4}>Recorrido</Title>
      <Table withTableBorder withColumnBorders style={{ fontVariantNumeric: 'tabular-nums' }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th>Cliente</Table.Th>
            <Table.Th>Dirección / teléfono</Table.Th>
            <Table.Th>Pedido</Table.Th>
            <Table.Th ta="right">Monto</Table.Th>
            <Table.Th>Firma</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {r.stops.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td>{s.sequence}</Table.Td>
              <Table.Td>
                {s.customer.name}
                <Text size="xs">{s.presale.presaleNumber}</Text>
              </Table.Td>
              <Table.Td>
                {s.address?.address ?? '—'}
                {s.customer.phone && <Text size="xs">{s.customer.phone}</Text>}
              </Table.Td>
              <Table.Td>{s.items.map((i) => `${i.product.name} ${fmtKg(i.orderedWeightKg)}`).join(', ')}</Table.Td>
              <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{fmtBob(s.presale.totalAmount)}</Table.Td>
              <Table.Td w={120} />
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {r.notes && <Text size="sm" mt="sm">Observaciones: {r.notes}</Text>}

      <Group grow mt={64}>
        {['Despachó (almacén)', 'Chofer', 'Recibió sobrante'].map((who) => (
          <div key={who} style={{ borderTop: '1px solid #000', paddingTop: 4, textAlign: 'center' }}>
            <Text size="sm">{who}</Text>
          </div>
        ))}
      </Group>
    </Box>
  );
}
