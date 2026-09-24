import { createUserSupabaseClient } from "../config/supabaseUser.js";

export const getDashboardOverview = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    /*
    ====================================================
    DATE INFORMATION
    ====================================================
    */

    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const today = now.getDate();

    const daysInMonth = new Date(
      year,
      month,
      0
    ).getDate();

    const todayString =
      `${year}-${String(month).padStart(2, "0")}-${String(today).padStart(2, "0")}`;

    const startOfMonth =
      `${year}-${String(month).padStart(2, "0")}-01`;

    const endOfMonth =
      `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

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
        status,
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
        "Dashboard vehicles error:",
        vehiclesError
      );

      return res.status(500).json({
        message: "Failed to fetch dashboard vehicles",
      });
    }

    /*
    ====================================================
    GET DRIVERS
    ====================================================
    */

    const {
      data: drivers,
      error: driversError,
    } = await userSupabase
      .from("drivers")
      .select(`
        id,
        name,
        status
      `);

    if (driversError) {
      console.error(
        "Dashboard drivers error:",
        driversError
      );

      return res.status(500).json({
        message: "Failed to fetch dashboard drivers",
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
        "Dashboard monthly limits error:",
        limitsError
      );

      return res.status(500).json({
        message:
          "Failed to fetch dashboard monthly limits",
      });
    }

    /*
    ====================================================
    LIMIT LOOKUP
    ====================================================
    */

    const limitMap = {};

    (monthlyLimits || []).forEach((limit) => {
      limitMap[limit.category_id] =
        Number(limit.limit_km || 0);
    });

    /*
    ====================================================
    GET MONTHLY MILEAGE
    ====================================================
    */

    const {
      data: mileageEntries,
      error: mileageError,
    } = await userSupabase
      .from("mileage_entries")
      .select(`
        id,
        vehicle_id,
        driver_id,
        entry_date,
        km_covered,
        trip_type,
        created_at
      `)
      .gte("entry_date", startOfMonth)
      .lte("entry_date", endOfMonth)
      .order("created_at", {
        ascending: false,
      });

    if (mileageError) {
      console.error(
        "Dashboard mileage error:",
        mileageError
      );

      return res.status(500).json({
        message:
          "Failed to fetch dashboard mileage",
      });
    }
/*
====================================================
GET COMPLETED OUTSTATION TRIPS
====================================================
*/

const {
  data: outstationTrips,
  error: outstationError,
} = await userSupabase
  .from("outstation_trips")
  .select(`
    id,
    driver_id,
    vehicle_id,
    entry_date,
    km_covered,
    destination,
    completed_at,
    created_at
  `)
  .eq("status", "completed")
  .gte("entry_date", startOfMonth)
  .lte("entry_date", endOfMonth)
  .order("created_at", {
    ascending: false,
  });

if (outstationError) {
  console.error(
    "Dashboard outstation trips error:",
    outstationError
  );

  return res.status(500).json({
    message:
      "Failed to fetch dashboard outstation trips",
  });
}
    /*
    ====================================================
    KPI — VEHICLE COUNTS
    ====================================================
    */

    const totalVehicles =
      vehicles?.length || 0;

    /*
    ====================================================
    KPI — DRIVER COUNTS
    ====================================================
    */

    const totalDrivers =
      drivers?.length || 0;

    /*
    ====================================================
    MONTHLY MILEAGE MAP
    ====================================================
    */

    const mileageMap = {};

    (mileageEntries || []).forEach((entry) => {
      const vehicleId =
        entry.vehicle_id;

      if (!mileageMap[vehicleId]) {
        mileageMap[vehicleId] = {
          actual: 0,
          today: 0,
          local: 0,
          outstation: 0,
        };
      }

      const km =
        Number(entry.km_covered || 0);

      mileageMap[vehicleId].actual += km;

      if (
        entry.entry_date ===
        todayString
      ) {
        mileageMap[vehicleId].today += km;
      }

      const tripType =
        entry.trip_type
          ?.trim()
          .toLowerCase();

      if (tripType === "local") {
        mileageMap[vehicleId].local += 1;
      }

      if (tripType === "outstation") {
        mileageMap[vehicleId].outstation += 1;
      }
    });
(outstationTrips || []).forEach((trip) => {
  const vehicleId = trip.vehicle_id;

  if (!mileageMap[vehicleId]) {
    mileageMap[vehicleId] = {
      actual: 0,
      today: 0,
      local: 0,
      outstation: 0,
    };
  }

  const km = Number(trip.km_covered || 0);

  mileageMap[vehicleId].actual += km;

  if (trip.entry_date === todayString) {
    mileageMap[vehicleId].today += km;
  }

  mileageMap[vehicleId].outstation += 1;
});
    /*
    ====================================================
    KPI — TOTAL MONTHLY KM
    ====================================================
    */
const monthlyKm =
  (mileageEntries || []).reduce(
    (total, entry) =>
      total + Number(entry.km_covered || 0),
    0
  ) +
  (outstationTrips || []).reduce(
    (total, trip) =>
      total + Number(trip.km_covered || 0),
    0
  );

    /*
    ====================================================
    VEHICLE STATUS
    ====================================================
    */

    const vehicleStatus = {
      active: 0,
      inactive: 0,
      maintenance: 0,
    };

    (vehicles || []).forEach((vehicle) => {
      if (
        vehicleStatus[
          vehicle.status
        ] !== undefined
      ) {
        vehicleStatus[
          vehicle.status
        ] += 1;
      }
    });

    /*
    ====================================================
    MILEAGE UTILIZATION
    ====================================================
    */

    const mileageUtilization =
      (vehicles || [])
        .map((vehicle) => {
          const monthlyLimit =
            limitMap[
              vehicle.category_id
            ] || 0;

          const mileage =
            mileageMap[vehicle.id] || {
              actual: 0,
              today: 0,
              local: 0,
              outstation: 0,
            };

          const percentage =
            monthlyLimit > 0
              ? Number(
                  (
                    (mileage.actual /
                      monthlyLimit) *
                    100
                  ).toFixed(2)
                )
              : 0;

          return {
            vehicle: {
              id: vehicle.id,
              registration_number:
                vehicle.registration_number,
              model: vehicle.model,
            },

            monthlyActual:
              Number(
                mileage.actual.toFixed(2)
              ),

            monthlyLimit,

            percentage,
          };
        })
        /*
        Show vehicles with mileage
        first, then highest utilization.
        */
        .sort(
          (a, b) =>
            b.percentage -
            a.percentage
        );

    /*
    ====================================================
    DRIVERS MISSING TODAY'S MILEAGE
    ====================================================
    */

    const driversWithMileageToday =
      new Set(
        (mileageEntries || [])
          .filter(
            (entry) =>
              entry.entry_date ===
              todayString
          )
          .map(
            (entry) =>
              entry.driver_id
          )
      );

    const activeDrivers =
      (drivers || []).filter(
        (driver) =>
          driver.status === "active"
      );

    const missingMileageDrivers =
      activeDrivers.filter(
        (driver) =>
          !driversWithMileageToday.has(
            driver.id
          )
      );

    /*
 
  /*
====================================================
DAILY MILEAGE LIMIT
====================================================

Daily limit is calculated from the
monthly category limit.

Example:
Monthly limit = 2500 km
Days in month = 31

Daily limit = 2500 / 31
            = 80.65 km
====================================================
*/

const dailyExceededVehicles =
  (vehicles || [])
    .map((vehicle) => {
      const monthlyLimit =
        limitMap[vehicle.category_id] || 0;

      const mileage =
        mileageMap[vehicle.id] || {
          actual: 0,
          today: 0,
          local: 0,
          outstation: 0,
        };

      const dailyLimit =
        monthlyLimit > 0
          ? monthlyLimit / daysInMonth
          : 0;

      return {
        id: vehicle.id,
        registration_number:
          vehicle.registration_number,
        model: vehicle.model,

        todayKm: Number(
          mileage.today.toFixed(2)
        ),

        dailyLimit: Number(
          dailyLimit.toFixed(2)
        ),

        monthlyLimit,
      };
    })
    .filter(
      (vehicle) =>
        vehicle.dailyLimit > 0 &&
        vehicle.todayKm >
          vehicle.dailyLimit
    );


/*
====================================================
MONTHLY MILEAGE LIMIT EXCEEDED
====================================================
*/

/*
====================================================
MONTHLY MILEAGE EXCEEDED
====================================================
*/

const exceededVehicles =
  mileageUtilization.filter(
    (item) =>
      item.monthlyLimit > 0 &&
      item.monthlyActual >
        item.monthlyLimit
  );

const exceededVehicleIds =
  exceededVehicles.map(
    (item) => item.vehicle.id
  );
   /* ====================================================
    ALERTS
    ====================================================
    */

 /*
====================================================
ALERTS
====================================================
*/

const alerts = [];


/*
====================================================
1. DRIVERS MISSING TODAY'S MILEAGE
====================================================
*/

if (
  missingMileageDrivers.length > 0
) {
  alerts.push({
    id: "missing-mileage",

    type: "missing-mileage",

    count:
      missingMileageDrivers.length,

    title:
      "Drivers Missing Mileage",

    description:
      "These drivers have not submitted today's mileage.",

    action:
      "View Drivers",

    driverIds:
      missingMileageDrivers.map(
        (driver) => driver.id
      ),
  });
}


/*
====================================================
2. DAILY MILEAGE LIMIT EXCEEDED
====================================================
*/

if (
  dailyExceededVehicles.length > 0
) {
  alerts.push({
    id: "daily-limit",

    type: "daily-limit",

    count:
      dailyExceededVehicles.length,

    title:
      "Daily Limit Exceeded",

    description:
      "These vehicles have exceeded their allowed mileage for today.",

    action:
      "View Mileage",

    vehicleIds:
      dailyExceededVehicles.map(
        (vehicle) => vehicle.id
      ),
  });
}


/*
====================================================
3. MONTHLY MILEAGE LIMIT EXCEEDED
====================================================
*/

if (
  exceededVehicles.length > 0
) {
  alerts.push({
    id: "monthly-limit",

    type: "monthly-limit",

    count:
      exceededVehicles.length,

    title:
      "Monthly Limit Exceeded",

    description:
      "These vehicles have exceeded their monthly mileage limit.",

    action:
      "View Vehicles",

    vehicleIds:
      exceededVehicles.map(
        (item) => item.vehicle.id
      ),
  });
}

    /*
    ====================================================
    TOTAL ALERTS
    ====================================================
    */

    const totalAlerts =
      alerts.reduce(
        (total, alert) =>
          total +
          Number(alert.count),
        0
      );

    /*
    ====================================================
    RECENT ACTIVITY
    ====================================================

    Use mileage submissions for now.
    Audit logs can be added here next.
    */

  const mileageActivities =
  (mileageEntries || []).map((entry) => {
    const vehicle = vehicles?.find(
      (item) => item.id === entry.vehicle_id
    );

    const driver = drivers?.find(
      (item) => item.id === entry.driver_id
    );

    return {
      id: `mileage-${entry.id}`,
      type: "mileage",
      title: "Mileage Entry Submitted",
      description:
        `${driver?.name || "Driver"} submitted ${Number(
          entry.km_covered || 0
        )} km for ${
          vehicle?.model ||
          vehicle?.registration_number ||
          "vehicle"
        }`,
      date: entry.entry_date,
      createdAt: entry.created_at,

      vehicle: vehicle
        ? {
            id: vehicle.id,
            registration_number:
              vehicle.registration_number,
            model: vehicle.model,
          }
        : null,

      driver: driver
        ? {
            id: driver.id,
            name: driver.name,
          }
        : null,
    };
  });

const outstationActivities =
  (outstationTrips || []).map((trip) => {
    const vehicle = vehicles?.find(
      (item) => item.id === trip.vehicle_id
    );

    const driver = drivers?.find(
      (item) => item.id === trip.driver_id
    );

    return {
      id: `outstation-${trip.id}`,
      type: "outstation",
      title: "Outstation Trip Completed",
      description:
        `${driver?.name || "Driver"} completed ${Number(
          trip.km_covered || 0
        )} km outstation trip to ${
          trip.destination || "destination"
        }`,
      date: trip.entry_date,
      createdAt: trip.completed_at || trip.created_at,

      vehicle: vehicle
        ? {
            id: vehicle.id,
            registration_number:
              vehicle.registration_number,
            model: vehicle.model,
          }
        : null,

      driver: driver
        ? {
            id: driver.id,
            name: driver.name,
          }
        : null,
    };
  });

const recentActivity = [
  ...mileageActivities,
  ...outstationActivities,
]
  .sort(
    (a, b) =>
      new Date(b.createdAt) -
      new Date(a.createdAt)
  )
  .slice(0, 5);

    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return res.status(200).json({
      date: todayString,

      kpis: {
        totalVehicles,
        totalDrivers,
        monthlyKm:
          Number(
            monthlyKm.toFixed(2)
          ),
        alerts: totalAlerts,
      },

      vehicleStatus,

      mileageUtilization,

      alerts,

      recentActivity,
    });

  } catch (error) {
    console.error(
      "Get dashboard overview error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching dashboard overview",
    });
  }
};