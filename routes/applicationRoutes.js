const express =
  require("express");

const router =
  express.Router();

const applicationService =
  require("../services/applicationService");
const auth = require("../middlewares/auth");
const { ADMIN_ROLES } = require("../config/adminPermissions");
const Application = require("../models/Application");

router.use(auth);

function merchantAllowed(req, merchantId) {
  return ADMIN_ROLES.includes(req.user.role) || String(req.user.merchantId || "") === String(merchantId || "");
}

async function applicationOwner(req, res, next) {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) return res.status(404).json({ success: false, error: { code: "APPLICATION_NOT_FOUND", message: "Application not found." } });
    if (!merchantAllowed(req, application.merchant)) return res.status(403).json({ success: false, error: { code: "APPLICATION_FORBIDDEN", message: "Application access denied." } });
    next();
  } catch { return res.status(400).json({ success: false, error: { code: "INVALID_APPLICATION", message: "Invalid application." } }); }
}

router.post(

  "/",

  async (

    req,

    res

  ) => {

    try {

      if (!merchantAllowed(req, req.body?.merchant)) return res.status(403).json({ success: false, error: { code: "APPLICATION_FORBIDDEN", message: "Application access denied." } });

      const application =
        await applicationService.createApplication(

          req.body

        );

      res.status(201).json({

        success: true,

        message:
          "Application created.",

        data:
          application,

      });

    } catch (

      error

    ) {

      res.status(400).json({

        success: false,

        message:
          error.message,

      });

    }

  }

);

router.get(

  "/:merchantId",

  async (

    req,

    res

  ) => {

    try {

      if (!merchantAllowed(req, req.params.merchantId)) return res.status(403).json({ success: false, error: { code: "APPLICATION_FORBIDDEN", message: "Application access denied." } });

      const applications =
        await applicationService.listMerchantApplications(

          req.params

            .merchantId

        );

      res.json({

        success: true,

        data:
          applications,

      });

    } catch (

      error

    ) {

      res.status(400).json({

        success: false,

        message:
          error.message,

      });

    }

  }

);

router.put(

  "/:id",

  applicationOwner,

  async (

    req,

    res

  ) => {

    try {

      const application =
        await applicationService.updateApplication(

          req.params.id,

          req.body

        );

      res.json({

        success: true,

        message:
          "Application updated.",

        data:
          application,

      });

    } catch (

      error

    ) {

      res.status(400).json({

        success: false,

        message:
          error.message,

      });

    }

  }

);

router.patch(

  "/:id/deactivate",

  applicationOwner,

  async (

    req,

    res

  ) => {

    try {

      const application =
        await applicationService.deactivateApplication(

          req.params.id

        );

      res.json({

        success: true,

        message:
          "Application deactivated.",

        data:
          application,

      });

    } catch (

      error

    ) {

      res.status(400).json({

        success: false,

        message:
          error.message,

      });

    }

  }

);

router.delete(

  "/:id",

  applicationOwner,

  async (

    req,

    res

  ) => {

    try {

      await applicationService.deleteApplication(

        req.params.id

      );

      res.json({

        success: true,

        message:
          "Application deleted.",

      });

    } catch (

      error

    ) {

      res.status(400).json({

        success: false,

        message:
          error.message,

      });

    }

  }

);

module.exports =
  router;
