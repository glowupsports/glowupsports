import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { styles } from "./calendarStyles";

type Location = { id: string; name: string };
type Court = { id: string; name: string };

interface CalendarFilterOverlayProps {
  visible: boolean;
  onClose: () => void;
  allLocations: Location[];
  locationFilteredCourts: Court[];
  selectedLocationFilter: string | null;
  setSelectedLocationFilter: (id: string | null) => void;
  selectedCourtFilter: string | null;
  setSelectedCourtFilter: (id: string | null) => void;
}

export function CalendarFilterOverlay({
  visible,
  onClose,
  allLocations,
  locationFilteredCourts,
  selectedLocationFilter,
  setSelectedLocationFilter,
  selectedCourtFilter,
  setSelectedCourtFilter,
}: CalendarFilterOverlayProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.filterOverlayBackdrop} onPress={onClose}>
        <View style={styles.filterOverlayContent} onStartShouldSetResponder={() => true}>
          <View style={styles.filterOverlayHeader}>
            <Text style={styles.filterOverlayTitle}>FILTERS</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={20} color={Colors.dark.text} />
            </Pressable>
          </View>

          {allLocations.length > 0 ? (
            <>
              <Text style={styles.filterSectionLabel}>LOCATION</Text>
              <View style={styles.filterChipsWrap}>
                <Pressable
                  style={[styles.locationFilterChip, !selectedLocationFilter && styles.locationFilterChipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedLocationFilter(null);
                    setSelectedCourtFilter(null);
                  }}
                >
                  <Ionicons name="location" size={12} color={!selectedLocationFilter ? Colors.dark.gold : Colors.dark.textMuted} style={{ marginRight: 4 }} />
                  <Text style={[styles.locationFilterText, !selectedLocationFilter && styles.locationFilterTextActive]}>All</Text>
                </Pressable>
                {allLocations.map((location) => (
                  <Pressable
                    key={location.id}
                    style={[styles.locationFilterChip, selectedLocationFilter === location.id && styles.locationFilterChipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedLocationFilter(location.id);
                      setSelectedCourtFilter(null);
                    }}
                  >
                    <Ionicons name="location" size={12} color={selectedLocationFilter === location.id ? Colors.dark.gold : Colors.dark.textMuted} style={{ marginRight: 4 }} />
                    <Text style={[styles.locationFilterText, selectedLocationFilter === location.id && styles.locationFilterTextActive]}>{location.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {locationFilteredCourts.length > 1 ? (
            <>
              <Text style={styles.filterSectionLabel}>COURT</Text>
              <View style={styles.filterChipsWrap}>
                <Pressable
                  style={[styles.courtFilterChip, !selectedCourtFilter && styles.courtFilterChipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCourtFilter(null);
                  }}
                >
                  <Text style={[styles.courtFilterText, !selectedCourtFilter && styles.courtFilterTextActive]}>All Courts</Text>
                </Pressable>
                {locationFilteredCourts.map((court) => (
                  <Pressable
                    key={court.id}
                    style={[styles.courtFilterChip, selectedCourtFilter === court.id && styles.courtFilterChipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCourtFilter(court.id);
                    }}
                  >
                    <Text style={[styles.courtFilterText, selectedCourtFilter === court.id && styles.courtFilterTextActive]}>{court.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}
