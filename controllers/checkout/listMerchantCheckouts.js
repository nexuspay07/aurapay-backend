const Checkout = require("../../models/Checkout");

module.exports =
  async function listMerchantCheckouts(
    req,
    res
  ) {
    try {

      const page =
        Math.max(
          parseInt(req.query.page) || 1,
          1
        );

      const limit =
        Math.min(
          parseInt(req.query.limit) || 20,
          100
        );

      const skip =
        (page - 1) * limit;

      const filter = {
        merchantId:
          req.user.merchantId,
      };

      if (req.query.status) {
        filter.status =
          req.query.status;
      }

      const [
        checkouts,
        total,
      ] =
        await Promise.all([
          Checkout.find(filter)
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(limit),

          Checkout.countDocuments(
            filter
          ),
        ]);

      return res.json({
        success: true,

        page,

        limit,

        total,

        pages:
          Math.ceil(
            total / limit
          ),

        checkouts,
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error:
          "Failed to load checkouts.",
      });

    }
  };