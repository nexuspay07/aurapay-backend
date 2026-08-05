const Merchant =
  require("../models/Merchant");

class MerchantRepository {

  // ======================================
  // GET MERCHANT BY ID
  // ======================================

  async getById(id) {

    return await Merchant.findById(id);

  }

  // ======================================
  // UPDATE MERCHANT
  // ======================================

  async update(id, data) {

    return await Merchant.findByIdAndUpdate(

      id,

      {
        $set: {

          businessName:
            data.businessName,

          legalName:
            data.legalName,

          businessType:
            data.businessType,

          merchantCategory:
            data.merchantCategory,

          website:
            data.website,

          contactEmail:
            data.contactEmail,

          contactPhone:
            data.contactPhone,

          country:
            data.country,

          businessRegistrationNumber:
            data.businessRegistrationNumber,

          taxNumber:
            data.taxNumber,

          businessAddress:
            data.businessAddress,

          ownerName:
            data.ownerName,

          ownerEmail:
            data.ownerEmail,

        },

      },

      {
        new: true,
        runValidators: true,
      }

    );

  }

}

module.exports =
  new MerchantRepository();