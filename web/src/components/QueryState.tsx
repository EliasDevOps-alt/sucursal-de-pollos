import { Alert, Center, Loader } from '@mantine/core';
import { ReactNode } from 'react';
import { apiErrorMessage } from '../api/client';

/** Muestra carga o error de una consulta; si todo está bien, renderiza el contenido. */
export function QueryState({ isLoading, error, children }: { isLoading: boolean; error: unknown; children: ReactNode }) {
  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (error) return <Alert color="red" title="No se pudo cargar">{apiErrorMessage(error)}</Alert>;
  return <>{children}</>;
}
