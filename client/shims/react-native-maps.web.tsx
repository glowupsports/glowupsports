import React from "react";
import { View } from "react-native";

const MapView = React.forwardRef((_props: Record<string, unknown>, _ref: React.Ref<View>) => (
  <View />
));
MapView.displayName = "MapView";

export const Marker = (_props: Record<string, unknown>) => null;
export const Polyline = (_props: Record<string, unknown>) => null;
export const Polygon = (_props: Record<string, unknown>) => null;
export const Circle = (_props: Record<string, unknown>) => null;
export const Callout = (_props: Record<string, unknown>) => null;

export const PROVIDER_GOOGLE = "google";
export const PROVIDER_DEFAULT = null;

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapPressEvent = {
  nativeEvent: { coordinate: { latitude: number; longitude: number } };
};

export type MarkerDragStartEndEvent = {
  nativeEvent: { coordinate: { latitude: number; longitude: number } };
};

export default MapView;
