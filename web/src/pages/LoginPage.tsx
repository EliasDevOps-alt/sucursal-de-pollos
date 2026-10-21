import { Alert, ActionIcon, Avatar, Badge, Button, Center, Group, Loader, Paper, PinInput, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconArrowLeft, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface LoginUser {
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const users = useQuery({ queryKey: ['login-users'], queryFn: async () => (await api.get<LoginUser[]>('/auth/users')).data });

  const choose = (u: LoginUser | null) => {
    setSelected(u);
    setPin('');
    setError(null);
  };

  const submit = async (value: string) => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(selected.username, value);
      navigate('/', { replace: true });
    } catch (e) {
      setError(apiErrorMessage(e));
      setPin('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Center mih="100vh" p="md" className="login-bg">
      <Paper withBorder shadow="lg" p="xl" w="100%" maw={selected ? 380 : 480}>
        <Stack>
          <div>
            <Title order={2}>🐔 ERP Pollos</Title>
            <Text c="dimmed" size="sm">Distribución y comercialización</Text>
          </div>
          {error && <Alert color="red">{error}</Alert>}

          {!selected && (
            <>
              <Text fw={500}>¿Quién ingresa?</Text>
              {users.isLoading && <Center><Loader size="sm" /></Center>}
              {users.isError && <Alert color="red">No se pudo cargar la lista de usuarios. Revise que el servidor esté encendido.</Alert>}
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                {users.data?.map((u) => (
                  <UnstyledButton key={u.username} onClick={() => choose(u)} p="sm" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)' }}>
                    <Group wrap="nowrap">
                      <Avatar color="orange" radius="xl">{initials(u.fullName)}</Avatar>
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fw={600} truncate>{u.fullName}</Text>
                        <Badge size="xs" variant="light" color="orange">{u.roleName}</Badge>
                      </div>
                    </Group>
                  </UnstyledButton>
                ))}
              </SimpleGrid>
            </>
          )}

          {selected && (
            <Stack align="center" gap="md">
              <Group w="100%">
                <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => choose(null)}>
                  Cambiar usuario
                </Button>
              </Group>
              <Avatar color="orange" radius="xl" size="lg">{initials(selected.fullName)}</Avatar>
              <div style={{ textAlign: 'center' }}>
                <Text fw={600}>{selected.fullName}</Text>
                <Text size="xs" c="dimmed">{selected.roleName}</Text>
              </div>
              <Text size="sm">Ingrese su PIN de 4 dígitos</Text>
              <Group gap="xs" wrap="nowrap">
                <PinInput
                  length={4}
                  type="number"
                  inputMode="numeric"
                  mask={!showPin}
                  oneTimeCode={false}
                  autoFocus
                  size="lg"
                  value={pin}
                  onChange={setPin}
                  onComplete={submit}
                  disabled={submitting}
                  error={!!error}
                  aria-label="PIN"
                />
                <ActionIcon variant="subtle" color="gray" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}>
                  {showPin ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </ActionIcon>
              </Group>
              {submitting && <Loader size="sm" />}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
