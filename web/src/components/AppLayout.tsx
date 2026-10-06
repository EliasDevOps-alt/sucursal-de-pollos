import { AppShell, Avatar, Burger, Divider, Group, NavLink, ScrollArea, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingWarehouse,
  IconCategory,
  IconClipboardList,
  IconRefreshAlert,
  IconShieldLock,
  IconUserCog,
  IconCash,
  IconDeviceMobile,
  IconChartBar,
  IconLayoutDashboard,
  IconLogout,
  IconPackage,
  IconReceipt2,
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
  { to: '/cobranza', label: 'Cobranza', icon: IconReceipt2, permission: 'collections.view' },
  { to: '/compras', label: 'Compras', icon: IconShoppingCart, permission: 'purchases.view' },
  { to: '/inventario', label: 'Inventario', icon: IconBuildingWarehouse, permission: 'inventory.view' },
  { to: '/reportes', label: 'Reportes', icon: IconChartBar, permission: 'reports.financial' },
  { to: '/productos', label: 'Productos', icon: IconPackage, permission: 'catalog.view' },
  { to: '/proveedores', label: 'Proveedores', icon: IconTruckDelivery, permission: 'catalog.view' },
];

// Sección de administración del sistema.
const ADMIN_NAV = [
  { to: '/admin/usuarios', label: 'Usuarios', icon: IconUserCog, permission: 'users.view' },
  { to: '/admin/roles', label: 'Roles y permisos', icon: IconShieldLock, permission: 'users.view' },
  { to: '/admin/catalogos', label: 'Catálogos', icon: IconCategory, permission: 'catalog.manage' },
  { to: '/admin/auditoria', label: 'Auditoría', icon: IconClipboardList, permission: 'audit.view' },
  { to: '/admin/sincronizacion', label: 'Sincronización móvil', icon: IconRefreshAlert, permission: 'presales.manage' },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, can, logout } = useAuth();
  const { pathname } = useLocation();

  const adminItems = ADMIN_NAV.filter((n) => can(n.permission));

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
        <AppShell.Section grow component={ScrollArea} type="scroll">
          <Stack gap={2}>
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
            {adminItems.length > 0 && <Divider my="xs" label="Administración" labelPosition="left" />}
            {adminItems.map((n) => (
              <NavLink
                key={n.to}
                component={RouterLink}
                to={n.to}
                label={n.label}
                leftSection={<n.icon size={18} stroke={1.6} />}
                active={pathname.startsWith(n.to)}
                onClick={close}
              />
            ))}
          </Stack>
        </AppShell.Section>
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
