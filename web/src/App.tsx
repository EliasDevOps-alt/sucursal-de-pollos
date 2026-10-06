import { Center, Loader } from '@mantine/core';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { LotDetailPage } from './pages/lots/LotDetailPage';
import { LotsPage } from './pages/lots/LotsPage';
import { PresaleDetailPage } from './pages/presales/PresaleDetailPage';
import { PresalesPage } from './pages/presales/PresalesPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchaseDetailPage } from './pages/purchases/PurchaseDetailPage';
import { PurchaseNewPage } from './pages/purchases/PurchaseNewPage';
import { PurchasesPage } from './pages/purchases/PurchasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SaleDetailPage } from './pages/sales/SaleDetailPage';
import { SaleNewPage } from './pages/sales/SaleNewPage';
import { SalesPage } from './pages/sales/SalesPage';
import { SuppliersPage } from './pages/SuppliersPage';

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="compras" element={<PurchasesPage />} />
        <Route path="compras/nueva" element={<PurchaseNewPage />} />
        <Route path="compras/:id" element={<PurchaseDetailPage />} />
        <Route path="ventas" element={<SalesPage />} />
        <Route path="ventas/nueva" element={<SaleNewPage />} />
        <Route path="ventas/:id" element={<SaleDetailPage />} />
        <Route path="preventas" element={<PresalesPage />} />
        <Route path="preventas/:id" element={<PresaleDetailPage />} />
        <Route path="cobranza" element={<CollectionsPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="clientes/:id" element={<CustomerDetailPage />} />
        <Route path="inventario" element={<InventoryPage />} />
        <Route path="lotes" element={<LotsPage />} />
        <Route path="lotes/:id" element={<LotDetailPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="productos" element={<ProductsPage />} />
        <Route path="proveedores" element={<SuppliersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
