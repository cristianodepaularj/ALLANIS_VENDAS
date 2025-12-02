import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { Products } from './pages/Products';
import { Stock } from './pages/Stock';
import { Sales } from './pages/Sales';
import { Installments } from './pages/Installments';
import { CashFlow } from './pages/CashFlow';
import { SalesHistory } from './pages/SalesHistory';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<Clients />} />
              <Route path="products" element={<Products />} />
              <Route path="stock" element={<Stock />} />
              <Route path="sales" element={<Sales />} />
              <Route path="installments" element={<Installments />} />
              <Route path="installments" element={<Installments />} />
              <Route path="cash-flow" element={<CashFlow />} />
              <Route path="sales-history" element={<SalesHistory />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
