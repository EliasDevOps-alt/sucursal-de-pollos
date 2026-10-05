import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    initialValues: { username: '', password: '' },
    validate: {
      username: (v) => (v.trim() ? null : 'Ingrese su usuario'),
      password: (v) => (v ? null : 'Ingrese su contraseña'),
    },
  });

  const submit = form.onSubmit(async ({ username, password }) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-body)">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={380}>
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Title order={2}>🐔 ERP Pollos</Title>
              <Text c="dimmed" size="sm">Distribución y comercialización</Text>
            </div>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput label="Usuario" autoComplete="username" autoFocus {...form.getInputProps('username')} />
            <PasswordInput label="Contraseña" autoComplete="current-password" {...form.getInputProps('password')} />
            <Button type="submit" loading={submitting} fullWidth>
              Ingresar
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
