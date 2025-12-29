import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useAuth } from '@/coach/context/AuthContext';
import { apiRequest, getApiUrl } from '@/lib/query-client';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

interface PushNotificationState {
  expoPushToken: string | null;
  isRegistered: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushNotificationState>({
    expoPushToken: null,
    isRegistered: false,
    isLoading: false,
    error: null,
  });
  
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const registerForPushNotificationsAsync = useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return null;
    }

    if (!Device.isDevice) {
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Permission not granted for push notifications' 
        }));
        return null;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Project ID not configured' 
        }));
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2ECC40',
        });
      }

      setState(prev => ({ 
        ...prev, 
        expoPushToken: token, 
        isLoading: false 
      }));
      
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get push token';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      return null;
    }
  }, []);

  const registerTokenWithServer = useCallback(async (token: string) => {
    if (!user?.id) return;

    const isCoach = user.role === 'coach' || user.role === 'admin';
    
    if (!isCoach) {
      console.log('Push token registration skipped - player endpoints not yet implemented');
      return;
    }

    try {
      const url = new URL('/api/coach/push-token', getApiUrl());
      await apiRequest('POST', url.toString(), {
        token,
        platform: Platform.OS,
        deviceInfo: {
          brand: Device.brand,
          modelName: Device.modelName,
          osVersion: Device.osVersion,
        },
      });
      
      setState(prev => ({ ...prev, isRegistered: true }));
    } catch (error) {
      console.error('Failed to register push token with server:', error);
    }
  }, [user?.id, user?.role]);

  const unregisterToken = useCallback(async () => {
    if (!state.expoPushToken) return;

    const isCoach = user?.role === 'coach' || user?.role === 'admin';
    
    if (!isCoach) {
      setState(prev => ({ ...prev, isRegistered: false, expoPushToken: null }));
      return;
    }

    try {
      const url = new URL('/api/coach/push-token', getApiUrl());
      await apiRequest('DELETE', url.toString(), { token: state.expoPushToken });
      setState(prev => ({ ...prev, isRegistered: false, expoPushToken: null }));
    } catch (error) {
      console.error('Failed to unregister push token:', error);
    }
  }, [state.expoPushToken, user?.role]);

  const enableNotifications = useCallback(async () => {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      await registerTokenWithServer(token);
    }
    return !!token;
  }, [registerForPushNotificationsAsync, registerTokenWithServer]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    notificationListener.current = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
      console.log('Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      console.log('Notification response:', data);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (user?.id && Platform.OS !== 'web' && Device.isDevice) {
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          registerTokenWithServer(token);
        }
      });
    }
  }, [user?.id, registerForPushNotificationsAsync, registerTokenWithServer]);

  return {
    ...state,
    enableNotifications,
    unregisterToken,
    registerForPushNotificationsAsync,
  };
}

export async function schedulePushNotification(title: string, body: string, data?: Record<string, unknown>, seconds: number = 1) {
  if (Platform.OS === 'web') return null;
  
  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  });
}
