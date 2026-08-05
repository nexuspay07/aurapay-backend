const express =
  require("express");

const router =
  express.Router();

const applicationService =
  require("../services/applicationService");

router.post(

  "/",

  async (

    req,

    res

  ) => {

    try {

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