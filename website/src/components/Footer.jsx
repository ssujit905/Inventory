import { Link } from 'react-router-dom';
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin, Youtube, ExternalLink } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

const Footer = () => {
    const { settings } = useSettings();

    const storeName = settings.store_name || 'Shopy Nepal';
    const nameParts = storeName.split(' ');
    const firstPart = nameParts[0];
    const restPart = nameParts.slice(1).join(' ');
    
    return (
        <footer style={{ 
            background: '#0f172a', 
            color: '#f8fafc', 
            padding: '4rem 1rem 2rem', 
            borderTop: '1px solid rgba(255,255,255,0.05)',
            marginTop: 'auto'
        }}>
            <div className="container footer-grid">
                

                {/* Brand Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '950', color: 'white', letterSpacing: '-0.02em' }}>
                        {firstPart} {restPart && <span style={{ color: 'var(--primary-red)' }}>{restPart}</span>}
                        <span style={{ color: 'var(--primary-red)' }}>.</span>
                    </h2>
                    <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#94a3b8', maxWidth: '300px' }}>
                        {settings.store_tagline || 'Experience the best shopping in Nepal. Quality, trust, and speed.'}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <SocialIcon href={settings.facebook_url} icon={<Facebook size={18} />} />
                        <SocialIcon href={settings.instagram_url} icon={<Instagram size={18} />} />
                        <SocialIcon href={settings.twitter_url} icon={<Twitter size={18} />} />
                    </div>
                </div>

                {/* Quick Links */}
                <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: '900', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>Shop Now</h3>
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
                        <FooterLink to="/shop" label="All Products" />
                        <FooterLink to="/shop?cat=New Arrivals" label="New Arrivals" />
                        <FooterLink to="/shop?cat=Best Sellers" label="Best Sellers" />
                        <FooterLink to="/contact" label="Store Locator" />
                    </ul>
                </div>

                {/* Account & Support */}
                <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: '900', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>Account</h3>
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
                        <FooterLink to="/my-orders" label="Track Order" />
                        <FooterLink to="/cart" label="Shopping Cart" />
                        <FooterLink to="/my-orders?tab=settings" label="Profile Settings" />
                        <FooterLink to="/contact" label="Help Center" />
                    </ul>
                </div>

                {/* Contact Section */}
                <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: '900', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>Get in Touch</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <ContactItem icon={<Phone size={16} />} text={settings.store_phone || '+977 1-4XXXXXX'} />
                        <ContactItem icon={<Mail size={16} />} text={settings.store_email || 'support@shopynepal.com'} />
                        <ContactItem icon={<MapPin size={16} />} text={settings.store_address || 'Kathmandu, Nepal'} />
                    </div>
                </div>

            </div>

            <div className="container footer-bottom" style={{ 
                borderTop: '1px solid rgba(255,255,255,0.05)', 
                marginTop: '4rem', 
                paddingTop: '2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                alignItems: 'center',
                textAlign: 'center'
            }}>
                <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                    &copy; {new Date().getFullYear()} {storeName}. Built for the modern shopper.
                </p>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>
                    <span style={{ cursor: 'pointer' }}>Privacy Policy</span>
                    <span style={{ cursor: 'pointer' }}>Terms of Service</span>
                </div>
            </div>

            <style>{`
                .footer-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 2.5rem;
                }
                .footer-grid > div:first-child,
                .footer-grid > div:last-child {
                    grid-column: span 2;
                }
                @media (min-width: 640px) {
                    .footer-grid { 
                        gap: 3rem;
                    }
                }
                @media (min-width: 992px) {
                    .footer-grid { 
                        grid-template-columns: 1.5fr 1fr 1fr 1fr; 
                    }
                    .footer-grid > div:first-child,
                    .footer-grid > div:last-child {
                        grid-column: span 1;
                    }
                    .footer-bottom { 
                        flex-direction: row !important; 
                        justify-content: space-between !important;
                        text-align: left !important;
                    }
                }
            `}</style>
        </footer>
    );
};

const SocialIcon = ({ href, icon }) => (
    <a 
        href={href || '#'} 
        target="_blank" 
        rel="noreferrer"
        style={{ 
            width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
            transition: 'all 0.3s ease'
        }}
        onMouseOver={e => { e.currentTarget.style.background = 'var(--primary-red)'; e.currentTarget.style.color = 'white'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
    >
        {icon}
    </a>
);

const FooterLink = ({ to, label }) => (
    <li>
        <Link 
            to={to} 
            style={{ 
                color: '#94a3b8', 
                textDecoration: 'none', 
                fontSize: '0.9rem', 
                fontWeight: '600',
                transition: 'all 0.2s ease',
                padding: '4px 0',
                display: 'inline-block'
            }}
            onMouseOver={e => e.currentTarget.style.color = 'white'}
            onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
        >
            {label}
        </Link>
    </li>
);

const ContactItem = ({ icon, text }) => (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600' }}>
        <span style={{ color: 'var(--primary-red)' }}>{icon}</span>
        <span>{text}</span>
    </div>
);

export default Footer;
