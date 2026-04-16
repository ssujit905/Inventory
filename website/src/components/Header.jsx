import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu, X, Search, Home, ShoppingBag, MessageSquare, User, Settings as SettingsIcon, ChevronRight, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useCustomer } from '../context/CustomerContext';

const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { cartCount } = useCart();
    const { logout: customerLogout } = useCustomer();
    const { customer } = useCustomer();
    const { settings } = useSettings();
    const navigate = useNavigate();
    const location = useLocation();
    const storeName = settings.store_name || 'Shopy Nepal';

    const isMyOrdersPage = location.pathname.startsWith('/my-orders');
    const hideSearch = isMyOrdersPage || location.pathname.startsWith('/contact');

    useEffect(() => {
        setIsMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (isMenuOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset'; };
    }, [isMenuOpen]);

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/shop?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery('');
            setIsSearchOpen(false);
        }
    };

    return (
        <header style={{
            position: 'sticky',
            top: 0,
            backgroundColor: '#ffffff',
            zIndex: 9999,
            borderBottom: '1px solid var(--border-color)',
            paddingTop: 'var(--safe-top)'
        }}>
            <div className="container" style={{
                height: '70px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem'
            }}>
                {/* Left Side: Hamburger (Mobile) / Logo (Desktop) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <button
                        className="mobile-only"
                        onClick={() => setIsMenuOpen(true)}
                        style={{ color: 'var(--text-dark)', padding: '0.5rem', marginLeft: '-0.5rem', display: 'flex', alignItems: 'center', background: 'none', border: 'none' }}
                    >
                        <Menu size={28} strokeWidth={2.5} />
                    </button>
                    
                    <Link to="/" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        textDecoration: 'none',
                        minWidth: 'fit-content'
                    }} className="header-logo">
                        <img src="/logo.png" alt="" style={{ height: '28px', width: 'auto' }} onError={(e) => e.target.style.display = 'none'} />
                        <span style={{
                            fontSize: '1.4rem',
                            fontWeight: '800',
                            color: 'var(--primary-blue)',
                            letterSpacing: '-0.03em'
                        }}>
                            {storeName.slice(0, Math.ceil(storeName.length / 2))}
                            <span style={{ color: 'var(--primary-red)' }}>{storeName.slice(Math.ceil(storeName.length / 2))}</span>
                        </span>
                    </Link>
                </div>

                {/* Center: Desktop Navigation */}
                <div className="desktop-only" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
                    <nav>
                         <ul style={{ display: 'flex', gap: '1.5rem', listStyle: 'none', margin: 0, padding: 0 }}>
                            <li>
                                <NavLink to="/" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' })}>
                                    <Home size={18} /> Home
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/shop" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' })}>
                                    <ShoppingBag size={18} /> Shop
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/contact" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' })}>
                                    <MessageSquare size={18} /> Contact
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/my-orders" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' })}>
                                    <User size={18} /> Account
                                </NavLink>
                            </li>
                         </ul>
                    </nav>
                </div>

                {/* Right Side: Action Icons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end' }}>
                    {/* Desktop Search Toggle */}
                    {!hideSearch && (
                        <button 
                            className="desktop-only"
                            onClick={() => setIsSearchOpen(!isSearchOpen)}
                            style={{ 
                                color: isSearchOpen ? 'var(--primary-red)' : 'var(--text-dark)', 
                                width: '42px',
                                height: '42px',
                                borderRadius: '12px', 
                                display: 'flex', 
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: isSearchOpen ? 'var(--primary-red-50)' : '#f8fafc',
                                border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                minHeight: 'unset',
                                padding: 0
                            }}
                        >
                            {isSearchOpen ? <X size={20} strokeWidth={2.5} /> : <Search size={20} strokeWidth={2.5} />}
                        </button>
                    )}

                    <Link id="cart-icon" to="/cart" style={{ 
                        position: 'relative', 
                        color: 'var(--text-dark)', 
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px', 
                        display: 'flex', 
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s', 
                        background: '#f8fafc', 
                        border: '1px solid var(--border-color)',
                        padding: 0
                    }}>
                        <ShoppingCart size={20} strokeWidth={2.5} />
                        {cartCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                backgroundColor: 'var(--primary-red)',
                                color: 'white',
                                fontSize: '0.65rem',
                                fontWeight: '900',
                                height: '18px',
                                width: '18px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid white',
                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)'
                            }}>
                                {cartCount}
                            </span>
                        )}
                    </Link>
                    {customer && (
                            <button 
                                className="desktop-only hover-scale"
                                onClick={() => {
                                    customerLogout();
                                    navigate('/');
                                }}
                                title="Sign Out"
                                style={{ 
                                    color: '#ef4444', 
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '12px', 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s', 
                                    background: '#fef2f2', 
                                    border: '1px solid #fecaca',
                                    cursor: 'pointer',
                                    minHeight: 'unset',
                                    padding: 0
                                }}
                            >
                                <LogOut size={20} strokeWidth={2.5} />
                            </button>
                    )}
                </div>
            </div>

            {/* Desktop Transition Search Bar */}
            {!hideSearch && isSearchOpen && (
                <div className="desktop-only animate-slide-down" 
                     style={{ 
                        backgroundColor: '#ffffff', 
                        borderBottom: '1px solid var(--border-color)', 
                        padding: '1.5rem 0',
                        position: 'absolute',
                        top: '70px',
                        left: 0,
                        right: 0,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                     }}>
                    <div className="container">
                        <form onSubmit={handleSearch} style={{ position: 'relative', maxWidth: '800px', margin: '0 auto' }}>
                            <Search 
                                size={20} 
                                style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-gray)' }} 
                            />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="What are you looking for?"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        padding: '1.2rem 1.5rem 1.2rem 3.5rem',
                                        borderRadius: '16px',
                                        border: '2px solid var(--primary-red)',
                                        background: '#f8fafc',
                                        fontSize: '1.1rem',
                                        fontWeight: '600',
                                        width: '100%',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)'
                                    }}
                                />
                            <button 
                                type="submit"
                                style={{ 
                                    position: 'absolute', 
                                    right: '10px', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)',
                                    backgroundColor: 'var(--primary-blue)',
                                    color: 'white',
                                    padding: '0.6rem 1.5rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                Search Now
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Premium Mobile Search Bar (Only shown on mobile) */}
            {!hideSearch && (
                <div className="mobile-only" style={{ padding: '0 1.25rem 1rem' }}>
                    <form onSubmit={handleSearch} style={{ position: 'relative' }}>
                        <div style={{
                            position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-gray)', pointerEvents: 'none'
                        }}>
                            <Search size={18} />
                        </div>
                        <input
                            type="text"
                            placeholder="Find your style..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                padding: '0.85rem 1rem 0.85rem 2.8rem',
                                borderRadius: '100px',
                                border: '1px solid var(--primary-red)',
                                background: '#f8fafc',
                                fontSize: '0.95rem',
                                fontWeight: '500',
                                width: '100%',
                                outline: 'none'
                            }}
                        />
                    </form>
                </div>
            )}
            <style>{`
                @media (max-width: 768px) {
                    .header-logo {
                        position: absolute;
                        left: 50%;
                        transform: translateX(-50%);
                    }
                }
            `}</style>

            {/* Glassmorphism Drawer Menu */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                visibility: isMenuOpen ? 'visible' : 'hidden',
                pointerEvents: isMenuOpen ? 'auto' : 'none',
                transition: 'visibility 0.3s'
            }}>
                {/* Backdrop */}
                <div 
                    onClick={() => setIsMenuOpen(false)}
                    style={{
                        position: 'absolute', inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.4)',
                        opacity: isMenuOpen ? 1 : 0,
                        transition: 'opacity 0.3s'
                    }} 
                />
                
                {/* Drawer Content */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: '85%', maxWidth: '340px',
                    backgroundColor: '#ffffff',
                    boxShadow: '20px 0 50px rgba(0,0,0,0.1)',
                    transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex', flexDirection: 'column',
                    padding: '1.5rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                         <span style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--primary-blue)' }}>Menu</span>
                         <button onClick={() => setIsMenuOpen(false)} style={{ background: '#f1f5f9', borderRadius: '50%', padding: '8px' }}>
                            <X size={24} />
                         </button>
                    </div>

                    <nav style={{ flex: 1 }}>
                        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: 0 }}>
                            <DrawerLink to="/" icon={<Home size={20} />} label="Home" onClick={() => setIsMenuOpen(false)} />
                            <DrawerLink to="/shop" icon={<ShoppingBag size={20} />} label="Shop All" onClick={() => setIsMenuOpen(false)} />
                            <DrawerLink to="/my-orders" icon={<User size={20} />} label="My Account" onClick={() => setIsMenuOpen(false)} />
                            <DrawerLink to="/contact" icon={<MessageSquare size={20} />} label="Contact & Support" onClick={() => setIsMenuOpen(false)} />
                        </ul>
                    </nav>

                    {customer && (
                        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                            <button 
                                onClick={() => {
                                    customerLogout();
                                    navigate('/');
                                    setIsMenuOpen(false);
                                }}
                                style={{
                                    width: '100%', padding: '1rem', borderRadius: '12px',
                                    background: '#fef2f2', color: '#ef4444', fontWeight: '800',
                                    textAlign: 'center', cursor: 'pointer'
                                }}
                            >
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

const DrawerLink = ({ to, icon, label, onClick }) => (
    <li>
        <NavLink 
            to={to} 
            onClick={onClick}
            style={({isActive}) => ({
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '1rem 1.25rem', borderRadius: '16px',
                textDecoration: 'none',
                background: isActive ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                color: isActive ? 'var(--primary-red)' : 'var(--text-dark)',
                fontWeight: '700', fontSize: '1.05rem',
                transition: 'all 0.2s'
            })}
        >
            <span style={{ opacity: 0.8 }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            <ChevronRight size={18} strokeWidth={3} opacity={0.3} />
        </NavLink>
    </li>
);

export default Header;
