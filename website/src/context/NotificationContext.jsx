/* eslint-disable react-refresh/only-export-components -- colocated provider + hook is the project convention */
import { createContext, useContext, useState, useCallback } from 'react';
import Notification from '../components/Notification';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const showNotification = useCallback((message, type = 'info', duration = 4000) => {
        const id = `${Date.now()}-${Math.random()}`;
        setNotifications(prev => {
            const next = [...prev, { id, message, type }];
            return next.length > 4 ? next.slice(-4) : next;
        });

        if (duration) {
            setTimeout(() => {
                removeNotification(id);
            }, duration);
        }
    }, [removeNotification]);

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            <div style={{
                position: 'fixed',
                top: 'calc(20px + var(--safe-top))',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '100%',
                maxWidth: '400px',
                pointerEvents: 'none',
                padding: '0 20px'
            }}>
                {notifications.map(n => (
                    <Notification 
                        key={n.id} 
                        message={n.message} 
                        type={n.type} 
                        onClose={() => removeNotification(n.id)} 
                    />
                ))}
            </div>
        </NotificationContext.Provider>
    );
};
