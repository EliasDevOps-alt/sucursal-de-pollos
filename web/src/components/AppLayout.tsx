import { AppShell, Avatar, Burger, Group, NavLink, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingWarehouse,
  IconCash,
  IconDeviceMobile,
  IconChartBar,
  IconLayoutDashboard,
  IconLogout,
  IconPackage,
  IconShoppingCart,
  IconTruckDelivery,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Inicio', icon: IconLayoutDashboard, permission: null },
  { to: '/ventas', label: 'Ventas', icon: IconCash, permission: 'sales.view' },
  { to: '/preventas', label: 'Preventas', icon: IconDeviceMobile, permission: 'presales.view_all' },
  { to: '/clientes', label: 'Clientes', icon: IconUsers, permission: 'customers.view' },
  { to: '/compras', label: 'Compras', icon: IconShoppingCart, permission: 'purchases.view' },
  { to: '/inventario', label: 'Inventario', icon: IconBuildingWarehouse, permission: 'inventory.view' },
  { to: '/reportes', label: 'Reportes', icon: IconChartBar, permission: 'reports.financial' },
  { to: '/productos', label: 'Productos', icon: IconPackage, permission: 'catalog.view' },
  { to: '/proveedores', label: 'Proveedores', icon: IconTruckDelivery, permission: 'catalog.view' },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, can, logout } = useAuth();
  const { pathname } = useLocation();

  // /lotes/:id se muestra bajo Inventario.
  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to) || (to === '/inventario' && pathname.startsWith('/lotes'));

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>🐔 ERP Pollos</Title>
          </Group>
          <Group gap="xs">
            <Avatar color="orange" radius="xl" size="sm">
              {user?.fullName.charAt(0)}
            </Avatar>
            <div style={{ lineHeight: 1.1 }}>
              <Text size="sm" fw={500}>{user?.fullName}</Text>
              <Text size="xs" c="dimmed">{user?.roleName}</Text>
            </div>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Stack gap={2} style={{ flex: 1 }}>
          {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => (
            <NavLink
              key={n.to}
              component={RouterLink}
              to={n.to}
              label={n.label}
              leftSection={<n.icon size={18} stroke={1.6} />}
              active={isActive(n.to)}
              onClick={close}
            />
          ))}
        </Stack>
        <UnstyledButton onClick={logout} p="xs">
          <Group gap="xs">
            <IconLogout size={18} stroke={1.6} />
            <Text size="sm">Cerrar sesión</Text>
          </Group>
        </UnstyledButton>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
