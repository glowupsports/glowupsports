import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/coach/context/AuthContext';
import { apiRequest, getApiUrl } from '@/lib/query-client';

type DeepLinkData = {
  screen?: string;
  params?: Record<string, unknown>;
  playerId?: string;
  sessionId?: string;
  matchId?: string;
  conversationId?: string;
};

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
  const navigation = useNavigation<any>();
  const [state, setState] = useState<PushNotificationState>({
    expoPushToken: null,
    isRegistered: false,
    isLoading: false,
    error: null,
  });
  
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const handleDeepLink = useCallback((data: DeepLinkData) => {
    if (!data || !navigation) return;

    try {
      if (data.screen) {
        const params = data.params || {};
        
        if (data.playerId) params.playerId = data.playerId;
        if (data.sessionId) params.sessionId = data.sessionId;
        if (data.matchId) params.matchId = data.matchId;
        if (data.conversationId) params.conversationId = data.conversationId;

        switch (data.screen) {
          case 'PlayerMessages':
          case 'Messages':
            navigation.navigate('PlayerMessages', params);
            break;
          case 'PlayerNotifications':
          case 'Notifications':
            navigation.navigate('PlayerNotifications');
            break;
          case 'TrainingDetail':
          case 'Session':
            if (data.sessionId) {
              navigation.navigate('TrainingDetail', { sessionId: data.sessionId });
            }
            break;
          case 'MatchDetail':
          case 'Match':
            if (data.matchId) {
              navigation.navigate('MatchDetail', { matchId: data.matchId });
            }
            break;
          case 'Progress':
            navigation.navigate('PlayerTabs', { screen: 'Progress' });
            break;
          case 'Schedule':
            navigation.navigate('PlayerTabs', { screen: 'Schedule' });
            break;
          case 'Quests':
            navigation.navigate('Quests');
            break;
          case 'LevelUpHistory':
            navigation.navigate('LevelUpHistory');
            break;
          case 'Collection':
            navigation.navigate('Collection');
            break;
          case 'XPHistory':
            navigation.navigate('XPHistory');
            break;
          default:
            console.log('Unknown deep link screen:', data.screen);
        }
      }
    } catch (error) {
      console.error('Error handling deep link:', error);
    }
  }, [navigation]);

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

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2ECC40',
        });
      }

      let token: string | null = null;
      const isExpoGo = Constants.appOwnership === 'expo';

      if (!isExpoGo) {
        try {
          console.log('[Push] Production build detected - getting native FCM token...');
          const nativeToken = await Notifications.getDevicePushTokenAsync();
          token = nativeToken.data as string;
          console.log('[Push] Got native FCM token:', token?.substring(0, 40) + '...');
        } catch (fcmError) {
          console.warn('[Push] Failed to get native FCM token:', fcmError);
        }
      }

      if (!token) {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (projectId) {
          try {
            console.log('[Push] Trying Expo push token with projectId:', projectId);
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            token = tokenData.data;
            console.log('[Push] Got Expo push token:', token?.substring(0, 30) + '...');
          } catch (expoError) {
            console.error('[Push] Failed to get Expo push token:', expoError);
          }
        } else {
          console.warn('[Push] No EAS projectId configured');
        }
      }

      if (!token) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Could not obtain push token',
        }));
        return null;
      }

      console.log('[Push] Final token type:', token.startsWith('ExponentPushToken[') ? 'EXPO' : 'FCM', '| isExpoGo:', isExpoGo);

      setState(prev => ({ 
        ...prev, 
        expoPushToken: token, 
        isLoading: false 
      }));
      
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get push token';
      console.error('[Push] FAILED to get push token:', message, error);
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      return null;
    }
  }, []);

  const registerTokenWithServer = useCallback(async (token: string) => {
    if (!user?.id) return;

    console.log('[Push] Registering token with server:', token.substring(0, 30) + '...');
    try {
      const url = new URL('/api/push/register', getApiUrl());
      await apiRequest('POST', url.toString(), {
        token,
        platform: Platform.OS,
        deviceName: `${Device.brand || 'Unknown'} ${Device.modelName || 'Device'}`,
      });
      
      setState(prev => ({ ...prev, isRegistered: true }));
      console.log('Push token registered successfully');
    } catch (error) {
      console.error('[Push] FAILED to register token with server:', error);
    }
  }, [user?.id]);

  const unregisterToken = useCallback(async () => {
    if (!state.expoPushToken) return;

    try {
      const url = new URL('/api/push/unregister', getApiUrl());
      await apiRequest('DELETE', url.toString(), { token: state.expoPushToken });
      setState(prev => ({ ...prev, isRegistered: false, expoPushToken: null }));
    } catch (error) {
      console.error('Failed to unregister push token:', error);
    }
  }, [state.expoPushToken]);

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
      const data = response.notification.request.content.data as DeepLinkData;
      console.log('Notification response:', data);
      handleDeepLink(data);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [handleDeepLink]);

  useEffect(() => {
    if (user?.id && Platform.OS !== 'web' && Device.isDevice) {
      console.log('[Push] Auto-registering push notifications for user:', user.id);
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          console.log('[Push] Got token, registering with server...');
          registerTokenWithServer(token);
        } else {
          console.log('[Push] No token obtained - check permissions and projectId');
        }
      });
    } else {
      console.log('[Push] Skipping push registration - web:', Platform.OS === 'web', 'isDevice:', Device.isDevice, 'userId:', user?.id);
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
