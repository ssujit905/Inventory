import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import AIStoreDoctor from '../components/AIStoreDoctor';

export default function AIStoreDoctorPage() {
    const { profile } = useAuthStore();

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto pb-12">
                <AIStoreDoctor />
            </div>
        </DashboardLayout>
    );
}
