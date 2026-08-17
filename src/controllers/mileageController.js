import { createUserSupabaseClient } from "../config/supabaseUser.js";


export const getMileageEntries = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const { data, error } = await userSupabase
      .from("mileage_entries")
      .select(`
        id,
        vehicle_id,
        driver_id,
        entry_date,
        starting_mileage,
        ending_mileage,
        km_covered,
        trip_type,
        remarks,
        created_by,
        created_at,
        updated_at,

        vehicles (
          id,
          registration_number,
          model
        ),

        drivers (
          id,
          name
        )
      `)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Error fetching mileage entries:",
        error
      );

      return res.status(500).json({
        message: "Failed to fetch mileage entries",
      });
    }

    return res.status(200).json({
      mileage: data || [],
    });
  } catch (error) {
    console.error(
      "Get mileage entries error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching mileage entries",
    });
  }
};


/*
====================================================
GET DRIVER'S ASSIGNED VEHICLE
====================================================
Used by the driver dashboard.

We identify the driver through:

auth.uid()
    ↓
drivers.user_id
    ↓
drivers.id
    ↓
vehicles.assigned_driver_id
*/

export const getMyVehicle = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const { data: driver, error: driverError } =
      await userSupabase
        .from("drivers")
        .select("id, name, phone, status")
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (driverError) {
      console.error(
        "Error finding driver:",
        driverError
      );

      return res.status(500).json({
        message: "Failed to find driver",
      });
    }

    if (!driver) {
      return res.status(404).json({
        message: "Driver profile not found",
      });
    }

    const { data: vehicle, error: vehicleError } =
      await userSupabase
        .from("vehicles")
        .select(`
          id,
          registration_number,
          model,
          status,
          categories (
            id,
            name
          )
        `)
        .eq("assigned_driver_id", driver.id)
        .maybeSingle();

    if (vehicleError) {
      console.error(
        "Error finding assigned vehicle:",
        vehicleError
      );

      return res.status(500).json({
        message: "Failed to fetch assigned vehicle",
      });
    }

    return res.status(200).json({
      driver,
      vehicle: vehicle || null,
    });
  } catch (error) {
    console.error(
      "Get my vehicle error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching assigned vehicle",
    });
  }
};


/*
====================================================
CREATE MILEAGE ENTRY
====================================================

The frontend sends ONLY:

entry_date
starting_mileage
ending_mileage
trip_type
remarks

The backend determines:

driver_id
vehicle_id
created_by
km_covered
*/

export const createMileageEntry = async (req, res) => {
  try {
    const {
      entry_date,
      starting_mileage,
      ending_mileage,
      trip_type,
      remarks,
    } = req.body;

    /*
    --------------------------------------------
    Validate basic fields
    --------------------------------------------
    */

    if (!entry_date) {
      return res.status(400).json({
        message: "Entry date is required",
      });
    }

    if (
      starting_mileage === undefined ||
      starting_mileage === null ||
      starting_mileage === ""
    ) {
      return res.status(400).json({
        message: "Starting mileage is required",
      });
    }

    if (
      ending_mileage === undefined ||
      ending_mileage === null ||
      ending_mileage === ""
    ) {
      return res.status(400).json({
        message: "Ending mileage is required",
      });
    }

    if (!trip_type || !trip_type.trim()) {
      return res.status(400).json({
        message: "Trip type is required",
      });
    }

    /*
    --------------------------------------------
    Convert mileage to numbers
    --------------------------------------------
    */

    const startMileage = Number(
      starting_mileage
    );

    const endMileage = Number(
      ending_mileage
    );

    if (
      !Number.isInteger(startMileage) ||
      !Number.isInteger(endMileage)
    ) {
      return res.status(400).json({
        message:
          "Mileage values must be whole numbers",
      });
    }

    if (startMileage < 0 || endMileage < 0) {
      return res.status(400).json({
        message:
          "Mileage values cannot be negative",
      });
    }

    /*
    --------------------------------------------
    Ending mileage cannot be smaller
    --------------------------------------------
    */

    if (endMileage < startMileage) {
      return res.status(400).json({
        message:
          "Ending mileage cannot be less than starting mileage",
      });
    }

    /*
    --------------------------------------------
    Calculate KM automatically
    --------------------------------------------
    */

    const kmCovered =
      endMileage - startMileage;

    const userSupabase =
      createUserSupabaseClient(
        req.accessToken
      );

    /*
    --------------------------------------------
    Find logged-in driver
    --------------------------------------------
    */

    const { data: driver, error: driverError } =
      await userSupabase
        .from("drivers")
        .select("id, name, status")
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (driverError) {
      console.error(
        "Error finding driver:",
        driverError
      );

      return res.status(500).json({
        message: "Failed to find driver",
      });
    }

    if (!driver) {
      return res.status(404).json({
        message:
          "Driver profile not found",
      });
    }

    /*
    --------------------------------------------
    Driver must be active
    --------------------------------------------
    */

    if (driver.status !== "active") {
      return res.status(403).json({
        message:
          "Your driver account is inactive",
      });
    }

    /*
    --------------------------------------------
    Find driver's assigned vehicle
    --------------------------------------------
    */

    const {
      data: vehicle,
      error: vehicleError,
    } = await userSupabase
      .from("vehicles")
      .select(`
        id,
        registration_number,
        model,
        status
      `)
      .eq("assigned_driver_id", driver.id)
      .maybeSingle();

    if (vehicleError) {
      console.error(
        "Error finding assigned vehicle:",
        vehicleError
      );

      return res.status(500).json({
        message:
          "Failed to find assigned vehicle",
      });
    }

    if (!vehicle) {
      return res.status(400).json({
        message:
          "No vehicle is currently assigned to you",
      });
    }

    /*
    --------------------------------------------
    Vehicle must be active
    --------------------------------------------
    */

    if (vehicle.status !== "active") {
      return res.status(400).json({
        message:
          "Your assigned vehicle is not active",
      });
    }

    /*
    --------------------------------------------
    Insert mileage entry
    --------------------------------------------
    */

    const { data, error } =
      await userSupabase
        .from("mileage_entries")
        .insert([
          {
            vehicle_id: vehicle.id,
            driver_id: driver.id,
            entry_date,
            starting_mileage: startMileage,
            ending_mileage: endMileage,
            km_covered: kmCovered,
            trip_type:
              trip_type.trim(),
            remarks:
              remarks?.trim() || null,
            created_by: req.user.id,
          },
        ])
        .select(`
          id,
          vehicle_id,
          driver_id,
          entry_date,
          starting_mileage,
          ending_mileage,
          km_covered,
          trip_type,
          remarks,
          created_by,
          created_at,
          updated_at,

          vehicles (
            id,
            registration_number,
            model
          ),

          drivers (
            id,
            name
          )
        `)
        .single();

    if (error) {
      console.error(
        "Error creating mileage entry:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to create mileage entry",
      });
    }

    return res.status(201).json({
      message:
        "Mileage entry created successfully",
      mileage: data,
    });
  } catch (error) {
    console.error(
      "Create mileage entry error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while creating mileage entry",
    });
  }
};