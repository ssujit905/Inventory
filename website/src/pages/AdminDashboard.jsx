import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductContext';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Package,
    ShoppingBag,
    Users,
    TrendingUp,
    Plus,
    Edit,
    Trash2,
    LogOut,
    Eye,
    X,
    Settings
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';

const AdminDashboard = () => {
    const { user, logout } = useAuth();
    const { products, addProduct, deleteProduct } = useProducts();
    const navigate = useNavigate();

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newProduct, setNewProduct] = useState({
        title: '',
        price: '',
        category: '',
        description: '',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=800',
        stock: ''
    });

    const handleAddProduct = (e) => {
        e.preventDefault();
        addProduct({
            ...newProduct,
            price: Number(newProduct.price),
            stock: Number(newProduct.stock)
        });
        setIsModalOpen(false);
        setNewProduct({
            title: '', price: '', category: '', description: '',
            image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=800',
            stock: ''
        });
    };

    const { settings, saveSetting } = useSettings();
    const [currentTab, setCurrentTab] = useState('products'); // 'products' or 'settings'

    const handleToggleFlashSale = async () => {
        const newValue = settings.flash_sale_enabled === 'true' ? 'false' : 'true';
        await saveSetting('flash_sale_enabled', newValue);
    };

    const stats = [
        { label: 'Total Products', value: products.length, icon: <Package size={20} />, color: '#3b82f6' },
        { label: 'Total Sales', value: 'Rs. 54,200', icon: <TrendingUp size={20} />, color: '#22c55e' },
        { label: 'Pending Orders', value: '12', icon: <ShoppingBag size={20} />, color: '#f59e0b' },
        { label: 'Active Users', value: '1,240', icon: <Users size={20} />, color: '#8b5cf6' }
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
            {/* Sidebar */}
            <aside style={{ width: '260px', backgroundColor: '#0f172a', color: 'white', padding: '1.5rem', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh' }}>
                <div style={{ marginBottom: '2.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '900', letterSpacing: '-0.02em' }}>
                        SHOPY<span style={{ color: 'var(--primary-red)' }}>ADMIN</span>
                    </h2>
                </div>

                <nav style={{ flex: 1 }}>
                    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <li 
                            style={{ 
                                padding: '0.75rem 1rem', 
                                backgroundColor: '#1e293b', 
                                borderRadius: '0.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                cursor: 'pointer',
                                color: 'white'
                            }}
                        >
                            <LayoutDashboard size={20} /> <span>Dashboard</span>
                        </li>
                    </ul>
                </nav>

                <button
                    onClick={logout}
                    style={{ marginTop: 'auto', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #334155', backgroundColor: 'transparent', color: 'white', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                >
                    <LogOut size={20} /> <span>Logout</span>
                </button>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: '2rem', marginLeft: '260px' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>Control Center</h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Welcome back, managing Shopy Nepal today.</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="btn btn-primary"
                        style={{ width: 'auto', display: 'flex', gap: '8px', padding: '0.6rem 1.2rem', cursor: 'pointer' }}
                    >
                        <Plus size={20} /> Add New Product
                    </button>
                </header>

                {/* Website Configuration Panel (Flash Sale) */}
                <div style={{ backgroundColor: '#fff', padding: '1.25rem', borderRadius: '1rem', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ backgroundColor: '#fff7ed', padding: '10px', borderRadius: '12px' }}>
                                <Settings size={24} color="#f97316" />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0 }}>Flash Sale Mode</h3>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Instantly show/hide the Flash Sale section on the website home page.</p>
                            </div>
                        </div>
                        <div 
                            onClick={handleToggleFlashSale}
                            style={{ 
                                width: '52px', 
                                height: '28px', 
                                backgroundColor: settings.flash_sale_enabled === 'true' ? '#22c55e' : '#cbd5e1',
                                borderRadius: '24px',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'all 0.3s'
                            }}
                        >
                            <div style={{ 
                                width: '22px', 
                                height: '22px', 
                                backgroundColor: 'white', 
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '3px',
                                left: settings.flash_sale_enabled === 'true' ? '27px' : '3px',
                                transition: 'all 0.3s',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                            }} />
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                    {stats.map((stat, idx) => (
                        <div key={idx} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <div style={{ color: stat.color, marginBottom: '10px' }}>{stat.icon}</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>{stat.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginTop: '4px' }}>{stat.value}</div>
                        </div>
                    ))}
                </div>

                {/* Product Management Table */}
                <div style={{ backgroundColor: 'white', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Manage Inventory</h3>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>Product</th>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>Category</th>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>Price</th>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>Stock</th>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#64748b', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(product => (
                                <tr key={product.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <img src={product.image} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                                            <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem', fontWeight: '600' }}>{product.title}</div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.9rem', color: '#64748b' }}>{product.category}</td>
                                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.9rem', fontWeight: '600' }}>Rs. {product.price}</td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <span style={{
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700',
                                            backgroundColor: (product.stock < 10) ? '#fee2e2' : '#f0fdf4',
                                            color: (product.stock < 10) ? '#dc2626' : '#16a34a'
                                        }}>
                                            {product.stock} left
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => navigate(`/product/${product.id}`)}
                                                style={{ padding: '6px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
                                            ><Eye size={18} /></button>
                                            <button
                                                onClick={() => deleteProduct(product.id)}
                                                style={{ padding: '6px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                                            ><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* Add Product Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '1rem', width: '100%', maxWidth: '500px', padding: '2rem', position: 'relative' }}>
                        <button
                            onClick={() => setIsModalOpen(false)}
                            style={{ position: 'absolute', top: '1rem', right: '1rem', border: 'none', background: 'none', cursor: 'pointer' }}
                        >
                            <X size={24} color="#64748b" />
                        </button>

                        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>Add New Product</h2>

                        <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }}>Product Title</label>
                                <input
                                    type="text" required
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                                    value={newProduct.title}
                                    onChange={e => setNewProduct({ ...newProduct, title: e.target.value })}
                                    placeholder="Enter product title..."
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }}>Price (Rs.)</label>
                                    <input
                                        type="number" required
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                                        value={newProduct.price}
                                        onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }}>Stock</label>
                                    <input
                                        type="number" required
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                                        value={newProduct.stock}
                                        onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }}>Category</label>
                                <select
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                                    value={newProduct.category}
                                    onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                                    required
                                >
                                    <option value="">Select Category</option>
                                    <option value="Electronics">Electronics</option>
                                    <option value="Apparel">Apparel</option>
                                    <option value="Accessories">Accessories</option>
                                    <option value="Lifestyle">Lifestyle</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }}>Description</label>
                                <textarea
                                    required rows="3"
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                                    value={newProduct.description}
                                    onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', padding: '0.8rem' }}>
                                Confirm & Add Product
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
