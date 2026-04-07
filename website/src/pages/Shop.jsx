import { useLocation, useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import ProductCard from '../components/ProductCard';
import { useState, useEffect, useMemo } from 'react';
import { Filter, X, ChevronDown, LayoutGrid, ListFilter, SlidersHorizontal, Search } from 'lucide-react';

const Shop = () => {
    const { products } = useProducts();
    const location = useLocation();
    const navigate = useNavigate();
    
    // States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [sortBy, setSortBy] = useState('Newest');
    const [showFilters, setShowFilters] = useState(false);

    // Derived Categories
    const categories = useMemo(() => {
        const cats = ['All', ...new Set(products.map(p => p.category))];
        return cats;
    }, [products]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        setSearchQuery(params.get('q') || '');
    }, [location.search]);

    // Filtering & Sorting Logic
    const filteredProducts = useMemo(() => {
        let result = [...products];

        // Search
        if (searchQuery) {
            result = result.filter(p => 
                p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.description.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Category
        if (selectedCategory !== 'All') {
            result = result.filter(p => p.category === selectedCategory);
        }

        // Sorting
        if (sortBy === 'Price: Low to High') result.sort((a, b) => a.price - b.price);
        if (sortBy === 'Price: High to Low') result.sort((a, b) => b.price - a.price);
        if (sortBy === 'Newest') result.reverse();

        return result;
    }, [products, searchQuery, selectedCategory, sortBy]);

    // Masonry Columns for Mobile
    const leftColumn = filteredProducts.filter((_, idx) => idx % 2 === 0);
    const rightColumn = filteredProducts.filter((_, idx) => idx % 2 !== 0);

    return (
        <div className="shop-page" style={{ background: '#f8fafc', minHeight: '100vh' }}>
            {/* Horizontal Category Bar */}
            <div style={{ 
                position: 'sticky', top: '70px', zIndex: 900, 
                background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)',
                borderBottom: '1px solid var(--border-color)',
                padding: '0.75rem 0'
            }}>
                <div className="container" style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', scrollbarWidth: 'none', padding: '0 1rem' }}>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            style={{
                                padding: '0.5rem 1rem', borderRadius: '100px', border: '1px solid var(--border-color)',
                                background: selectedCategory === cat ? 'var(--primary-blue)' : 'white',
                                color: selectedCategory === cat ? 'white' : 'var(--text-gray)',
                                fontSize: '0.85rem', fontWeight: '800', whiteSpace: 'nowrap', transition: 'all 0.2s',
                                boxShadow: selectedCategory === cat ? '0 4px 12px rgba(30, 41, 59, 0.15)' : 'none'
                            }}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '5rem' }}>
                {/* Header & Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '0 0.25rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: '950', color: 'var(--primary-blue)' }}>
                            {searchQuery ? `Search: ${searchQuery}` : selectedCategory}
                        </h1>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-gray)', fontWeight: '600' }}>{filteredProducts.length} items found</p>
                    </div>
                    
                    <button 
                        onClick={() => setShowFilters(true)}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.5rem', 
                            padding: '0.6rem 1rem', borderRadius: '1rem', border: '1px solid var(--border-color)',
                            background: 'white', fontWeight: '800', fontSize: '0.85rem'
                        }}
                    >
                        <SlidersHorizontal size={16} /> Filter
                    </button>
                </div>

                {/* Grid */}
                {filteredProducts.length > 0 ? (
                    <div className="shop-grid">
                        <div className="grid-column" style={{ paddingTop: '20px' }}>
                            {leftColumn.map(p => <ProductCard key={p.id} product={p} />)}
                        </div>
                        <div className="grid-column">
                            {rightColumn.map(p => <ProductCard key={p.id} product={p} />)}
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
                        <div style={{ width: '80px', height: '80px', background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                            <Search size={32} color="var(--border-color)" />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800' }}>No results found</h2>
                        <p style={{ color: 'var(--text-gray)', marginTop: '0.5rem', marginBottom: '2rem' }}>Try adjusting your filters or search query.</p>
                        <button onClick={() => navigate('/shop')} className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>Clear All</button>
                    </div>
                )}
            </div>

            {/* Filter Bottom Sheet */}
            {showFilters && (
                <div className="modal-overlay" onClick={() => setShowFilters(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ 
                        maxHeight: '80vh', 
                        display: 'flex', flexDirection: 'column', 
                        padding: '0', overflow: 'hidden' 
                    }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontWeight: '900', fontSize: '1.25rem' }}>Filters & Sorting</h2>
                            <button onClick={() => setShowFilters(false)} style={{ background: '#f1f5f9', borderRadius: '50%', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-gray)', marginBottom: '1rem' }}>Sort By</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    {['Newest', 'Price: Low to High', 'Price: High to Low'].map(s => (
                                        <button 
                                            key={s} 
                                            onClick={() => setSortBy(s)}
                                            style={{ 
                                                padding: '0.75rem', borderRadius: '12px', border: '1.5px solid', 
                                                borderColor: sortBy === s ? 'var(--primary-blue)' : 'var(--border-color)',
                                                background: sortBy === s ? '#eff6ff' : 'white',
                                                color: sortBy === s ? 'var(--primary-blue)' : 'var(--text-dark)',
                                                fontWeight: '800', fontSize: '0.8rem'
                                            }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h3 style={{ fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-gray)', marginBottom: '1rem' }}>Category</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    {categories.map(c => (
                                        <button 
                                            key={c} 
                                            onClick={() => setSelectedCategory(c)}
                                            style={{ 
                                                padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1.5px solid', 
                                                borderColor: selectedCategory === c ? 'var(--primary-blue)' : 'var(--border-color)',
                                                background: selectedCategory === c ? '#eff6ff' : 'white',
                                                color: selectedCategory === c ? 'var(--primary-blue)' : 'var(--text-dark)',
                                                fontWeight: '800', fontSize: '0.85rem'
                                            }}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1.5rem', background: '#f8fafc', borderTop: '1px solid var(--border-color)' }}>
                            <button 
                                onClick={() => setShowFilters(false)}
                                className="btn btn-primary" 
                                style={{ width: '100%', padding: '1rem', borderRadius: '12px', fontSize: '1rem', fontWeight: '900' }}
                            >
                                Apply Filters
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .shop-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                }
                .grid-column {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .container::-webkit-scrollbar { display: none; }
                
                @media (min-width: 992px) {
                    .shop-grid {
                        grid-template-columns: repeat(5, 1fr);
                        gap: 24px;
                    }
                    .grid-column { display: contents; }
                    .grid-column:first-child { padding-top: 0 !important; }
                }
            `}</style>
        </div>
    );
};

export default Shop;
