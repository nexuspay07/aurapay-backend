const Application =
  require("../models/Application");

class ApplicationRepository {

  async create(data) {

    return await Application.create(data);

  }

  async findById(id) {

    return await Application.findById(id);

  }

  async findByMerchant(merchant) {

    return await Application.find({

      merchant,

    }).sort({

      createdAt: -1,

    });

  }

  async update(id, updates) {

    return await Application.findByIdAndUpdate(

      id,

      updates,

      {

        new: true,

      }

    );

  }

  async deactivate(id) {

    return await Application.findByIdAndUpdate(

      id,

      {

        active: false,

      },

      {

        new: true,

      }

    );

  }

  async delete(id) {

    return await Application.findByIdAndDelete(id);

  }

}

module.exports =
  new ApplicationRepository();