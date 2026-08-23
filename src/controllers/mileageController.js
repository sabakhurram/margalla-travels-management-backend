import { createUserSupabaseClient } from "../config/supabaseUser.js";
import PDFDocument from "pdfkit";
import { createAuditLog } from "../utils/auditLogger.js";
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
/*
====================================================
CALCULATE MONTHLY STATUS FOR EACH VEHICLE
====================================================
*/

const today = new Date();

const year = today.getFullYear();
const month = today.getMonth() + 1;

// Get unique vehicle IDs
const vehicleIds = [
  ...new Set(
    (data || []).map((entry) => entry.vehicle_id)
  ),
];

const monthlyStatusMap = {};
const latestEntryMap = {};

for (const vehicleId of vehicleIds) {

  /*
  --------------------------------------------
  Get vehicle category
  --------------------------------------------
  */

  const {
    data: vehicle,
    error: vehicleError,
  } = await userSupabase
    .from("vehicles")
    .select("id, category_id")
    .eq("id", vehicleId)
    .maybeSingle();

  if (vehicleError) {
    console.error(
      "Error fetching vehicle category:",
      vehicleError
    );

    return res.status(500).json({
      message:
        "Failed to fetch vehicle category",
    });
  }

  if (!vehicle) {
    continue;
  }

  /*
  --------------------------------------------
  Get monthly category limit
  --------------------------------------------
  */

  const {
    data: monthlyLimit,
    error: limitError,
  } = await userSupabase
    .from("category_monthly_limits")
    .select("limit_km")
    .eq("category_id", vehicle.category_id)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (limitError) {
    console.error(
      "Error fetching monthly limit:",
      limitError
    );

    return res.status(500).json({
      message:
        "Failed to fetch monthly mileage limit",
    });
  }

  /*
  --------------------------------------------
  Calculate current month's used KM
  --------------------------------------------
  */

  const startOfMonth =
    `${year}-${String(month).padStart(2, "0")}-01`;

  const lastDay = new Date(
    year,
    month,
    0
  ).getDate();

  const endOfMonth =
    `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const {
    data: vehicleMileage,
    error: mileageError,
  } = await userSupabase
    .from("mileage_entries")
    .select("km_covered")
    .eq("vehicle_id", vehicleId)
    .gte("entry_date", startOfMonth)
    .lte("entry_date", endOfMonth);

  if (mileageError) {
    console.error(
      "Error calculating vehicle mileage:",
      mileageError
    );

    return res.status(500).json({
      message:
        "Failed to calculate vehicle mileage",
    });
  }

  const used = (vehicleMileage || []).reduce(
    (total, entry) =>
      total + Number(entry.km_covered || 0),
    0
  );

  const limit = monthlyLimit
    ? Number(monthlyLimit.limit_km)
    : 0;

  const remaining = Math.max(
    limit - used,
    0
  );

  const overLimit = Math.max(
    used - limit,
    0
  );

  const percentage =
    limit > 0
      ? Number(
          ((used / limit) * 100).toFixed(2)
        )
      : 0;

  monthlyStatusMap[vehicleId] = {
    used,
    limit,
    remaining,
    overLimit,
    percentage,
  };
}

/*
====================================================
IDENTIFY LATEST ENTRY FOR EACH VEHICLE
====================================================
*/

(data || []).forEach((entry) => {
  if (!latestEntryMap[entry.vehicle_id]) {
    latestEntryMap[entry.vehicle_id] = entry.id;
  }
});
return res.status(200).json({
  mileage: (data || []).map((entry) => ({
    ...entry,

    monthlyStatus:
      monthlyStatusMap[entry.vehicle_id] || {
        used: 0,
        limit: 0,
        remaining: 0,
        overLimit: 0,
        percentage: 0,
      },

    isLatestEntry:
      latestEntryMap[entry.vehicle_id] === entry.id,
  })),
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
GET MILEAGE MONITORING
====================================================

Returns one row per vehicle with:

- Vehicle
- Driver
- Today's KM
- Daily Expected
- Today's Difference
- Monthly Actual
- Monthly Expected
- Monthly Limit
- Over / Under Expected
- Status
*/

export const getMileageMonitoring = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    /*
    ====================================================
    GET FILTER
    ====================================================

    Supported:

    ?filter=today

    ?filter=month

    ?filter=date&date=2026-08-15
    */

    const {
      filter = "today",
      date,
    } = req.query;

    /*
    ====================================================
    DETERMINE SELECTED DATE
    ====================================================
    */

    const now = new Date();

    let selectedDate;

    if (filter === "date") {
      if (!date) {
        return res.status(400).json({
          message:
            "A date is required when using the date filter",
        });
      }

      /*
      Validate YYYY-MM-DD
      */

      const datePattern =
        /^\d{4}-\d{2}-\d{2}$/;

      if (!datePattern.test(date)) {
        return res.status(400).json({
          message:
            "Date must be in YYYY-MM-DD format",
        });
      }

      selectedDate = new Date(
        `${date}T00:00:00`
      );

      if (Number.isNaN(selectedDate.getTime())) {
        return res.status(400).json({
          message: "Invalid date",
        });
      }

    } else {
      selectedDate = now;
    }

    /*
    ====================================================
    DATE INFORMATION
    ====================================================
    */

    const year = selectedDate.getFullYear();

    const month =
      selectedDate.getMonth() + 1;

    const selectedDay =
      selectedDate.getDate();

    const daysInMonth = new Date(
      year,
      month,
      0
    ).getDate();

    const selectedDateString =
      `${year}-${String(month).padStart(
        2,
        "0"
      )}-${String(selectedDay).padStart(
        2,
        "0"
      )}`;

    const startOfMonth =
      `${year}-${String(month).padStart(
        2,
        "0"
      )}-01`;

    const endOfMonth =
      `${year}-${String(month).padStart(
        2,
        "0"
      )}-${String(daysInMonth).padStart(
        2,
        "0"
      )}`;

    /*
    ====================================================
    GET VEHICLES
    ====================================================
    */

    const {
      data: vehicles,
      error: vehiclesError,
    } = await userSupabase
      .from("vehicles")
      .select(`
        id,
        registration_number,
        model,
        category_id,

        drivers (
          id,
          name
        ),

        categories (
          id,
          name
        )
      `)
      .order("registration_number", {
        ascending: true,
      });

    if (vehiclesError) {
      console.error(
        "Error fetching vehicles for monitoring:",
        vehiclesError
      );

      return res.status(500).json({
        message:
          "Failed to fetch vehicles",
      });
    }

    /*
    ====================================================
    GET MONTHLY LIMITS
    ====================================================
    */

    const {
      data: monthlyLimits,
      error: limitsError,
    } = await userSupabase
      .from("category_monthly_limits")
      .select(`
        category_id,
        limit_km
      `)
      .eq("year", year)
      .eq("month", month);

    if (limitsError) {
      console.error(
        "Error fetching monthly limits:",
        limitsError
      );

      return res.status(500).json({
        message:
          "Failed to fetch monthly mileage limits",
      });
    }

    /*
    ====================================================
    CREATE LIMIT LOOKUP
    ====================================================
    */

    const limitMap = {};

    (monthlyLimits || []).forEach((limit) => {
      limitMap[limit.category_id] =
        Number(limit.limit_km || 0);
    });

    /*
    ====================================================
    GET MILEAGE ENTRIES
    ====================================================

    We fetch the entire selected month because we need:

    - selected day's mileage
    - monthly cumulative mileage
    - trip type statistics
    */

    const {
      data: mileageEntries,
      error: mileageError,
    } = await userSupabase
      .from("mileage_entries")
      .select(`
        vehicle_id,
        entry_date,
        km_covered,
        trip_type
      `)
      .gte(
        "entry_date",
        startOfMonth
      )
      .lte(
        "entry_date",
        endOfMonth
      );

    if (mileageError) {
      console.error(
        "Error fetching mileage entries:",
        mileageError
      );

      return res.status(500).json({
        message:
          "Failed to fetch mileage entries",
      });
    }

    /*
    ====================================================
    CREATE VEHICLE MILEAGE MAP
    ====================================================
    */

    const mileageMap = {};

    (mileageEntries || []).forEach((entry) => {
      const vehicleId =
        entry.vehicle_id;

      if (!mileageMap[vehicleId]) {
        mileageMap[vehicleId] = {
          selectedDayKm: 0,
          monthlyActual: 0,

          selectedDayTrips: {
            local: 0,
            outstation: 0,
          },

          monthlyTrips: {
            local: 0,
            outstation: 0,
          },
        };
      }

      const km =
        Number(entry.km_covered || 0);

      const tripType =
        entry.trip_type
          ?.trim()
          .toLowerCase();

      /*
      --------------------------------------------------
      MONTHLY DATA
      --------------------------------------------------

      For a specific date, we only calculate monthly
      actual UP TO that selected date.

      Example:

      Selected date = August 15

      Monthly actual =
      August 1 → August 15
      */

      const isWithinSelectedPeriod =
        filter === "month"
          ? true
          : entry.entry_date <=
            selectedDateString;

      if (isWithinSelectedPeriod) {
        mileageMap[vehicleId].monthlyActual +=
          km;

        if (tripType === "local") {
          mileageMap[
            vehicleId
          ].monthlyTrips.local += 1;
        }

        if (tripType === "outstation") {
          mileageMap[
            vehicleId
          ].monthlyTrips.outstation += 1;
        }
      }

      /*
      --------------------------------------------------
      SELECTED DAY DATA
      --------------------------------------------------
      */

      if (
        entry.entry_date ===
        selectedDateString
      ) {
        mileageMap[
          vehicleId
        ].selectedDayKm += km;

        if (tripType === "local") {
          mileageMap[
            vehicleId
          ].selectedDayTrips.local += 1;
        }

        if (tripType === "outstation") {
          mileageMap[
            vehicleId
          ].selectedDayTrips.outstation += 1;
        }
      }
    });

    /*
    ====================================================
    BUILD MONITORING DATA
    ====================================================
    */

  const monitoring = (
  vehicles || []
)
  .map((vehicle) => {
      const monthlyLimit =
        limitMap[
          vehicle.category_id
        ] || 0;

      const mileage =
        mileageMap[vehicle.id] || {
          selectedDayKm: 0,
          monthlyActual: 0,

          selectedDayTrips: {
            local: 0,
            outstation: 0,
          },

          monthlyTrips: {
            local: 0,
            outstation: 0,
          },
        };

      /*
      --------------------------------------------------
      DAILY EXPECTED
      --------------------------------------------------
      */

      const dailyExpected =
        monthlyLimit > 0
          ? Number(
              (
                monthlyLimit /
                daysInMonth
              ).toFixed(2)
            )
          : 0;

      /*
      --------------------------------------------------
      SELECTED DAY DIFFERENCE
      --------------------------------------------------
      */

      const selectedDayDifference =
        Number(
          (
            mileage.selectedDayKm -
            dailyExpected
          ).toFixed(2)
        );

      /*
      --------------------------------------------------
      MONTHLY EXPECTED
      --------------------------------------------------

      Today / Selected Date:

      Daily expected × selected day

      Month filter:

      The expected mileage for the full month
      is the monthly limit.
      */

      const monthlyExpected =
        filter === "month"
          ? monthlyLimit
          : Number(
              (
                dailyExpected *
                selectedDay
              ).toFixed(2)
            );

      /*
      --------------------------------------------------
      MONTHLY DIFFERENCE
      --------------------------------------------------
      */

      const monthlyDifference =
        Number(
          (
            mileage.monthlyActual -
            monthlyExpected
          ).toFixed(2)
        );

      /*
      --------------------------------------------------
      REMAINING MONTHLY KM
      --------------------------------------------------
      */

      const remaining =
        Math.max(
          monthlyLimit -
            mileage.monthlyActual,
          0
        );

      /*
      --------------------------------------------------
      EXCEEDED BY
      --------------------------------------------------
      */

      const exceededBy =
        Math.max(
          mileage.monthlyActual -
            monthlyLimit,
          0
        );

      /*
      ==================================================
      STATUS
      ==================================================

      RED
      ----

      Actual monthly mileage has exceeded
      the actual monthly limit.


      ORANGE
      ------

      Either:

      1. Selected day's mileage is above
         daily expected

      OR

      2. Monthly mileage is above
         expected pace.


      GREEN
      -----

      Everything is within expected usage.
      */

      let status = "on_track";

      if (
        monthlyLimit > 0 &&
        mileage.monthlyActual >
          monthlyLimit
      ) {
        status = "exceeded";

      } else if (
        monthlyLimit > 0 &&
        (
          mileage.selectedDayKm >
            dailyExpected ||

          mileage.monthlyActual >
            monthlyExpected
        )
      ) {
        status = "warning";
      }

      /*
      ==================================================
      RETURN VEHICLE DATA
      ==================================================
      */

      return {

        vehicle: {
          id: vehicle.id,
          registration_number:
            vehicle.registration_number,
          model: vehicle.model,
        },

        driver:
          vehicle.drivers
            ? {
                id:
                  vehicle.drivers.id,
                name:
                  vehicle.drivers.name,
              }
            : null,

        category:
          vehicle.categories
            ? {
                id:
                  vehicle.categories.id,
                name:
                  vehicle.categories.name,
              }
            : null,

        /*
        Selected day
        */

        selectedDayKm:
          Number(
            mileage.selectedDayKm.toFixed(
              2
            )
          ),

        dailyExpected,

        selectedDayDifference,

        /*
        Monthly progress
        */

        monthlyActual:
          Number(
            mileage.monthlyActual.toFixed(
              2
            )
          ),

        monthlyExpected,

        monthlyLimit,

        monthlyDifference,

        remaining,

        exceededBy,

        /*
        Trip counts
        */

        selectedDayTrips:
          mileage.selectedDayTrips,

        monthlyTrips:
          mileage.monthlyTrips,

        status,
    };
  })
  .filter((item) => {
    if (filter === "month") {
      return true;
    }

    return item.selectedDayKm > 0;
  });
    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return res.status(200).json({

      filter,

      selectedDate:
        selectedDateString,

      year,
      month,
      day:
        selectedDay,

      daysInMonth,

      monitoring,
    });

  } catch (error) {

    console.error(
      "Get mileage monitoring error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching mileage monitoring",
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
/*
====================================================
GET LOGGED-IN DRIVER'S MILEAGE HISTORY
====================================================
*/

export const getMyMileageHistory = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    /*
    --------------------------------------------
    Find logged-in driver
    --------------------------------------------
    */

    const {
      data: driver,
      error: driverError,
    } = await userSupabase
      .from("drivers")
      .select("id, name")
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

    /*
    --------------------------------------------
    Get this driver's mileage history
    --------------------------------------------
    */

    const {
      data: mileage,
      error: mileageError,
    } = await userSupabase
      .from("mileage_entries")
      .select(`
        id,
        entry_date,
        starting_mileage,
        ending_mileage,
        km_covered,
        trip_type,
        remarks,
        created_at
      `)
      .eq("driver_id", driver.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (mileageError) {
      console.error(
        "Error fetching driver mileage history:",
        mileageError
      );

      return res.status(500).json({
        message:
          "Failed to fetch mileage history",
      });
    }

    return res.status(200).json({
      mileage: mileage || [],
    });

  } catch (error) {
    console.error(
      "Get driver mileage history error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching mileage history",
    });
  }
};
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

    // const kmCovered =
    //   endMileage - startMileage;

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
Check previous mileage entry
--------------------------------------------
*/

const {
  data: previousEntry,
  error: previousEntryError,
} = await userSupabase
  .from("mileage_entries")
  .select(`
    id,
    entry_date,
    starting_mileage,
    ending_mileage
  `)
  .eq("vehicle_id", vehicle.id)
  .order("entry_date", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (previousEntryError) {
  console.error(
    "Error fetching previous mileage entry:",
    previousEntryError
  );

  return res.status(500).json({
    message:
      "Failed to validate previous mileage",
  });
}

/*
--------------------------------------------
Prevent duplicate entry for same date
--------------------------------------------
*/

const {
  data: sameDayEntry,
  error: sameDayError,
} = await userSupabase
  .from("mileage_entries")
  .select("id")
  .eq("vehicle_id", vehicle.id)
  .eq("entry_date", entry_date)
  .maybeSingle();

if (sameDayError) {
  console.error(
    "Error checking same-day mileage:",
    sameDayError
  );

  return res.status(500).json({
    message:
      "Failed to validate mileage date",
  });
}

if (sameDayEntry) {
  return res.status(400).json({
    message:
      "Mileage has already been submitted for this date",
  });
}

/*
--------------------------------------------
Starting mileage must not be lower
than previous ending mileage
--------------------------------------------
*/

if (
  previousEntry &&
  startMileage < Number(previousEntry.ending_mileage)
) {
  return res.status(400).json({
    message:
      `Starting mileage cannot be less than the previous ending mileage (${previousEntry.ending_mileage} KM)`,
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
            // km_covered: kmCovered,
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
await createAuditLog({
  supabase: userSupabase,
  userId: req.user.id,
  action: "CREATE",
  tableName: "mileage_entries",
  recordId: data.id,
  oldValue: null,
  newValue: data,
});
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


/*
====================================================
GET DRIVER DASHBOARD SUMMARY
====================================================

Returns:

- Logged-in driver
- Assigned vehicle
- Current month's mileage limit
- KM used this month
- Remaining KM
- Usage percentage
*/

export const getDriverDashboard = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );
console.log("Authenticated user ID:", req.user.id);
    /*
    --------------------------------------------
    Find logged-in driver
    --------------------------------------------
    */

    const { data: driver, error: driverError } =
      await userSupabase
        .from("drivers")
        .select(`
          id,
          name,
          phone,
          status
        `)
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

    /*
    --------------------------------------------
    Find assigned vehicle + category
    --------------------------------------------
    */

    const { data: vehicle, error: vehicleError } =
      await userSupabase
        .from("vehicles")
        .select(`
          id,
          registration_number,
          model,
          status,
          category_id,

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

    /*
    --------------------------------------------
    If no vehicle is assigned
    --------------------------------------------
    */

    if (!vehicle) {
      return res.status(200).json({
        driver,
        vehicle: null,
        monthlyMileage: null,
      });
    }

    /*
    --------------------------------------------
    Get current year and month
    --------------------------------------------
    */

    const today = new Date();

    const year = today.getFullYear();

    // JavaScript months are 0–11
    // Database month should be 1–12
    const month = today.getMonth() + 1;

    /*
    --------------------------------------------
    Get monthly limit for vehicle category
    --------------------------------------------
    */

    const {
      data: monthlyLimit,
      error: limitError,
    } = await userSupabase
      .from("category_monthly_limits")
      .select(`
        id,
        year,
        month,
       limit_km
      `)
      .eq("category_id", vehicle.category_id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (limitError) {
      console.error(
        "Error fetching monthly limit:",
        limitError
      );

      return res.status(500).json({
        message: "Failed to fetch monthly mileage limit",
      });
    }
console.log("Monthly limit query result:", {
  monthlyLimit,
  limitError,
  categoryId: vehicle.category_id,
  year,
  month,
});
    /*
    --------------------------------------------
    Calculate start and end of current month
    --------------------------------------------
    */

    const startOfMonth =
      `${year}-${String(month).padStart(2, "0")}-01`;

    const lastDay = new Date(
      year,
      month,
      0
    ).getDate();

    const endOfMonth =
      `${year}-${String(month).padStart(
        2,
        "0"
      )}-${String(lastDay).padStart(2, "0")}`;

    /*
    --------------------------------------------
    Get this month's mileage entries
    for the assigned vehicle
    --------------------------------------------
    */

   const {
  data: mileageEntries,
  error: mileageError,
} = await userSupabase
  .from("mileage_entries")
  .select(`
    id,
    entry_date,
    starting_mileage,
    ending_mileage,
    km_covered,
    trip_type,
    remarks
  `)
  .eq("vehicle_id", vehicle.id)
  .gte("entry_date", startOfMonth)
  .lte("entry_date", endOfMonth)
  .order("entry_date", { ascending: false });

    if (mileageError) {
      console.error(
        "Error fetching monthly mileage:",
        mileageError
      );

      return res.status(500).json({
        message:
          "Failed to calculate monthly mileage",
      });
    }
    const {
  data: latestMileageEntry,
  error: latestMileageError,
} = await userSupabase
  .from("mileage_entries")
  .select(`
    id,
    entry_date,
    starting_mileage,
    ending_mileage
  `)
  .eq("vehicle_id", vehicle.id)
  .order("entry_date", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (latestMileageError) {
  console.error(
    "Error fetching latest mileage entry:",
    latestMileageError
  );

  return res.status(500).json({
    message:
      "Failed to fetch latest mileage entry",
  });
}

const startingOdometer =
  latestMileageEntry
    ? Number(latestMileageEntry.ending_mileage)
    : null;

    console.log("Starting odometer:", startingOdometer);
console.log("Latest mileage entry:", latestMileageEntry);
    /*
    --------------------------------------------
    Calculate used mileage
    --------------------------------------------
    */

    const used = (mileageEntries || []).reduce(
      (total, entry) =>
        total + Number(entry.km_covered || 0),
      0
    );

    /*
    --------------------------------------------
    Monthly limit
    --------------------------------------------
    */

    const limit = monthlyLimit
      ? Number(monthlyLimit.limit_km)
      : 0;

    const remaining = Math.max(
      limit - used,
      0
    );

    const percentage =
      limit > 0
        ? Number(
            ((used / limit) * 100).toFixed(2)
          )
        : 0;

    /*
    --------------------------------------------
    Return dashboard data
    --------------------------------------------
    */
return res.status(200).json({
  driver,
  vehicle,
  monthlyMileage: {
    year,
    month,
    limit,
    used,
    remaining,
    percentage,
  },
  startingOdometer,
});
  } catch (error) {
    console.error(
      "Get driver dashboard error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching driver dashboard",
    });
  }
};

export const getMonthlyMileageReport = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    /*
    --------------------------------------------
    Current month
    --------------------------------------------
    */

const today = new Date();

const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;

const requestedYear = Number(req.query.year);
const requestedMonth = Number(req.query.month);

const year =
  requestedYear || currentYear;

const month =
  requestedMonth || currentMonth;

    const daysInMonth = new Date(
      year,
      month,
      0
    ).getDate();
const isCurrentMonth =
  year === currentYear &&
  month === currentMonth;

const currentDay = isCurrentMonth
  ? today.getDate()
  : daysInMonth;

    const startOfMonth =
      `${year}-${String(month).padStart(2, "0")}-01`;

    const endOfMonth =
      `${year}-${String(month).padStart(2, "0")}-${String(
        daysInMonth
      ).padStart(2, "0")}`;

    /*
    --------------------------------------------
    Get vehicles
    --------------------------------------------
    */

    const {
      data: vehicles,
      error: vehiclesError,
    } = await userSupabase
      .from("vehicles")
      .select(`
        id,
        registration_number,
        model,
        category_id,

        drivers (
          id,
          name
        ),

        categories (
          id,
          name
        )
      `)
      .order("registration_number", {
        ascending: true,
      });

    if (vehiclesError) {
      console.error(
        "Monthly report vehicles error:",
        vehiclesError
      );

      return res.status(500).json({
        message: "Failed to fetch vehicles",
      });
    }

    /*
    --------------------------------------------
    Get monthly limits
    --------------------------------------------
    */

    const {
      data: monthlyLimits,
      error: limitsError,
    } = await userSupabase
      .from("category_monthly_limits")
      .select(`
        category_id,
        limit_km
      `)
      .eq("year", year)
      .eq("month", month);

    if (limitsError) {
      console.error(
        "Monthly report limits error:",
        limitsError
      );

      return res.status(500).json({
        message: "Failed to fetch monthly limits",
      });
    }

    /*
    --------------------------------------------
    Create limit lookup
    --------------------------------------------
    */

    const limitMap = {};

    (monthlyLimits || []).forEach((limit) => {
      limitMap[limit.category_id] =
        Number(limit.limit_km || 0);
    });

    /*
    --------------------------------------------
    Get mileage entries
    --------------------------------------------
    */

    const {
      data: mileageEntries,
      error: mileageError,
    } = await userSupabase
      .from("mileage_entries")
      .select(`
        vehicle_id,
        km_covered,
        trip_type
      `)
      .gte("entry_date", startOfMonth)
      .lte("entry_date", endOfMonth);

    if (mileageError) {
      console.error(
        "Monthly report mileage error:",
        mileageError
      );

      return res.status(500).json({
        message: "Failed to fetch mileage entries",
      });
    }

    /*
    --------------------------------------------
    Build mileage summary
    --------------------------------------------
    */

    const mileageMap = {};

    (mileageEntries || []).forEach((entry) => {
      const vehicleId = entry.vehicle_id;

      if (!mileageMap[vehicleId]) {
        mileageMap[vehicleId] = {
          monthlyActual: 0,
          localTrips: 0,
          outstationTrips: 0,
        };
      }

      const km = Number(
        entry.km_covered || 0
      );

      mileageMap[vehicleId].monthlyActual += km;

      if (entry.trip_type === "local") {
        mileageMap[vehicleId].localTrips += 1;
      }

      if (entry.trip_type === "outstation") {
        mileageMap[vehicleId].outstationTrips += 1;
      }
    });

    /*
    --------------------------------------------
    Build report
    --------------------------------------------
    */

    const report = (vehicles || []).map(
      (vehicle) => {
        const monthlyLimit =
          limitMap[vehicle.category_id] || 0;

        const mileage =
          mileageMap[vehicle.id] || {
            monthlyActual: 0,
            localTrips: 0,
            outstationTrips: 0,
          };

        /*
        Monthly expected mileage
        based on current day
        */

        const dailyExpected =
          monthlyLimit > 0
            ? monthlyLimit / daysInMonth
            : 0;

        const monthlyExpected =
          dailyExpected * currentDay;

        /*
        Difference from expected pace
        */

        const difference =
          mileage.monthlyActual -
          monthlyExpected;

        /*
        Remaining monthly limit
        */

        const remaining =
          Math.max(
            monthlyLimit -
              mileage.monthlyActual,
            0
          );

        /*
        Exceeded amount
        */

        const exceededBy =
          Math.max(
            mileage.monthlyActual -
              monthlyLimit,
            0
          );

        /*
        Status
        */

        let status = "on_track";

        if (
          monthlyLimit > 0 &&
          mileage.monthlyActual >
            monthlyLimit
        ) {
          status = "exceeded";
        } else if (
          monthlyLimit > 0 &&
          mileage.monthlyActual >
            monthlyExpected
        ) {
          status = "warning";
        }

        return {
          vehicle: {
            id: vehicle.id,
            registration_number:
              vehicle.registration_number,
            model: vehicle.model,
          },

          driver: vehicle.drivers
            ? {
                id: vehicle.drivers.id,
                name: vehicle.drivers.name,
              }
            : null,

          category: vehicle.categories
            ? {
                id: vehicle.categories.id,
                name: vehicle.categories.name,
              }
            : null,

          monthlyActual: Number(
            mileage.monthlyActual.toFixed(2)
          ),

          monthlyExpected: Number(
            monthlyExpected.toFixed(2)
          ),

          monthlyLimit: Number(
            monthlyLimit.toFixed(2)
          ),

          difference: Number(
            difference.toFixed(2)
          ),

          remaining: Number(
            remaining.toFixed(2)
          ),

          exceededBy: Number(
            exceededBy.toFixed(2)
          ),

          trips: {
            local: mileage.localTrips,
            outstation:
              mileage.outstationTrips,
            total:
              mileage.localTrips +
              mileage.outstationTrips,
          },

          status,
        };
      }
    );

    /*
    --------------------------------------------
    Overall report totals
    --------------------------------------------
    */

    const totalActual = report.reduce(
      (total, item) =>
        total + item.monthlyActual,
      0
    );

    const totalExpected = report.reduce(
      (total, item) =>
        total + item.monthlyExpected,
      0
    );

    const totalLimit = report.reduce(
      (total, item) =>
        total + item.monthlyLimit,
      0
    );

    const totalVehicles = report.length;

    const exceededVehicles = report.filter(
      (item) =>
        item.status === "exceeded"
    ).length;

    const warningVehicles = report.filter(
      (item) =>
        item.status === "warning"
    ).length;

    const onTrackVehicles = report.filter(
      (item) =>
        item.status === "on_track"
    ).length;

    return res.status(200).json({
      year,
      month,
      currentDay,
      daysInMonth,

      summary: {
        totalVehicles,
        totalActual: Number(
          totalActual.toFixed(2)
        ),
        totalExpected: Number(
          totalExpected.toFixed(2)
        ),
        totalLimit: Number(
          totalLimit.toFixed(2)
        ),
        difference: Number(
          (totalActual - totalExpected).toFixed(2)
        ),
        exceededVehicles,
        warningVehicles,
        onTrackVehicles,
      },

      report,
    });

  } catch (error) {
    console.error(
      "Get monthly mileage report error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while generating monthly mileage report",
    });
  }
};
export const generateMonthlyMileageReportPDF = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const year = Number(req.query.year);
    const month = Number(req.query.month);

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        message: "Valid year and month are required",
      });
    }

    /*
    --------------------------------------------
    Date information
    --------------------------------------------
    */

    const daysInMonth = new Date(
      year,
      month,
      0
    ).getDate();

    const currentDate = new Date();

    const isCurrentMonth =
      year === currentDate.getFullYear() &&
      month === currentDate.getMonth() + 1;

    const currentDay = isCurrentMonth
      ? currentDate.getDate()
      : daysInMonth;

    const startOfMonth =
      `${year}-${String(month).padStart(2, "0")}-01`;

    const endOfMonth =
      `${year}-${String(month).padStart(2, "0")}-${String(
        daysInMonth
      ).padStart(2, "0")}`;

    /*
    --------------------------------------------
    Month name
    --------------------------------------------
    */

    const monthName = new Date(
      year,
      month - 1,
      1
    ).toLocaleString("en-US", {
      month: "long",
    });

    /*
    --------------------------------------------
    Get vehicles
    --------------------------------------------
    */

    const {
      data: vehicles,
      error: vehiclesError,
    } = await userSupabase
      .from("vehicles")
      .select(`
        id,
        registration_number,
        model,
        category_id,

        drivers (
          id,
          name
        ),

        categories (
          id,
          name
        )
      `)
      .order("registration_number", {
        ascending: true,
      });

    if (vehiclesError) {
      console.error(
        "PDF vehicles error:",
        vehiclesError
      );

      return res.status(500).json({
        message: "Failed to fetch vehicles",
      });
    }

    /*
    --------------------------------------------
    Monthly limits
    --------------------------------------------
    */

    const {
      data: monthlyLimits,
      error: limitsError,
    } = await userSupabase
      .from("category_monthly_limits")
      .select(`
        category_id,
        limit_km
      `)
      .eq("year", year)
      .eq("month", month);

    if (limitsError) {
      console.error(
        "PDF monthly limits error:",
        limitsError
      );

      return res.status(500).json({
        message: "Failed to fetch monthly limits",
      });
    }

    const limitMap = {};

    (monthlyLimits || []).forEach((limit) => {
      limitMap[limit.category_id] =
        Number(limit.limit_km || 0);
    });

    /*
    --------------------------------------------
    Mileage entries
    --------------------------------------------
    */

    const {
      data: mileageEntries,
      error: mileageError,
    } = await userSupabase
      .from("mileage_entries")
      .select(`
        vehicle_id,
        entry_date,
        km_covered,
        trip_type
      `)
      .gte("entry_date", startOfMonth)
      .lte("entry_date", endOfMonth);

    if (mileageError) {
      console.error(
        "PDF mileage error:",
        mileageError
      );

      return res.status(500).json({
        message: "Failed to fetch mileage",
      });
    }

    /*
    --------------------------------------------
    Build mileage map
    --------------------------------------------
    */

    const mileageMap = {};

    (mileageEntries || []).forEach((entry) => {
      const vehicleId = entry.vehicle_id;

      if (!mileageMap[vehicleId]) {
        mileageMap[vehicleId] = {
          actual: 0,
          local: 0,
          outstation: 0,
        };
      }

      mileageMap[vehicleId].actual +=
        Number(entry.km_covered || 0);

      if (entry.trip_type === "local") {
        mileageMap[vehicleId].local += 1;
      }

      if (entry.trip_type === "outstation") {
        mileageMap[vehicleId].outstation += 1;
      }
    });

    /*
    --------------------------------------------
    Build report
    --------------------------------------------
    */

    const report = (vehicles || []).map(
      (vehicle) => {
        const monthlyLimit =
          limitMap[vehicle.category_id] || 0;

        const mileage =
          mileageMap[vehicle.id] || {
            actual: 0,
            local: 0,
            outstation: 0,
          };

        const dailyExpected =
          monthlyLimit > 0
            ? monthlyLimit / daysInMonth
            : 0;

        const monthlyExpected =
          dailyExpected * currentDay;

        const difference =
          mileage.actual - monthlyExpected;

        const remaining = Math.max(
          monthlyLimit - mileage.actual,
          0
        );

        const exceededBy = Math.max(
          mileage.actual - monthlyLimit,
          0
        );

        let status = "on_track";

        if (
          monthlyLimit > 0 &&
          mileage.actual > monthlyLimit
        ) {
          status = "exceeded";
        } else if (
          monthlyLimit > 0 &&
          mileage.actual > monthlyExpected
        ) {
          status = "warning";
        }

        return {
          vehicle,
          driver: vehicle.drivers || null,
          category: vehicle.categories || null,

          monthlyActual: Number(
            mileage.actual.toFixed(2)
          ),

          monthlyExpected: Number(
            monthlyExpected.toFixed(2)
          ),

          monthlyLimit,

          difference: Number(
            difference.toFixed(2)
          ),

          remaining,

          exceededBy,

          trips: {
            local: mileage.local,
            outstation: mileage.outstation,
            total:
              mileage.local +
              mileage.outstation,
          },

          status,
        };
      }
    );

    /*
    --------------------------------------------
    Summary
    --------------------------------------------
    */

    const totalVehicles = report.length;

    const totalActual = report.reduce(
      (total, item) =>
        total + item.monthlyActual,
      0
    );

    const totalExpected = report.reduce(
      (total, item) =>
        total + item.monthlyExpected,
      0
    );

    const totalLimit = report.reduce(
      (total, item) =>
        total + item.monthlyLimit,
      0
    );

    const exceededVehicles =
      report.filter(
        (item) => item.status === "exceeded"
      ).length;

    /*
    --------------------------------------------
    PDF response
    --------------------------------------------
    */

    const fileName =
      `Margalla-Travels-Mileage-Report-${monthName}-${year}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    /*
    --------------------------------------------
    Create PDF
    --------------------------------------------
    */

    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
    });

    doc.pipe(res);

    /*
    --------------------------------------------
    Header
    --------------------------------------------
    */

    doc
      .fontSize(20)
      .fillColor("#17324d")
      .font("Helvetica-Bold")
      .text("MARGALLA TRAVELS");

    doc
      .moveDown(0.3)
      .fontSize(16)
      .fillColor("#0797a8")
      .text("Monthly Mileage Report");

    doc
      .moveDown(0.3)
      .fontSize(11)
      .fillColor("#718096")
      .font("Helvetica")
      .text(`${monthName} ${year}`);

    doc.moveDown(1);

    /*
    --------------------------------------------
    Summary
    --------------------------------------------
    */

    doc
      .fontSize(13)
      .fillColor("#17324d")
      .font("Helvetica-Bold")
      .text("Report Summary");

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#425466");

    doc.text(
      `Total Vehicles: ${totalVehicles}`
    );

    doc.text(
      `Total Actual KM: ${totalActual.toLocaleString()} km`
    );

    doc.text(
      `Total Expected KM: ${totalExpected.toLocaleString()} km`
    );

    doc.text(
      `Total Monthly Limit: ${totalLimit.toLocaleString()} km`
    );

    doc.text(
      `Exceeded Vehicles: ${exceededVehicles}`
    );

    doc.moveDown(1);

    /*
--------------------------------------------
Vehicle details
--------------------------------------------
*/

doc
  .fontSize(13)
  .fillColor("#17324d")
  .font("Helvetica-Bold")
  .text("Vehicle Mileage Details");

doc.moveDown(0.5);

/*
--------------------------------------------
Table configuration
--------------------------------------------
*/

const tableLeft = 40;
const tableWidth = 510;

const headerHeight = 24;
const rowHeight = 32;

const pageBottom = 780;
const footerSpace = 35;
const rowBottomLimit = pageBottom - footerSpace;

/*
--------------------------------------------
Table columns
--------------------------------------------
*/

const columns = [
  {
    title: "Vehicle",
    x: 40,
    width: 75,
  },
  {
    title: "Driver",
    x: 115,
    width: 65,
  },
  {
    title: "Actual",
    x: 180,
    width: 55,
  },
  {
    title: "Expected",
    x: 235,
    width: 60,
  },
  {
    title: "Limit",
    x: 295,
    width: 55,
  },
  {
    title: "Diff.",
    x: 350,
    width: 55,
  },
  {
    title: "Trips",
    x: 405,
    width: 45,
  },
  {
    title: "Status",
    x: 450,
    width: 100,
  },
];

/*
--------------------------------------------
Draw table header
--------------------------------------------
*/

const drawTableHeader = () => {
  const headerY = doc.y;

  doc
    .rect(
      tableLeft,
      headerY - 4,
      tableWidth,
      headerHeight
    )
    .fill("#f1f6f8");

  columns.forEach((column) => {
    doc
      .fontSize(8)
      .fillColor("#526174")
      .font("Helvetica-Bold")
      .text(
        column.title,
        column.x + 4,
        headerY + 3,
        {
          width: column.width - 8,
        }
      );
  });

  return headerY + headerHeight + 3;
};

/*
--------------------------------------------
Initial table header
--------------------------------------------
*/

let rowY = drawTableHeader();

/*
--------------------------------------------
Table rows
--------------------------------------------
*/

report.forEach((item, index) => {

  /*
  ------------------------------------------
  Check if next row fits on current page
  ------------------------------------------
  */

  if (rowY + rowHeight > rowBottomLimit) {

    /*
    Add new page
    */

    doc.addPage();

    /*
    Reset position
    */

    doc.y = 50;

    /*
    Draw table header again
    */

    rowY = drawTableHeader();

  }


  /*
  ------------------------------------------
  Alternate row background
  ------------------------------------------
  */

  if (index % 2 === 0) {

    doc
      .rect(
        tableLeft,
        rowY - 4,
        tableWidth,
        rowHeight
      )
      .fill("#fafcfd");

  }


  /*
  ------------------------------------------
  Vehicle
  ------------------------------------------
  */

  const vehicleName =
    item.vehicle?.registration_number ||
    "—";


  /*
  ------------------------------------------
  Driver
  ------------------------------------------
  */

  const driverName =
    item.driver?.name ||
    "Unassigned";


  /*
  ------------------------------------------
  Status
  ------------------------------------------
  */

  const statusLabel =
    item.status === "exceeded"
      ? "Exceeded"
      : item.status === "warning"
      ? "Warning"
      : "On Track";


  const statusColor =
    item.status === "exceeded"
      ? "#c53030"
      : item.status === "warning"
      ? "#c05621"
      : "#078a76";


  /*
  ------------------------------------------
  Base text styling
  ------------------------------------------
  */

  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#425466");


  /*
  ------------------------------------------
  Vehicle
  ------------------------------------------
  */

  doc.text(
    vehicleName,
    44,
    rowY,
    {
      width: 67,
    }
  );


  /*
  ------------------------------------------
  Driver
  ------------------------------------------
  */

  doc.text(
    driverName,
    119,
    rowY,
    {
      width: 57,
    }
  );


  /*
  ------------------------------------------
  Actual
  ------------------------------------------
  */

  doc.text(
    `${item.monthlyActual}`,
    184,
    rowY,
    {
      width: 47,
    }
  );


  /*
  ------------------------------------------
  Expected
  ------------------------------------------
  */

  doc.text(
    `${item.monthlyExpected}`,
    239,
    rowY,
    {
      width: 52,
    }
  );


  /*
  ------------------------------------------
  Limit
  ------------------------------------------
  */

  doc.text(
    `${item.monthlyLimit}`,
    299,
    rowY,
    {
      width: 47,
    }
  );


  /*
  ------------------------------------------
  Difference
  ------------------------------------------
  */

  doc.text(
    `${
      item.difference > 0
        ? "+"
        : ""
    }${item.difference}`,
    354,
    rowY,
    {
      width: 47,
    }
  );


  /*
  ------------------------------------------
  Trips
  ------------------------------------------
  */

  doc.text(
    `${item.trips.total}`,
    409,
    rowY,
    {
      width: 37,
    }
  );


  /*
  ------------------------------------------
  Status
  ------------------------------------------
  */

  doc
    .fillColor(statusColor)
    .font("Helvetica-Bold")
    .text(
      statusLabel,
      454,
      rowY,
      {
        width: 92,
      }
    );


  /*
  ------------------------------------------
  Move to next row
  ------------------------------------------
  */

  rowY += rowHeight;

});

    /*
    --------------------------------------------
    Footer
    --------------------------------------------
    */

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#8793a2")
      .text(
        `Generated by Margalla Travels Management System • ${new Date().toLocaleDateString()}`,
        40,
        780,
        {
          align: "center",
          width: 510,
        }
      );

    doc.end();

  } catch (error) {
    console.error(
      "Generate mileage PDF error:",
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        message:
          "Failed to generate mileage report",
      });
    }
  }
};