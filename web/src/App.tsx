import { Center, Loader } from '@mantine/core';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { LotDetailPage } from './pages/lots/LotDetailPage';
import { LotsPage } from './pages/lots/LotsPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchaseDetailPage } from './pages/purchases/PurchaseDetailPage';
import { PurchaseNewPage } from './pages/purchases/PurchaseNewPage';
import { PurchasesPage } from './pages/purchases/PurchasesPage';
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
        <Route path="lotes" element={<LotsPage />} />
        <Route path="lotes/:id" element={<LotDetailPage />} />
        <Route path="productos" element={<ProductsPage />} />
        <Route path="proveedores" element={<SuppliersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
