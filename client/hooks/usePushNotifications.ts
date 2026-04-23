import logger from "@/lib/logger";
import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
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
  roomId?: string;
  roomTitle?: string;
  messageId?: string;
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
  const isRegistering = useRef(false);
  const retryCount = useRef(0);
  const MAX_RETRIES = 3;

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
          case 'CoachFeedbackHistory':
            navigation.navigate('CoachFeedbackHistory');
            break;
          case 'ChatRoom':
            if (data.roomId) {
              navigation.navigate('ChatRoom', {
                roomId: data.roomId,
                title: data.roomTitle,
                scrollToMessageId: data.messageId,
                ...(data.params || {}),
              });
            }
            break;
          default:
            logger.log('[Push] Unknown deep link screen:', data.screen);
        }
      }
    } catch (error) {
      console.error('[Push] Error handling deep link:', error);
    }
  }, [navigation]);

  const registerForPushNotificationsAsync = useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      logger.log('[Push] Skipping - web platform');
      return null;
    }

    if (!Device.isDevice) {
      logger.log('[Push] Skipping - not a real device (simulator/emulator)');
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      logger.log('[Push] Starting push notification registration...');
      logger.log('[Push] Device:', Device.brand, Device.modelName, '| OS:', Platform.OS, Platform.Version);
      logger.log('[Push] App ownership:', Constants.appOwnership || 'standalone');

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      logger.log('[Push] Existing permission status:', existingStatus);

      if (existingStatus !== 'granted') {
        logger.log('[Push] Requesting permission...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        logger.log('[Push] New permission status:', status);
      }

      if (finalStatus !== 'granted') {
        logger.log('[Push] Permission NOT granted - user denied notifications');
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Permission not granted for push notifications' 
        }));
        return null;
      }

      if (Platform.OS === 'android') {
        logger.log('[Push] Setting up Android notification channels...');
        await Notifications.setNotificationChannelAsync('default', {
          name: 'General',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2ECC40',
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('feedback', {
          name: 'Coach Feedback',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00E5FF',
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('sessions', {
          name: 'Sessions & Bookings',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFD700',
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('xp', {
          name: 'XP & Achievements',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#FFD700',
        });
        logger.log('[Push] Android channels created');
      }

      let token: string | null = null;
      const isExpoGo = Constants.appOwnership === 'expo';

      logger.log('[Push] App ownership:', Constants.appOwnership, '| isExpoGo:', isExpoGo);

      try {
        logger.log('[Push] Getting native FCM device token...');
        const nativeToken = await Notifications.getDevicePushTokenAsync();
        token = nativeToken.data as string;
        logger.log('[Push] SUCCESS: Got FCM device token:', token?.substring(0, 50) + '...');
        logger.log('[Push] FCM token length:', token?.length);
      } catch (fcmError: any) {
        console.error('[Push] FAILED to get FCM device token:', fcmError?.message || fcmError);
        
        if (isExpoGo) {
          logger.log('[Push] Running in Expo Go - FCM not available, trying Expo push token as fallback...');
          const projectId = Constants.expoConfig?.extra?.eas?.projectId;
          if (projectId) {
            try {
              const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
              token = tokenData.data;
              logger.log('[Push] Got Expo push token (Expo Go only):', token?.substring(0, 30) + '...');
            } catch (expoError: any) {
              console.error('[Push] FAILED to get Expo push token:', expoError?.message || expoError);
            }
          }
        } else {
          console.error('[Push] NATIVE BUILD: FCM token failed! Check google-services.json is in android/app/');
          console.error('[Push] Make sure Firebase is properly configured in the Android build');
        }
      }

      if (!token) {
        const errorMsg = 'Could not obtain push token - check Firebase configuration in app';
        console.error('[Push] FINAL FAILURE:', errorMsg);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }));
        return null;
      }

      const tokenType = token.startsWith('ExponentPushToken[') ? 'EXPO' : 'FCM';
      logger.log('[Push] Final token type:', tokenType, '| Length:', token.length, '| isExpoGo:', isExpoGo);

      setState(prev => ({ 
        ...prev, 
        expoPushToken: token, 
        isLoading: false 
      }));
      
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get push token';
      console.error('[Push] UNEXPECTED ERROR in registration:', message, error);
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      return null;
    }
  }, []);

  const registerTokenWithServer = useCallback(async (token: string) => {
    if (!user?.id) {
      logger.log('[Push] Cannot register with server - no user id');
      return;
    }

    logger.log('[Push] Registering token with server for user:', user.id);
    logger.log('[Push] Token preview:', token.substring(0, 40) + '...');
    logger.log('[Push] Platform:', Platform.OS, '| Device:', Device.brand, Device.modelName);

    try {
      const url = new URL('/api/push/register', getApiUrl());
      const response = await apiRequest('POST', url.toString(), {
        token,
        platform: Platform.OS,
        deviceName: `${Device.brand || 'Unknown'} ${Device.modelName || 'Device'}`,
      });
      
      setState(prev => ({ ...prev, isRegistered: true }));
      retryCount.current = 0;
      logger.log('[Push] SUCCESS: Token registered with server');
    } catch (error: any) {
      console.error('[Push] FAILED to register token with server:', error?.message || error);
      
      if (retryCount.current < MAX_RETRIES) {
        retryCount.current++;
        const delay = retryCount.current * 3000;
        logger.log(`[Push] Will retry in ${delay}ms (attempt ${retryCount.current}/${MAX_RETRIES})`);
        setTimeout(() => {
          registerTokenWithServer(token);
        }, delay);
      } else {
        console.error('[Push] Max retries reached - token registration failed');
      }
    }
  }, [user?.id]);

  const unregisterToken = useCallback(async () => {
    if (!state.expoPushToken) return;

    try {
      const url = new URL('/api/push/unregister', getApiUrl());
      await apiRequest('DELETE', url.toString(), { token: state.expoPushToken });
      setState(prev => ({ ...prev, isRegistered: false, expoPushToken: null }));
    } catch (error) {
      console.error('[Push] Failed to unregister push token:', error);
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
      logger.log('[Push] Notification received in foreground:', notification.request.content.title);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as DeepLinkData;
      logger.log('[Push] Notification tapped:', data);
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
    if (!user?.id || Platform.OS === 'web') {
      return;
    }

    if (isRegistering.current) {
      return;
    }

    if (!Device.isDevice) {
      logger.log('[Push] Not a real device - skipping push registration');
      return;
    }

    isRegistering.current = true;
    logger.log('[Push] ===== REGISTERING push notifications (refreshes every app open) =====');
    logger.log('[Push] User:', user.id, '| Role:', user.role);
    logger.log('[Push] Build type:', Constants.appOwnership || 'standalone (Play Store/production)');

    const doRegister = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const token = await registerForPushNotificationsAsync();
        if (token) {
          const tokenType = token.startsWith('ExponentPushToken[') ? 'EXPO' : 'FCM';
          logger.log(`[Push] Got ${tokenType} token, registering with server...`);
          await registerTokenWithServer(token);
        } else {
          logger.log('[Push] No token obtained after registration attempt');
        }
      } finally {
        isRegistering.current = false;
      }
    };

    doRegister();
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
