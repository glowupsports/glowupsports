import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Dimensions } from "react-native";

import HomeScreen from "@/screens/HomeScreen";
import LessonsScreen from "@/screens/LessonsScreen";
import QuestScreen from "@/screens/QuestScreen";
import MatchScreen from "@/screens/MatchScreen";
import RankingScreen from "@/screens/RankingScreen";
import FriendsScreen from "@/screens/FriendsScreen";
import GameLobbyScreen from "@/screens/GameLobbyScreen";
import EventsScreen from "@/screens/EventsScreen";
import PaymentsScreen from "@/screens/PaymentsScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import { DrawerContent } from "@/components/DrawerContent";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { Colors } from "@/constants/theme";

export type DrawerParamList = {
  Home: undefined;
  Lessons: undefined;
  Quest: undefined;
  Match: undefined;
  Ranking: undefined;
  Friends: undefined;
  GameLobby: undefined;
  Events: undefined;
  Payments: undefined;
  Settings: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();
const { width } = Dimensions.get("window");

export default function DrawerNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        ...screenOptions,
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
        options={{ headerShown: true, headerTitle: "Lessons" }}
      />
      <Drawer.Screen
        name="Quest"
        component={QuestScreen}
        options={{ headerShown: true, headerTitle: "Quests" }}
      />
      <Drawer.Screen
        name="Match"
        component={MatchScreen}
        options={{ headerShown: true, headerTitle: "Matches" }}
      />
      <Drawer.Screen
        name="Ranking"
        component={RankingScreen}
        options={{ headerShown: true, headerTitle: "Ranking" }}
      />
      <Drawer.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ headerShown: true, headerTitle: "Friends" }}
      />
      <Drawer.Screen
        name="GameLobby"
        component={GameLobbyScreen}
        options={{ headerShown: true, headerTitle: "Game Lobby" }}
      />
      <Drawer.Screen
        name="Events"
        component={EventsScreen}
        options={{ headerShown: true, headerTitle: "Events" }}
      />
      <Drawer.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{ headerShown: true, headerTitle: "Payments" }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: true, headerTitle: "Settings" }}
      />
    </Drawer.Navigator>
  );
}
