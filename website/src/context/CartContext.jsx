import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('shopy-nepal-cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  useEffect(() => {
    localStorage.setItem('shopy-nepal-cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product) => {
    const qty = product.quantity || 1;
    // Create a unique key for variants so Red/XL doesn't merge with Black/S
    const cartKey = `${product.id}-${product.selectedSize || ''}-${product.variationLabel || ''}`;

    setCart((prev) => {
      const existing = prev.find((item) => 
        (item.cartKey === cartKey) || (item.id === product.id && !item.cartKey && !product.selectedSize && !product.variationLabel)
      );

      if (existing) {
        return prev.map((item) =>
          (item.cartKey === cartKey || (item.id === product.id && !item.cartKey && !product.selectedSize))
            ? { ...item, quantity: item.quantity + qty, selected: true }
            : item
        );
      }
      return [...prev, { ...product, cartKey, quantity: qty, selected: true }];
    });
  };

  const toggleSelectItem = (cartKey) => {
    setCart((prev) =>
      prev.map((item) =>
        (item.cartKey === cartKey || item.id === cartKey) ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const removeFromCart = (cartKey) => {
    setCart((prev) => prev.filter((item) => item.cartKey !== cartKey && item.id !== cartKey));
  };

  const clearSelectedItems = () => {
    setCart((prev) => prev.filter((item) => !item.selected));
  };

  const updateQuantity = (cartKey, quantity) => {
    if (quantity < 1) return;
    setCart((prev) =>
      prev.map((item) =>
        (item.cartKey === cartKey || item.id === cartKey) ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((total, item) => item.selected ? total + (item.price * item.quantity) : total, 0);
  const cartCount = cart.length;
  const selectedCount = cart.filter(item => item.selected).length;

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, toggleSelectItem, clearCart, clearSelectedItems, cartTotal, cartCount, selectedCount }}>
      {children}
    </CartContext.Provider>
  );
};
