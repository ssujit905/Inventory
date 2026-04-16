import { Mail, Phone, MapPin, Send, Plus, Minus, MessageCircle, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { useState } from 'react';

const Contact = () => {
    const [openFaq, setOpenFaq] = useState(0);

    const faqs = [
        {
            q: "How long does shipping take?",
            a: "For orders within Kathmandu Valley, we deliver within 24-48 hours. For standard shipping across Nepal, it typically takes 3-5 business days."
        },
        {
            q: "What is your return policy?",
            a: "We offer a strict 2-day (48 hours) return and exchange policy from the date of delivery. After 48 hours, requests cannot be processed."
        },
        {
            q: "Do you offer Cash on Delivery?",
            a: "Yes, we offer Cash on Delivery (COD) services across major cities in Nepal to ensure a secure and trusted shopping experience."
        },
        {
            q: "How can I track my order?",
            a: "You can track your order status in real-time from the 'My Account' section after logging in. You'll also receive SMS updates."
        }
    ];

    return (
        <div className="support-page" style={{ background: '#f8fafc', minHeight: '100vh', padding: '0 0 5rem' }}>
            {/* Header Hero */}
            <div style={{ 
                background: '#0f172a', 
                color: 'white', 
                padding: 'clamp(4rem, 15vw, 6rem) 1rem',
                textAlign: 'center',
                marginBottom: '-4rem'
            }}>
                <div className="container">
                    <h1 style={{ fontSize: 'clamp(2.5rem, 10vw, 4rem)', fontWeight: '950', marginBottom: '1rem', letterSpacing: '-0.04em' }}>
                        How can we <span style={{ color: 'var(--primary-red)' }}>help?</span>
                    </h1>
                    <p style={{ fontSize: '1.15rem', color: '#94a3b8', maxWidth: '600px', margin: '0 auto', fontWeight: '500' }}>
                        Have a question? We're here to help you 7 days a week.
                    </p>
                </div>
            </div>

            <div className="container">
                {/* Support Channels Grid */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                    gap: '1.5rem',
                    marginBottom: '4rem'
                }}>
                    <SupportCard 
                        icon={<Phone size={24} />} 
                        title="Call Support" 
                        detail="+977 1-4XXXXXX" 
                        action="Call Now"
                        bgColor="#eff6ff"
                        color="#3b82f6"
                    />
                    <SupportCard 
                        icon={
                            <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                width="24" 
                                height="24" 
                                viewBox="0 0 24 24" 
                                fill="currentColor"
                            >
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                        } 
                        title="WhatsApp Us" 
                        detail="+977 98XXXXXXXX" 
                        action="Start Chat"
                        bgColor="#f0fdf4"
                        color="#22c55e"
                    />
                    <SupportCard 
                        icon={<Mail size={24} />} 
                        title="Email Support" 
                        detail="support@shopynepal.com" 
                        action="Send Email"
                        bgColor="#fef2f2"
                        color="#ef4444"
                    />
                </div>

                <div className="contact-main-grid">
                    {/* FAQ Section */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                            <HelpCircle size={28} color="var(--primary-red)" />
                            <h2 style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0f172a' }}>Frequently Asked Questions</h2>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {faqs.map((faq, index) => (
                                <div 
                                    key={index} 
                                    onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                                    style={{ 
                                        background: 'white', borderRadius: '1.5rem', 
                                        border: '1px solid #e2e8f0', cursor: 'pointer',
                                        overflow: 'hidden', transition: 'all 0.3s ease'
                                    }}
                                >
                                    <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#1e293b' }}>{faq.q}</h3>
                                        {openFaq === index ? <Minus size={18} /> : <Plus size={18} />}
                                    </div>
                                    <div style={{ 
                                        maxHeight: openFaq === index ? '200px' : '0',
                                        padding: openFaq === index ? '0 1.5rem 1.5rem' : '0 1.5rem',
                                        color: '#64748b', fontSize: '0.95rem', lineHeight: '1.6',
                                        transition: 'all 0.3s ease', opacity: openFaq === index ? 1 : 0
                                    }}>
                                        {faq.a}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Form Section */}
                    <div style={{ 
                        background: 'white', padding: 'clamp(1.5rem, 5vw, 3rem)', 
                        borderRadius: '2.5rem', border: '1px solid #e2e8f0',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.03)'
                    }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', marginBottom: '2rem', color: '#0f172a' }}>Send a Message</h2>
                        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Full Name</label>
                                <input required style={{ width: '100%', padding: '1rem 1.25rem', borderRadius: '1rem', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }} placeholder="Suman Thapa" />
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Email Address</label>
                                <input required type="email" style={{ width: '100%', padding: '1rem 1.25rem', borderRadius: '1rem', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }} placeholder="suman@mail.com" />
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Message</label>
                                <textarea required style={{ width: '100%', padding: '1rem 1.25rem', borderRadius: '1.25rem', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '600', minHeight: '140px', resize: 'none' }} placeholder="How can we help?"></textarea>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ padding: '1.15rem', borderRadius: '1.25rem', fontWeight: '900', fontSize: '1.1rem' }}>
                                Send Message <Send size={20} style={{ marginLeft: '8px' }} />
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <style>{`
                .contact-main-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 4rem;
                }
                @media (min-width: 992px) {
                    .contact-main-grid {
                        grid-template-columns: 1.2fr 1fr;
                    }
                }
            `}</style>
        </div>
    );
};

const SupportCard = ({ icon, title, detail, action, bgColor, color }) => (
    <div style={{ 
        background: 'white', padding: '2rem', borderRadius: '2rem', 
        border: '1px solid #e2e8f0', boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        transition: 'transform 0.3s ease'
    }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
        <div style={{ 
            width: '64px', height: '64px', background: bgColor, color: color, 
            borderRadius: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '1.5rem'
        }}>
            {icon}
        </div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0f172a', marginBottom: '0.5rem' }}>{title}</h3>
        <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', marginBottom: '1.5rem' }}>{detail}</p>
        <button style={{ 
            background: 'none', border: `1.5px solid ${color}`, color: color, 
            padding: '0.6rem 1.25rem', borderRadius: '100px', fontWeight: '800', 
            fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
        }}>
            {action} <ChevronRight size={16} />
        </button>
    </div>
);

export default Contact;
