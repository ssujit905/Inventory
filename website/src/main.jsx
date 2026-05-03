import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/index.css'
import { CartProvider } from './context/CartContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ProductProvider } from './context/ProductContext.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'

import { CustomerProvider } from './context/CustomerContext.jsx'
import { NotificationProvider } from './context/NotificationContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificationProvider>
        <AuthProvider>
          <CustomerProvider>
            <SettingsProvider>
              <ProductProvider>
                <CartProvider>
                  <App />
                </CartProvider>
              </ProductProvider>
            </SettingsProvider>
          </CustomerProvider>
        </AuthProvider>
      </NotificationProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
