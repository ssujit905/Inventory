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
                {/* Left Side: Hamburger (Mobile) & Logo (Desktop) */}
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '1rem' }}>
                    <div className="mobile-only">
                        <button
                            onClick={() => setIsMenuOpen(true)}
                            style={{ color: 'var(--text-dark)', padding: '0.5rem', background: 'none', border: 'none' }}
                        >
                            <Menu size={28} strokeWidth={2.5} />
                        </button>
                    </div>
                    
                    {/* Desktop Logo */}
                    <Link to="/" className="desktop-only" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        textDecoration: 'none',
                    }}>
                        <img src="/logo.png" alt="" style={{ height: '32px', width: 'auto' }} onError={(e) => e.target.style.display = 'none'} />
                        <span style={{
                            fontSize: '1.5rem',
                            fontWeight: '900',
                            color: 'var(--primary-blue)',
                            letterSpacing: '-0.04em',
                            whiteSpace: 'nowrap'
                        }}>
                            {storeName.slice(0, Math.ceil(storeName.length / 2))}
                            <span style={{ color: 'var(--primary-red)' }}>{storeName.slice(Math.ceil(storeName.length / 2))}</span>
                        </span>
                    </Link>
                </div>

                {/* Center: Logo (Mobile ONLY) */}
                <div className="mobile-only" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 3 }}>
                    <Link to="/" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        minWidth: 'fit-content'
                    }}>
                        <img src="/logo.png" alt="" style={{ height: '22px', width: 'auto' }} onError={(e) => e.target.style.display = 'none'} />
                        <span style={{
                            fontSize: '1.15rem',
                            fontWeight: '900',
                            color: 'var(--primary-blue)',
                            letterSpacing: '-0.03em'
                        }}>
                            {storeName.slice(0, Math.ceil(storeName.length / 2))}
                            <span style={{ color: 'var(--primary-red)' }}>{storeName.slice(Math.ceil(storeName.length / 2))}</span>
                        </span>
                    </Link>
                </div>

                {/* Right Side: Action Icons */}
                <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end' }}>
                    {/* Desktop Search Toggle */}
                    {!hideSearch && (
                        <button 
                            className="desktop-only hover-scale action-btn"
                            onClick={() => setIsSearchOpen(!isSearchOpen)}
                            style={{ 
                                color: isSearchOpen ? 'var(--primary-red)' : 'var(--text-dark)', 
                                background: isSearchOpen ? 'var(--primary-red-50)' : '#f8fafc',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            {isSearchOpen ? <X size={20} strokeWidth={2.5} /> : <Search size={20} strokeWidth={2.5} />}
                        </button>
                    )}

                    {/* Settings Icon */}
                    {customer && isMyOrdersPage && (
                        <button
                            className="action-btn hover-scale"
                            onClick={() => window.dispatchEvent(new CustomEvent('open-change-pin-modal'))}
                            style={{
                                color: 'var(--primary-blue)',
                                background: '#f8fafc',
                                border: '1px solid var(--border-color)',
                                boxSizing: 'border-box'
                            }}
                        >
                            <SettingsIcon size={20} strokeWidth={2.5} style={{ display: 'block' }} />
                        </button>
                    )}

                    <Link id="cart-icon" to="/cart" className="action-btn hover-scale" style={{ 
                        color: 'var(--text-dark)', 
                        background: '#f8fafc', 
                        border: '1px solid var(--border-color)',
                        boxSizing: 'border-box'
                    }}>
                        <ShoppingCart size={20} strokeWidth={2.5} style={{ display: 'block' }} />
                        {cartCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-5px',
                                right: '-5px',
                                backgroundColor: 'var(--primary-red)',
                                color: 'white',
                                fontSize: '0.6rem',
                                fontWeight: '900',
                                height: '18px',
                                width: '18px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid white',
                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)'
                            }}>
                                {cartCount}
                            </span>
                        )}
                    </Link>

                    {customer && (
                        <button 
                            className="desktop-only hover-scale action-btn"
                            onClick={() => {
                                customerLogout();
                                navigate('/');
                            }}
                            style={{ 
                                color: '#ef4444', 
                                background: '#fef2f2', 
                                border: '1px solid #fecaca',
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
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        zIndex: 9998
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
                                placeholder="Search products, brands and categories..."
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
                                    outline: 'none'
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

            {/* Desktop Center Navigation (Floating below) */}
            <div className="desktop-only" style={{ 
                borderTop: '1px solid var(--border-color)', 
                backgroundColor: '#f8fafc' 
            }}>
                <div className="container" style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0' }}>
                    <nav>
                        <ul style={{ display: 'flex', gap: '2.5rem', listStyle: 'none', margin: 0, padding: 0 }}>
                            <li>
                                <NavLink to="/" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' })}>
                                    <Home size={18} /> Home
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/shop" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' })}>
                                    <ShoppingBag size={18} /> Shop
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/contact" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' })}>
                                    <MessageSquare size={18} /> Contact
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/my-orders" style={({isActive}) => ({ color: isActive ? 'var(--primary-red)' : 'var(--text-dark)', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' })}>
                                    <User size={18} /> Account
                                </NavLink>
                            </li>
                        </ul>
                    </nav>
                </div>
            </div>

            {/* Mobile Search Bar */}
            {!hideSearch && (
                <div className="mobile-only" style={{ padding: '0 0.75rem 1rem' }}>
                    <form onSubmit={handleSearch} style={{ position: 'relative', width: '100%' }}>
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
                /* Reset ALL browser defaults for any element using action-btn */
                button.action-btn,
                a.action-btn {
                    box-sizing: border-box !important;
                    -webkit-appearance: none !important;
                    appearance: none !important;
                    outline: none !important;
                    font-family: inherit !important;
                    line-height: 1 !important;
                    flex-shrink: 0 !important;
                }
                .action-btn {
                    width: 40px !important;
                    min-width: 40px !important;
                    height: 40px !important;
                    min-height: 40px !important;
                    border-radius: 10px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    cursor: pointer !important;
                    transition: all 0.2s !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    position: relative !important;
                    text-decoration: none !important;
                    vertical-align: middle !important;
                }
                .action-btn svg {
                    display: block !important;
                    flex-shrink: 0 !important;
                }
                .desktop-only {
                    display: flex !important;
                }
                .mobile-only {
                    display: none !important;
                }
                @media (max-width: 768px) {
                    .desktop-only {
                        display: none !important;
                    }
                    .mobile-only {
                        display: flex !important;
                    }
                    .action-btn {
                        width: 38px !important;
                        min-width: 38px !important;
                        height: 38px !important;
                        min-height: 38px !important;
                        border-radius: 10px !important;
                    }
                    .header-logo span {
                        font-size: 1.1rem !important;
                    }
                    .header-logo img {
                        height: 22px !important;
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
