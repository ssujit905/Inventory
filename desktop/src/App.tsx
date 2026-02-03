import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import StockInPage from './pages/StockInPage';
import InventoryPage from './pages/InventoryPage';
import ExpensesPage from './pages/ExpensesPage';
import SalesPage from './pages/SalesPage';
import ReportsPage from './pages/ReportsPage';
import StaffManagementPage from './pages/StaffManagementPage';
import { useAuthStore } from './hooks/useAuthStore';
import { useEffect } from 'react';

function App() {
  const { user, profile, initialize, loading } = useAuthStore();

  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">Initializing application...</p>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={
          !user ? <LoginPage /> : (
            profile?.role === 'admin'
              ? <Navigate to="/admin/dashboard" replace />
              : <Navigate to="/staff/dashboard" replace />
          )
        } />

        <Route path="/admin/dashboard" element={
          user && profile?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/stock-in" element={
          user && profile?.role === 'admin' ? <StockInPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/inventory" element={
          user && profile?.role === 'admin' ? <InventoryPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/expenses" element={
          user && profile?.role === 'admin' ? <ExpensesPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/sales" element={
          user && profile?.role === 'admin' ? <SalesPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/reports" element={
          user && profile?.role === 'admin' ? <ReportsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/users" element={
          user && profile?.role === 'admin' ? <StaffManagementPage /> : <Navigate to="/" replace />
        } />

        <Route path="/staff/dashboard" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
