router.get("/seed-admin", async (req, res) => {
  try {
    const existing =
      await User.findOne({
        email:
          "blaiseanyigwi58@gmail.com",
      });

    if (existing) {
      return res.json({
        message:
          "Admin already exists",
        admin: existing,
      });
    }

    const hashed =
      await bcrypt.hash(
        "AuraAdmin123",
        10
      );

    const user = await User.create({
      email:
        "blaiseanyigwi58@gmail.com",

      password: hashed,

      role: "super_admin",

      permissions: [
        "all_access",
      ],

      status: "verified",
    });

    res.json({
      message:
        "Admin created successfully",

      admin: user,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      error: err.message,
    });
  }
});