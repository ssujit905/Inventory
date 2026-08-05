import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import StockInPage from './pages/StockInPage';
import InventoryPage from './pages/InventoryPage';
import WebsiteOrdersPage from './pages/WebsiteOrdersPage';
import WebsiteProductsPage from './pages/WebsiteProductsPage';
import WebsiteReturnsPage from './pages/WebsiteReturnsPage';
import WebsiteDeliveryPage from './pages/WebsiteDeliveryPage';
import VendorSettingsPage from './pages/VendorSettingsPage';
import { useAuthStore } from './hooks/useAuthStore';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

function App() {
  const { user, profile, initialize, loading } = useAuthStore();
  const rawPersistedPath = sessionStorage.getItem('vendor_last_path') || '/admin/inventory';
  const persistedPath = rawPersistedPath === '/' || rawPersistedPath === '/admin/dashboard' ? '/admin/inventory' : rawPersistedPath;

  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">Initializing Shopy Nepal Vendor Portal...</p>
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
            The application is missing required environment variables. Please check your <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono text-rose-500">.env</code> file.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[persistedPath]}>
      <Routes>
        <Route path="/" element={
          !user ? <LoginPage /> : <Navigate to="/admin/inventory" replace />
        } />

        <Route path="/admin/inventory" element={
          user ? <InventoryPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/stock-in" element={
          user ? <StockInPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/products" element={
          user ? <WebsiteProductsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/orders" element={
          user ? <WebsiteOrdersPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/returns" element={
          user ? <WebsiteReturnsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/delivery" element={
          user ? <WebsiteDeliveryPage /> : <Navigate to="/" replace />
        } />

        <Route path="/vendor/settings" element={
          user ? <VendorSettingsPage /> : <Navigate to="/" replace />
        } />

        <Route path="*" element={<Navigate to={user ? "/admin/inventory" : "/"} replace />} />
      </Routes>
    </Router>
  )
}

export default App
