import { lazy, Suspense, useEffect } from 'react';
import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from './hooks/useAuthStore';
import { getVendorId } from './lib/vendorHelpers';

// Eager: always needed on first paint
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';

// Lazy: loaded on demand when the route is first visited
const StockInPage             = lazy(() => import('./pages/StockInPage'));
const InventoryPage           = lazy(() => import('./pages/InventoryPage'));
const ExpensesPage            = lazy(() => import('./pages/ExpensesPage'));
const SalesPage               = lazy(() => import('./pages/SalesPage'));
const ReportsPage             = lazy(() => import('./pages/ReportsPage'));
const StaffManagementPage     = lazy(() => import('./pages/StaffManagementPage'));
const VendorStaffManagementPage = lazy(() => import('./pages/VendorStaffManagementPage'));
const IncomePage              = lazy(() => import('./pages/IncomePage'));
const ProfitPage              = lazy(() => import('./pages/ProfitPage'));
const PrintCenter             = lazy(() => import('./pages/PrintCenter'));
const ChatbotPage             = lazy(() => import('./pages/ChatbotPage'));
const WebsiteOrdersPage       = lazy(() => import('./pages/WebsiteOrdersPage'));
const WebsiteProductsPage     = lazy(() => import('./pages/WebsiteProductsPage'));
const WebsiteReturnsPage      = lazy(() => import('./pages/WebsiteReturnsPage'));
const WebsiteNotifyPage       = lazy(() => import('./pages/WebsiteNotifyPage'));
const WebsiteDeliveryPage     = lazy(() => import('./pages/WebsiteDeliveryPage'));
const WebsiteSettingsPage     = lazy(() => import('./pages/WebsiteSettingsPage'));
const WebsiteReportsPage      = lazy(() => import('./pages/WebsiteReportsPage'));
const WebsiteCustomersPage    = lazy(() => import('./pages/WebsiteCustomersPage'));
const AIStoreDoctorPage       = lazy(() => import('./pages/AIStoreDoctorPage'));

// Minimal spinner shown while a lazy page chunk loads
const PageFallback = () => (
  <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);


function App() {
  const { user, profile, initialize, loading } = useAuthStore();
  // localStorage so the last screen survives an Android process kill
  // (sessionStorage is wiped with the WebView).
  const rawPersistedPath = (() => {
    try {
      return localStorage.getItem('mobile_last_path') || '/';
    } catch {
      return '/';
    }
  })();
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
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[persistedPath]}>
      <Suspense fallback={<PageFallback />}>
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
          user ? <IncomePage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/profit" element={
          user && (profile?.role === 'admin' || profile?.role === 'vendor') ? <ProfitPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/sales" element={
          user ? <SalesPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/print" element={
          user ? <PrintCenter /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/orders" element={
          user ? <WebsiteOrdersPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/products" element={
          user && (profile?.role === 'admin' || profile?.role === 'vendor' || (profile?.role === 'staff' && !!profile?.vendor_id)) ? <WebsiteProductsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/returns" element={
          user ? <WebsiteReturnsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/notify" element={
          user ? <WebsiteNotifyPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/delivery" element={
          user ? <WebsiteDeliveryPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/settings" element={
          user && (profile?.role === 'admin' || profile?.role === 'vendor') ? <WebsiteSettingsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/reports" element={
          user && (profile?.role === 'admin' || profile?.role === 'staff' || profile?.role === 'vendor') ? <WebsiteReportsPage /> : <Navigate to="/" replace />
        } />
        <Route path="/admin/ai-store-doctor" element={
          user && profile?.role === 'admin' ? <AIStoreDoctorPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/chatbot" element={
          user && profile?.role === 'admin' ? <ChatbotPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/website/customers" element={
          user && profile?.role === 'admin' ? <WebsiteCustomersPage /> : <Navigate to="/" replace />
        } />


        <Route path="/admin/reports" element={
          user && (profile?.role === 'admin' || profile?.role === 'vendor') ? <ReportsPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/users" element={
          user && profile?.role === 'admin' ? <StaffManagementPage /> : <Navigate to="/" replace />
        } />

        <Route path="/admin/vendor-staff" element={
          user && profile?.role === 'vendor' ? <VendorStaffManagementPage /> : <Navigate to="/" replace />
        } />

        <Route path="/staff/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="*" element={<Navigate to={user ? "/admin/dashboard" : "/"} replace />} />
      </Routes>
      </Suspense>
    </Router>
  )
}

export default App
