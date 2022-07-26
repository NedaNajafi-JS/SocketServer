const mongoose = require("mongoose");
mongoose.set('useFindAndModify', false);
const Schema = mongoose.Schema;

const chargeInfoEXPSchema = new Schema({

  _id:String,
  profileID:{
    type: Schema.Types.ObjectId,
    ref: 'profile'
  },
  expire: {
      type: Date,
      default: Date.now,
      expires: 240000 //expire after 4 hours
  }

});

module.exports = chargeInfoEXP  = mongoose.model("chargeInfoEXP", chargeInfoEXPSchema);
