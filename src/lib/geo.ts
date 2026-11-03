import { CompanySettings, GeofenceValidationResult } from "@/types/hr";

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates great-circle distance in meters between two GPS coordinates
 * using the Haversine formula.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c * 10) / 10;
}

/**
 * Validates whether a user's browser/device GPS coordinates fall within the
 * Wellness Center's configured geofence radius.
 */
export function validateWellnessCenterGeofence(
  userLat: number,
  userLng: number,
  settings: Pick<
    CompanySettings,
    | "center_latitude"
    | "center_longitude"
    | "geofence_radius_meters"
    | "enforce_geofence"
    | "wellness_center_name"
  >
): GeofenceValidationResult {
  if (
    typeof userLat !== "number" ||
    typeof userLng !== "number" ||
    Number.isNaN(userLat) ||
    Number.isNaN(userLng) ||
    userLat < -90 ||
    userLat > 90 ||
    userLng < -180 ||
    userLng > 180
  ) {
    return {
      allowed: false,
      distanceMeters: -1,
      maxRadiusMeters: settings.geofence_radius_meters,
      centerLatitude: settings.center_latitude,
      centerLongitude: settings.center_longitude,
      userLatitude: userLat,
      userLongitude: userLng,
      message: "Invalid GPS coordinates received from device.",
    };
  }

  const distanceMeters = calculateHaversineDistanceMeters(
    userLat,
    userLng,
    settings.center_latitude,
    settings.center_longitude
  );

  const withinRadius = distanceMeters <= settings.geofence_radius_meters;
  const allowed = !settings.enforce_geofence || withinRadius;

  if (withinRadius) {
    return {
      allowed: true,
      distanceMeters,
      maxRadiusMeters: settings.geofence_radius_meters,
      centerLatitude: settings.center_latitude,
      centerLongitude: settings.center_longitude,
      userLatitude: userLat,
      userLongitude: userLng,
      message: `Verified within ${settings.wellness_center_name} geofence (${distanceMeters}m from center; allowed radius ${settings.geofence_radius_meters}m).`,
    };
  }

  if (!settings.enforce_geofence) {
    return {
      allowed: true,
      distanceMeters,
      maxRadiusMeters: settings.geofence_radius_meters,
      centerLatitude: settings.center_latitude,
      centerLongitude: settings.center_longitude,
      userLatitude: userLat,
      userLongitude: userLng,
      message: `Outside radius (${distanceMeters}m > ${settings.geofence_radius_meters}m), but strict geofence enforcement is disabled in Admin Settings.`,
    };
  }

  return {
    allowed: false,
    distanceMeters,
    maxRadiusMeters: settings.geofence_radius_meters,
    centerLatitude: settings.center_latitude,
    centerLongitude: settings.center_longitude,
    userLatitude: userLat,
    userLongitude: userLng,
    message: `Geofence check failed: You are ${distanceMeters}m away from ${settings.wellness_center_name}. You must be within ${settings.geofence_radius_meters}m to check in/out.`,
  };
}
