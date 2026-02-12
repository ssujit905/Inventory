import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../hooks/useAuthStore';
import { LogIn, Mail, Lock, AlertCircle, Package } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { initialize } = useAuthStore();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) throw signInError;
            await initialize();
        } catch (err: any) {
            setError(err.message || 'Failed to sign in');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Brand Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="h-12 w-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20 mb-4">
                        <Package size={24} strokeWidth={2.5} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-jakarta tracking-tight">InvPro</h1>
                    <p className="text-gray-400 text-sm font-medium mt-1">Enterprise Inventory Systems</p>
                </div>

                {/* Login Card */}
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-8 shadow-sm">
                    <div className="mb-8">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Welcome Back</h2>
                        <p className="text-gray-400 text-xs font-medium mt-1">Securely login to your workstation.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        {error && (
                            <div className="p-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-xl flex items-center gap-3 text-rose-600">
                                <AlertCircle size={18} strokeWidth={1.5} />
                                <p className="text-xs font-semibold">{error}</p>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Work Email</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                        <Mail size={16} strokeWidth={1.5} />
                                    </div>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        placeholder="name@company.com"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Security Key</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                        <Lock size={16} strokeWidth={1.5} />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-[0.98]"
                        >
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <LogIn size={18} strokeWidth={1.5} />
                                    Authenticate
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center mt-8 text-gray-400 text-[10px] font-medium uppercase tracking-widest">
                    Authorized Access Only • System ID: {Math.random().toString(36).substring(7).toUpperCase()}
                </p>
            </div>
        </div>
    );
}
