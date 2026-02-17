import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import StockInPage from './pages/StockInPage';
import InventoryPage from './pages/InventoryPage';
import ExpensesPage from './pages/ExpensesPage';
import SalesPage from './pages/SalesPage';
import ReportsPage from './pages/ReportsPage';
import StaffManagementPage from './pages/StaffManagementPage';
import IncomePage from './pages/IncomePage';
import ProfitPage from './pages/ProfitPage';
import { useAuthStore } from './hooks/useAuthStore';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

function App() {
  const { user, profile, initialize, loading } = useAuthStore();
  const rawPersistedPath = sessionStorage.getItem('desktop_last_path') || '/';
  const persistedPath = rawPersistedPath === '/admin/search' ? '/admin/dashboard' : rawPersistedPath;

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

  // Check for missing Supabase config
  const isSupabaseConfigured = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!isSupabaseConfigured) {
    return (
      <div className="flex h-screen items-center justify-center bg-rose-50 dark:bg-gray-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 border-2 border-rose-200 dark:border-rose-900/30 rounded-[2rem] p-8 text-center shadow-2xl">
          <div className="h-20 w-20 bg-rose-100 dark:bg-rose-900/20 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={40} />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight mb-2">Configuration Missing</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-8">
            The application is missing the required Supabase environment variables. Please check your <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono text-rose-500">.env</code> file.
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 text-left space-y-2 mb-8 border border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Required Keys:</p>
            <p className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all">• VITE_SUPABASE_URL</p>
            <p className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all">• VITE_SUPABASE_ANON_KEY</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Router initialEntries={[persistedPath]}>
      <Routes>
        <Route path="/" element={
          !user ? <LoginPage /> : <Navigate to="/admin/dashboard" replace />
        } />

        <Route path="/admin/dashboard" element={
          user ? <AdminDashboard /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/stock-in" element={
          user ? <StockInPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/inventory" element={
          user ? <InventoryPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/expenses" element={
          user ? <ExpensesPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/income" element={
          user && profile?.role === 'admin' ? <IncomePage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/profit" element={
          user && profile?.role === 'admin' ? <ProfitPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/sales" element={
          user ? <SalesPage /> : <Navigate to="/" replace />
        } />


        <Route path="/admin/reports" element={
          user && profile?.role === 'admin' ? <ReportsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/users" element={
          user && profile?.role === 'admin' ? <StaffManagementPage /> : <Navigate to="/" replace />
        } />


        <Route path="/staff/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="*" element={<Navigate to={user ? "/admin/dashboard" : "/"} replace />} />
      </Routes>
    </Router>
  )
}

export default App
