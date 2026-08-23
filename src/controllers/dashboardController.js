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

    /*
    ====================================================
    KPI — TOTAL MONTHLY KM
    ====================================================
    */

    const monthlyKm =
      (mileageEntries || []).reduce(
        (total, entry) =>
          total +
          Number(entry.km_covered || 0),
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
    ====================================================
    VEHICLES UNDER MAINTENANCE
    ====================================================
    */

    const maintenanceVehicles =
      (vehicles || []).filter(
        (vehicle) =>
          vehicle.status ===
          "maintenance"
      );

    /*
    ====================================================
    MILEAGE EXCEEDED
    ====================================================
    */

    const exceededVehicles =
      mileageUtilization.filter(
        (item) =>
          item.monthlyLimit > 0 &&
          item.monthlyActual >
            item.monthlyLimit
      );

    /*
    ====================================================
    ALERTS
    ====================================================
    */

    const alerts = [];

    if (
      missingMileageDrivers.length >
      0
    ) {
      alerts.push({
        id: "missing-mileage",
        type: "critical",
        count:
          missingMileageDrivers.length,
        title:
          "Drivers missing mileage",
        description:
          "Today's mileage has not been submitted.",
        action:
          "Review drivers",
      });
    }

    if (
      maintenanceVehicles.length >
      0
    ) {
      alerts.push({
        id: "maintenance",
        type: "warning",
        count:
          maintenanceVehicles.length,
        title:
          "Vehicles under maintenance",
        description:
          "These vehicles are currently unavailable.",
        action:
          "View vehicles",
      });
    }

    if (
      exceededVehicles.length >
      0
    ) {
      alerts.push({
        id: "mileage-exceeded",
        type: "critical",
        count:
          exceededVehicles.length,
        title:
          "Mileage limit exceeded",
        description:
          "Vehicles have exceeded their monthly mileage limit.",
        action:
          "Review mileage",
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

    const recentActivity =
      (mileageEntries || [])
        .slice(0, 5)
        .map((entry) => {
          const vehicle =
            vehicles?.find(
              (item) =>
                item.id ===
                entry.vehicle_id
            );

          const driver =
            drivers?.find(
              (item) =>
                item.id ===
                entry.driver_id
            );

          return {
            id: entry.id,

            type: "mileage",

            title:
              "Mileage Entry Submitted",

            description:
              `${driver?.name || "Driver"} submitted ${Number(entry.km_covered || 0)} km for ${vehicle?.model || vehicle?.registration_number || "vehicle"}`,

            date:
              entry.entry_date,

            createdAt:
              entry.created_at,

            vehicle:
              vehicle
                ? {
                    id: vehicle.id,
                    registration_number:
                      vehicle.registration_number,
                    model:
                      vehicle.model,
                  }
                : null,

            driver:
              driver
                ? {
                    id: driver.id,
                    name:
                      driver.name,
                  }
                : null,
          };
        });

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