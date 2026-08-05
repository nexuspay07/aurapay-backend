const mongoose =
  require("mongoose");

const Merchant =
  require("../models/Merchant");

const applicationRepository =
  require("../repositories/applicationRepository");

class ApplicationService {

  async createApplication({

    merchant,

    name,

    description,

    website,

    logo,

    redirectUris,

    environment,

  }) {

    if (

      !mongoose.Types.ObjectId.isValid(

        merchant

      )

    ) {

      throw new Error(

        "Invalid ID."

      );

    }

    const merchantExists =
      await Merchant.findById(

        merchant

      );

    if (

      !merchantExists

    ) {

      throw new Error(

        "Merchant not found."

      );

    }

    return await applicationRepository.create({

      merchant,

      name,

      description,

      website,

      logo,

      redirectUris,

      environment,

    });

  }

  async listMerchantApplications(

    merchant

  ) {

    if (
      !mongoose.Types.ObjectId.isValid(
        merchant
      )
    ) {
      throw new Error(
        "Invalid ID."
      );
    }

    return await applicationRepository.findByMerchant(

      merchant

    );

  }

  async updateApplication(

    id,

    updates

  ) {

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      throw new Error(
        "Invalid ID."
      );
    }

    return await applicationRepository.update(

      id,

      updates

    );

  }

  async deactivateApplication(

    id

  ) {

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      throw new Error(
        "Invalid ID."
      );
    }

    return await applicationRepository.deactivate(

      id

    );

  }

  async deleteApplication(

    id

  ) {

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      throw new Error(
        "Invalid ID."
      );
    }

    return await applicationRepository.delete(

      id

    );

  }

}

module.exports =
  new ApplicationService();
