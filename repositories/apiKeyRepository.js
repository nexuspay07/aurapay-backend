const ApiKey =
  require("../models/ApiKey");

class ApiKeyRepository {

  // ======================================
  // CREATE
  // ======================================

  async create(data) {

    return await ApiKey.create(data);

  }

  // ======================================
  // FIND BY ID
  // ======================================

  async findById(id) {

    return await ApiKey.findById(id);

  }

  // ======================================
  // FIND BY PUBLIC KEY
  // ======================================

  async findByPublicKey(publicKey) {

    return await ApiKey.findOne({

      publicKey,

      active: true,

    });

  }

  // ======================================
  // FIND BY SECRET KEY PREFIX
  // ======================================

  async findBySecretKeyPrefix(

    secretKeyPrefix

  ) {

    return await ApiKey.findOne({

      secretKeyPrefix,

      active: true,

    });

  }

  // ======================================
  // FIND BY MERCHANT
  // ======================================

  async findByMerchant(

    merchantId

  ) {

    return await ApiKey.find({

      merchant: merchantId,

    }).sort({

      createdAt: -1,

    });

  }

  // ======================================
  // UPDATE LAST USED
  // ======================================

  async updateLastUsed(id) {

    return await ApiKey.findByIdAndUpdate(

      id,

      {

        lastUsedAt: new Date(),

      },

      {

        returnDocument: "after",

      }

    );

  }

  // ======================================
  // REVOKE
  // ======================================

  async revoke(id) {

    return await ApiKey.findByIdAndUpdate(

      id,

      {

        active: false,

      },

      {

        returnDocument: "after",

      }

    );

  }

  // ======================================
  // ROTATE
  // ======================================

  async rotate(

    id,

    publicKey,

    secretKeyPrefix,

    secretKeyHash

  ) {

    return await ApiKey.findByIdAndUpdate(

      id,

      {

        publicKey,

        secretKeyPrefix,

        secretKeyHash,

        lastUsedAt: null,

      },

      {

        returnDocument: "after",

      }

    );

  }

}

module.exports =
  new ApiKeyRepository();
