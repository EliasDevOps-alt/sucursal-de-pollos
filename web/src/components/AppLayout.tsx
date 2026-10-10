import { AppShell, Avatar, Burger, Divider, Group, NavLink, ScrollArea, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
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
  IconPrinter,
  IconShoppingCart,
  IconTruckDelivery,
  IconRoute,
  IconBox,
  IconBuildingBank,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', color: 'blue', label: 'Inicio', icon: IconLayoutDashboard, permission: null },
  { to: '/ventas', color: 'green', label: 'Ventas', icon: IconCash, permission: 'sales.view' },
  { to: '/preventas', color: 'violet', label: 'Preventas', icon: IconDeviceMobile, permission: 'presales.view_all' },
  { to: '/clientes', color: 'cyan', label: 'Clientes', icon: IconUsers, permission: 'customers.view' },
  { to: '/cobranza', color: 'teal', label: 'Cobranza', icon: IconReceipt2, permission: 'collections.view' },
  { to: '/logistica', color: 'indigo', label: 'Logística', icon: IconRoute, permission: 'routes.view' },
  { to: '/canastillos', color: 'yellow', label: 'Canastillos', icon: IconBox, permission: 'crates.view' },
  { to: '/finanzas', color: 'lime', label: 'Finanzas', icon: IconBuildingBank, permission: 'cash.view' },
  { to: '/compras', color: 'orange', label: 'Compras', icon: IconShoppingCart, permission: 'purchases.view' },
  { to: '/inventario', color: 'grape', label: 'Inventario', icon: IconBuildingWarehouse, permission: 'inventory.view' },
  { to: '/reportes', color: 'pink', label: 'Reportes', icon: IconChartBar, permission: 'reports.view' },
  { to: '/comprobantes', color: 'gray', label: 'Comprobantes', icon: IconPrinter, permission: 'sales.view' },
  { to: '/productos', color: 'red', label: 'Productos', icon: IconPackage, permission: 'catalog.view' },
  { to: '/proveedores', color: 'blue', label: 'Proveedores', icon: IconTruckDelivery, permission: 'catalog.view' },
];

// Sección de administración del sistema.
const ADMIN_NAV = [
  { to: '/admin/usuarios', color: 'cyan', label: 'Usuarios', icon: IconUserCog, permission: 'users.view' },
  { to: '/admin/roles', color: 'violet', label: 'Roles y permisos', icon: IconShieldLock, permission: 'users.view' },
  { to: '/admin/catalogos', color: 'teal', label: 'Catálogos', icon: IconCategory, permission: 'catalog.manage' },
  { to: '/admin/auditoria', color: 'indigo', label: 'Auditoría', icon: IconClipboardList, permission: 'audit.view' },
  { to: '/admin/sincronizacion', color: 'orange', label: 'Sincronización móvil', icon: IconRefreshAlert, permission: 'presales.manage' },
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
      <AppShell.Header className="app-header">
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" color="white" />
            <Title order={4} c="white">🐔 ERP Pollos</Title>
          </Group>
          <Group gap="xs">
            <Avatar color="white" variant="filled" radius="xl" size="sm" styles={{ placeholder: { color: 'var(--mantine-color-orange-7)' } }}>
              {user?.fullName.charAt(0)}
            </Avatar>
            <div style={{ lineHeight: 1.1 }}>
              <Text size="sm" fw={600} c="white">{user?.fullName}</Text>
              <Text size="xs" c="rgba(255,255,255,0.85)">{user?.roleName}</Text>
            </div>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" className="app-navbar">
        <AppShell.Section grow component={ScrollArea} type="scroll">
          <Stack gap={2}>
            {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => (
              <NavLink
                key={n.to}
                component={RouterLink}
                to={n.to}
                label={n.label}
                leftSection={<ThemeIcon variant="light" color={n.color} size={28} radius="md"><n.icon size={17} stroke={1.8} /></ThemeIcon>}
                active={isActive(n.to)}
                color={n.color}
                className="app-nav-item"
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
                leftSection={<ThemeIcon variant="light" color={n.color} size={28} radius="md"><n.icon size={17} stroke={1.8} /></ThemeIcon>}
                active={pathname.startsWith(n.to)}
                color={n.color}
                className="app-nav-item"
                onClick={close}
              />
            ))}
          </Stack>
        </AppShell.Section>
        <UnstyledButton onClick={logout} p="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" color="red" size={28} radius="md"><IconLogout size={17} stroke={1.8} /></ThemeIcon>
            <Text size="sm">Cerrar sesión</Text>
          </Group>
        </UnstyledButton>
      </AppShell.Navbar>

      <AppShell.Main className="app-main">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
