import { createUserSupabaseClient } from "../config/supabaseUser.js";
const calculateDistanceInMeters = (
  latitude1,
  longitude1,
  latitude2,
  longitude2
) => {
  const earthRadius = 6371000;

  const lat1 = (latitude1 * Math.PI) / 180;
  const lat2 = (latitude2 * Math.PI) / 180;

  const deltaLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const deltaLon =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) *
      Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c =
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
};
export const startOutstationTrip = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const {
      destination,
      destination_address,
      destination_place_id,
      destination_latitude,
      destination_longitude,
      starting_mileage,
    } = req.body;

    // ============================================
    // 1. Validate required fields
    // ============================================

    if (
      !destination ||
      destination_latitude === undefined ||
      destination_longitude === undefined ||
      starting_mileage === undefined
    ) {
      return res.status(400).json({
        message: "Destination and starting mileage are required",
      });
    }

    // ============================================
    // 2. Validate mileage
    // ============================================

    const startMileage = Number(starting_mileage);

    if (
      !Number.isInteger(startMileage) ||
      startMileage < 0
    ) {
      return res.status(400).json({
        message:
          "Starting mileage must be a valid non-negative whole number",
      });
    }

    // ============================================
    // 3. Validate coordinates
    // ============================================

    const latitude = Number(destination_latitude);
    const longitude = Number(destination_longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        message: "Invalid destination coordinates",
      });
    }

    // ============================================
    // 4. Find active driver
    // ============================================

    const {
      data: driver,
      error: driverError,
    } = await userSupabase
      .from("drivers")
      .select(`
        id,
        user_id,
        name,
        status
      `)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (driverError) {
      console.error("Driver lookup error:", driverError);

      return res.status(500).json({
        message: "Failed to find driver",
      });
    }

    if (!driver) {
      return res.status(404).json({
        message: "Driver profile not found",
      });
    }

    if (driver.status !== "active") {
      return res.status(403).json({
        message: "Your driver account is inactive",
      });
    }

    // ============================================
    // 5. Find assigned vehicle
    // ============================================

    const {
      data: vehicle,
      error: vehicleError,
    } = await userSupabase
      .from("vehicles")
      .select(`
        id,
        assigned_driver_id,
        status
      `)
      .eq("assigned_driver_id", driver.id)
      .maybeSingle();

    if (vehicleError) {
      console.error(
        "Vehicle lookup error:",
        vehicleError
      );

      return res.status(500).json({
        message: "Failed to find assigned vehicle",
      });
    }

    if (!vehicle) {
      return res.status(404).json({
        message: "No vehicle is assigned to you",
      });
    }

    if (vehicle.status !== "active") {
      return res.status(403).json({
        message: "Your assigned vehicle is inactive",
      });
    }

    // ============================================
    // 6. Check for an existing active trip
    // ============================================

    const {
      data: activeTrip,
      error: activeTripError,
    } = await userSupabase
      .from("outstation_trips")
      .select("id, status, destination")
      .eq("driver_id", driver.id)
      .in("status", [
        "started",
      "location_shared",
      ])
      .maybeSingle();

    if (activeTripError) {
      console.error(
        "Active trip lookup error:",
        activeTripError
      );

      return res.status(500).json({
        message: "Failed to check active outstation trip",
      });
    }

    if (activeTrip) {
      return res.status(409).json({
        message:
          "You already have an active outstation trip",
      });
    }

    // ============================================
    // 7. Find previous mileage entry
    // ============================================

    const {
      data: previousEntry,
      error: previousEntryError,
    } = await userSupabase
      .from("mileage_entries")
      .select(`
        id,
        ending_mileage,
        entry_date
      `)
      .eq("vehicle_id", vehicle.id)
      .order("entry_date", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (previousEntryError) {
      console.error(
        "Previous mileage lookup error:",
        previousEntryError
      );

      return res.status(500).json({
        message: "Failed to check previous mileage",
      });
    }

    // ============================================
    // 8. Prevent odometer rollback
    // ============================================

    if (
      previousEntry &&
      startMileage < Number(previousEntry.ending_mileage)
    ) {
      return res.status(400).json({
        message:
          `Starting mileage cannot be less than the previous ending mileage (${previousEntry.ending_mileage} KM)`,
      });
    }

    // ============================================
    // 9. Create outstation trip
    // ============================================

    const {
      data: trip,
      error: tripError,
    } = await userSupabase
      .from("outstation_trips")
      .insert({
        driver_id: driver.id,
        vehicle_id: vehicle.id,

        entry_date: new Date()
          .toISOString()
          .split("T")[0],

        destination,
        destination_address:
          destination_address || null,
        destination_place_id:
          destination_place_id || null,

        destination_latitude: latitude,
        destination_longitude: longitude,

        starting_mileage: startMileage,

        started_at: new Date().toISOString(),

        status: "started",

        created_by: req.user.id,
      })
      .select()
      .single();

    if (tripError) {
      console.error(
        "Create outstation trip error:",
        tripError
      );

      return res.status(500).json({
        message: "Failed to start outstation trip",
      });
    }

    // ============================================
    // 10. Success
    // ============================================

    return res.status(201).json({
      message: "Outstation trip started successfully",
      trip,
    });
  } catch (error) {
    console.error(
      "Start outstation trip error:",
      error
    );

    return res.status(500).json({
      message: "Server error",
    });
  }
};
export const verifyOutstationArrival = async (req, res) => {
  try {
    const userSupabase =
      createUserSupabaseClient(req.accessToken);

    const { tripId } = req.params;

    const {
      latitude,
      longitude,
      accuracy,
    } = req.body;

    // Validate GPS coordinates
    if (
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        message:
          "Current location coordinates are required.",
      });
    }

    const driverLatitude = Number(latitude);
    const driverLongitude = Number(longitude);
    const gpsAccuracy =
      accuracy !== undefined
        ? Number(accuracy)
        : null;

    if (
      !Number.isFinite(driverLatitude) ||
      !Number.isFinite(driverLongitude) ||
      driverLatitude < -90 ||
      driverLatitude > 90 ||
      driverLongitude < -180 ||
      driverLongitude > 180
    ) {
      return res.status(400).json({
        message: "Invalid GPS coordinates.",
      });
    }

    // Find the driver's active trip
    const { data: trip, error: tripError } =
      await userSupabase
        .from("outstation_trips")
        .select(`
          id,
          driver_id,
          vehicle_id,
          destination,
          destination_latitude,
          destination_longitude,
          status
        `)
        .eq("id", tripId)
        .eq("status", "started")
        .maybeSingle();

    if (tripError) {
      console.error(
        "Find outstation trip error:",
        tripError
      );

      return res.status(500).json({
        message: "Failed to find outstation trip.",
      });
    }

    if (!trip) {
      return res.status(404).json({
        message:
          "Active outstation trip not found.",
      });
    }

    // Make sure the trip belongs to the logged-in driver
    const { data: driver, error: driverError } =
      await userSupabase
        .from("drivers")
        .select("id, user_id")
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (driverError) {
      console.error(
        "Find driver error:",
        driverError
      );

      return res.status(500).json({
        message: "Failed to verify driver.",
      });
    }

    if (!driver || driver.id !== trip.driver_id) {
      return res.status(403).json({
        message:
          "You are not authorized to verify this trip.",
      });
    }

    // Calculate distance from destination
    const distance = calculateDistanceInMeters(
      trip.destination_latitude,
      trip.destination_longitude,
      driverLatitude,
      driverLongitude
    );

   

    // Location verified successfully
    const { data: updatedTrip, error: updateError } =
      await userSupabase
        .from("outstation_trips")
        .update({
          arrival_latitude: driverLatitude,
          arrival_longitude: driverLongitude,
          arrival_accuracy: gpsAccuracy,
          reached_at: new Date().toISOString(),
     status: "location_shared",
          updated_at: new Date().toISOString(),
        })
        .eq("id", trip.id)
        .select()
        .single();

    if (updateError) {
      console.error(
        "Update arrival location error:",
        updateError
      );

      return res.status(500).json({
        message:
          "Failed to save arrival location.",
      });
    }

    return res.status(200).json({
      message:
        "Arrival location verified successfully.",
      distance: Math.round(distance),
      trip: updatedTrip,
    });
  } catch (error) {
    console.error(
      "Verify outstation arrival error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to verify arrival location.",
    });
  }
};
export const getActiveOutstationTrip = async (req, res) => {
  try {
    const userSupabase =
      createUserSupabaseClient(req.accessToken);

    const { data: driver, error: driverError } =
      await userSupabase
        .from("drivers")
        .select("id")
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (driverError) {
      console.error(
        "Find driver error:",
        driverError
      );

      return res.status(500).json({
        message: "Failed to find driver.",
      });
    }

    if (!driver) {
      return res.status(404).json({
        message: "Driver profile not found.",
      });
    }

    const { data: trip, error: tripError } =
      await userSupabase
        .from("outstation_trips")
        .select("*")
        .eq("driver_id", driver.id)
        .in("status", [
          "started",
           "location_shared",
        ])
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (tripError) {
      console.error(
        "Find active outstation trip error:",
        tripError
      );

      return res.status(500).json({
        message:
          "Failed to find active outstation trip.",
      });
    }

    return res.status(200).json({
      trip: trip || null,
    });
  } catch (error) {
    console.error(
      "Get active outstation trip error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to get active outstation trip.",
    });
  }
};
export const completeOutstationTrip = async (req, res) => {
  try {
    const userSupabase =
      createUserSupabaseClient(req.accessToken);

    const { tripId } = req.params;
    const { ending_mileage } = req.body;

    // Validate ending mileage
    if (
      ending_mileage === undefined ||
      !Number.isInteger(Number(ending_mileage)) ||
      Number(ending_mileage) < 0
    ) {
      return res.status(400).json({
        message:
          "Please provide a valid ending mileage.",
      });
    }

    const endingMileage = Number(ending_mileage);

    // Find the driver's location-verified trip
    const { data: trip, error: tripError } =
      await userSupabase
        .from("outstation_trips")
        .select(`
          id,
          driver_id,
          starting_mileage,
          status
        `)
        .eq("id", tripId)
        .eq("status",  "location_shared")
        .maybeSingle();

    if (tripError) {
      console.error(
        "Find outstation trip error:",
        tripError
      );

      return res.status(500).json({
        message:
          "Failed to find outstation trip.",
      });
    }

    if (!trip) {
      return res.status(404).json({
        message:
          "Location-verified outstation trip not found.",
      });
    }

    // Make sure the trip belongs to the logged-in driver
    const { data: driver, error: driverError } =
      await userSupabase
        .from("drivers")
        .select("id")
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (driverError) {
      console.error(
        "Find driver error:",
        driverError
      );

      return res.status(500).json({
        message: "Failed to verify driver.",
      });
    }

    if (!driver || driver.id !== trip.driver_id) {
      return res.status(403).json({
        message:
          "You are not authorized to complete this trip.",
      });
    }

    // Prevent mileage rollback
    if (
      endingMileage <
      Number(trip.starting_mileage)
    ) {
      return res.status(400).json({
        message:
          "Ending mileage cannot be less than starting mileage.",
      });
    }

    const kmCovered =
      endingMileage -
      Number(trip.starting_mileage);

    // Complete the trip
    const { data: completedTrip, error: updateError } =
      await userSupabase
        .from("outstation_trips")
        .update({
          ending_mileage: endingMileage,
          km_covered: kmCovered,
          completed_at: new Date().toISOString(),
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", trip.id)
        .select()
        .single();

    if (updateError) {
      console.error(
        "Complete outstation trip error:",
        updateError
      );

      return res.status(500).json({
        message:
          "Failed to complete outstation trip.",
      });
    }

    return res.status(200).json({
      message:
        "Outstation trip completed successfully.",
      trip: completedTrip,
    });
  } catch (error) {
    console.error(
      "Complete outstation trip error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to complete outstation trip.",
    });
  }
};
export const getMyOutstationHistory = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(req.accessToken);

    const { data: driver, error: driverError } =
      await userSupabase
        .from("drivers")
        .select("id")
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (driverError) {
      console.error("Find driver error:", driverError);
      return res
        .status(500)
        .json({ message: "Failed to find driver." });
    }

    if (!driver) {
      return res
        .status(404)
        .json({ message: "Driver profile not found." });
    }

    const { data: trips, error: tripsError } =
      await userSupabase
        .from("outstation_trips")
        .select(`
          id,
          entry_date,
          destination,
          destination_address,
          starting_mileage,
          ending_mileage,
          km_covered,
          started_at,
          reached_at,
          completed_at,
          status
        `)
        .eq("driver_id", driver.id)
        .eq("status", "completed")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });

    if (tripsError) {
      console.error("Get outstation history error:", tripsError);
      return res
        .status(500)
        .json({ message: "Failed to fetch outstation history." });
    }

    return res.status(200).json({
      trips: trips || [],
    });
  } catch (error) {
    console.error("Get my outstation history error:", error);

    return res
      .status(500)
      .json({ message: "Failed to fetch outstation history." });
  }
};
export const getAllOutstationTrips = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const { data: trips, error } = await userSupabase
      .from("outstation_trips")
      .select(`
        id,
        entry_date,
        destination,
        destination_address,
        destination_place_id,
        destination_latitude,
        destination_longitude,
        starting_mileage,
        ending_mileage,
        km_covered,
        started_at,
        reached_at,
        completed_at,
        arrival_latitude,
        arrival_longitude,
        arrival_accuracy,
        status,
        driver_id,
        vehicle_id,
        drivers (
          id,
          name
        ),
        vehicles (
          id,
          registration_number,
          model
        )
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Admin outstation trips error:",
        error
      );

      return res.status(500).json({
        message: "Failed to fetch outstation trips",
      });
    }

    return res.status(200).json({
      trips: trips || [],
    });
  } catch (error) {
    console.error(
      "Get all outstation trips error:",
      error
    );

    return res.status(500).json({
      message: "Failed to fetch outstation trips",
    });
  }
};