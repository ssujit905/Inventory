import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import AIStoreDoctor from '../components/AIStoreDoctor';

export default function AIStoreDoctorPage() {
    const { profile } = useAuthStore();

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="w-full px-4 pt-4 pb-8">
                <AIStoreDoctor />
            </div>
        </DashboardLayout>
    );
}
