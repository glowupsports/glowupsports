import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Dimensions } from "react-native";
import { useTranslation } from "react-i18next";

import HomeScreen from "@/screens/HomeScreen";
import LessonsScreen from "@/screens/LessonsScreen";
import QuestScreen from "@/screens/QuestScreen";
import MatchScreen from "@/screens/MatchScreen";
import RankingScreen from "@/screens/RankingScreen";
import FriendsScreen from "@/player/screens/FriendsListScreen";
import GameLobbyScreen from "@/screens/GameLobbyScreen";
import EventsScreen from "@/screens/EventsScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import AdultGlowRankScreen from "@/screens/AdultGlowRankScreen";
import AdultRanksListScreen from "@/screens/AdultRanksListScreen";
import RecordAdultMatchScreen from "@/screens/RecordAdultMatchScreen";
import { DrawerContent } from "@/components/DrawerContent";
import { Colors } from "@/constants/theme";

export type DrawerParamList = {
  Home: undefined;
  Lessons: undefined;
  Quest: undefined;
  Match: undefined;
  Ranking: undefined;
  AdultGlowRank: undefined;
  AdultRanksList: undefined;
  RecordAdultMatch: undefined;
  Friends: undefined;
  GameLobby: undefined;
  Events: undefined;
  Settings: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();
const { width } = Dimensions.get("window");

export default function DrawerNavigator() {
  const { t } = useTranslation();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerTintColor: Colors.dark.text,
        headerStyle: {
          backgroundColor: Colors.dark.backgroundRoot,
        },
        sceneStyle: {
          backgroundColor: Colors.dark.backgroundRoot,
        },
        drawerStyle: {
          backgroundColor: Colors.dark.backgroundRoot,
          width: width * 0.75,
        },
        swipeEnabled: true,
        swipeEdgeWidth: 50,
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Drawer.Screen
        name="Lessons"
        component={LessonsScreen}
        options={{ headerShown: true, headerTitle: t('nav.lessons') }}
      />
      <Drawer.Screen
        name="Quest"
        component={QuestScreen}
        options={{ headerShown: true, headerTitle: t('nav.quests') }}
      />
      <Drawer.Screen
        name="Match"
        component={MatchScreen}
        options={{ headerShown: true, headerTitle: t('nav.matches') }}
      />
      <Drawer.Screen
        name="Ranking"
        component={RankingScreen}
        options={{ headerShown: true, headerTitle: t('nav.ranking') }}
      />
      <Drawer.Screen
        name="AdultGlowRank"
        component={AdultGlowRankScreen}
        options={{ headerShown: true, headerTitle: t('nav.glowRank') }}
      />
      <Drawer.Screen
        name="AdultRanksList"
        component={AdultRanksListScreen}
        options={{ headerShown: true, headerTitle: t('nav.allRanks') }}
      />
      <Drawer.Screen
        name="RecordAdultMatch"
        component={RecordAdultMatchScreen}
        options={{ headerShown: true, headerTitle: t('nav.recordMatch') }}
      />
      <Drawer.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ headerShown: true, headerTitle: t('nav.friends') }}
      />
      <Drawer.Screen
        name="GameLobby"
        component={GameLobbyScreen}
        options={{ headerShown: true, headerTitle: t('nav.gameLobby') }}
      />
      <Drawer.Screen
        name="Events"
        component={EventsScreen}
        options={{ headerShown: true, headerTitle: t('nav.events') }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: true, headerTitle: t('nav.settings') }}
      />
    </Drawer.Navigator>
  );
}
