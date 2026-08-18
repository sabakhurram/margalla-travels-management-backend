import { createUserSupabaseClient } from "../config/supabaseUser.js";

export const getCategories = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(req.accessToken);

    const { data, error } = await userSupabase
      .from("categories")
      .select(`
        id,
        name,
        created_at
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching categories:", error);

      return res.status(500).json({
        message: "Failed to fetch categories",
      });
    }

    res.status(200).json({
      categories: data,
    });
  } catch (error) {
    console.error("Get categories error:", error);

    res.status(500).json({
      message: "Server error while fetching categories",
    });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Category name is required",
      });
    }

    const userSupabase = createUserSupabaseClient(req.accessToken);

    const { data: existingCategory, error: existingError } =
      await userSupabase
        .from("categories")
        .select("id")
        .ilike("name", name.trim())
        .maybeSingle();

    if (existingError) {
      console.error("Error checking category:", existingError);

      return res.status(500).json({
        message: "Failed to check category",
      });
    }

    if (existingCategory) {
      return res.status(409).json({
        message: "Category already exists",
      });
    }

    const { data, error } = await userSupabase
      .from("categories")
      .insert([
        {
          name: name.trim(),
        },
      ])
      .select(`
        id,
        name,
        created_at
      `)
      .single();

    if (error) {
      console.error("Error creating category:", error);

      return res.status(500).json({
        message: "Failed to create category",
      });
    }

    res.status(201).json({
      message: "Category created successfully",
      category: data,
    });
  } catch (error) {
    console.error("Create category error:", error);

    res.status(500).json({
      message: "Server error while creating category",
    });
  }
};
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Category ID is required",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Category name is required",
      });
    }

    const userSupabase = createUserSupabaseClient(req.accessToken);

    // Check if another category already has this name
    const { data: existingCategory, error: existingError } =
      await userSupabase
        .from("categories")
        .select("id, name")
        .ilike("name", name.trim())
        .neq("id", id)
        .maybeSingle();

    if (existingError) {
      console.error(
        "Error checking existing category:",
        existingError
      );

      return res.status(500).json({
        message: "Failed to check category",
      });
    }

    if (existingCategory) {
      return res.status(409).json({
        message: "Category already exists",
      });
    }

    // Update category
    const { data, error } = await userSupabase
      .from("categories")
      .update({
        name: name.trim(),
      })
      .eq("id", id)
      .select(`
        id,
        name,
        created_at
      `)
      .single();

    if (error) {
      console.error("Error updating category:", error);

      return res.status(500).json({
        message: "Failed to update category",
      });
    }

    res.status(200).json({
      message: "Category updated successfully",
      category: data,
    });
  } catch (error) {
    console.error("Update category error:", error);

    res.status(500).json({
      message: "Server error while updating category",
    });
  }
};
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Category ID is required",
      });
    }

    const userSupabase = createUserSupabaseClient(req.accessToken);

    const { data, error } = await userSupabase
      .from("categories")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      console.error("Error deleting category:", error);

      return res.status(500).json({
        message: "Failed to delete category",
      });
    }

    if (!data) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    res.status(200).json({
      message: "Category deleted successfully",
      categoryId: data.id,
    });
  } catch (error) {
    console.error("Delete category error:", error);

    res.status(500).json({
      message: "Server error while deleting category",
    });
  }
};
export const getMonthlyLimit = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(req.accessToken);

    const { id } = req.params;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        message: "Year and month are required",
      });
    }

    const { data, error } = await userSupabase
      .from("category_monthly_limits")
      .select(`
        id,
        category_id,
        year,
        month,
        limit_km ,
        created_at
      `)
      .eq("category_id", id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (error) {
      console.error("Get monthly limit error:", error);

      return res.status(500).json({
        message: "Failed to fetch monthly limit",
      });
    }

    return res.status(200).json({
      monthlyLimit: data,
    });
  } catch (error) {
    console.error("Get monthly limit error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};


export const saveMonthlyLimit = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(req.accessToken);

    const { id } = req.params;
    const { year, month, limit_km} = req.body;

    if (!year || !month ||limit_km === undefined) {
      return res.status(400).json({
        message: "Year, month and limit_km are required",
      });
    }

    if (Number(month) < 1 || Number(month) > 12) {
      return res.status(400).json({
        message: "Month must be between 1 and 12",
      });
    }

    if (Number(limit_km) <= 0) {
      return res.status(400).json({
        message: "KM limit must be greater than 0",
      });
    }

    const { data, error } = await userSupabase
      .from("category_monthly_limits")
      .upsert(
        {
          category_id: id,
          year: Number(year),
          month: Number(month),
          limit_km: Number(limit_km),
        },
        {
          onConflict: "category_id,year,month",
        }
      )
      .select(`
        id,
        category_id,
        year,
        month,
        limit_km,
        created_at
      `)
      .single();

    if (error) {
      console.error("Save monthly limit error:", error);

      return res.status(500).json({
        message: "Failed to save monthly limit",
      });
    }

    return res.status(200).json({
      message: "Monthly limit saved successfully",
      monthlyLimit: data,
    });
  } catch (error) {
    console.error("Save monthly limit error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};