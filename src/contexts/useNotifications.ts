// Separate file to avoid react-refresh warning
import { useContext } from 'react';
import { NotificationContext, NotificationContextType } from './NotificationContextTypes';

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

