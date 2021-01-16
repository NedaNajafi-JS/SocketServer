const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChargeRecordSchema = new Schema({
  cpId: {
    type: String,
    required: true
  },
  // user: {
  //   type: Schema.Types.ObjectId,
  //   // ref: 'users'
  //   ref: 'profile'
  // },
  phone:String,
  carORmotor: {
    type: String,
    // required: true
  },
  chargertype: {
    type: String,
    // required: true
  },
  stat:{
    percent:{type:Number},
    kwh:{type:Number}
  },
  currency:{type:Number},
  startTime: {
    type: Date,
    default: Date.now
  },
  stopTime: {
    type: Date
  }
});
module.exports = ChargeRecord = mongoose.model('chargerecord', ChargeRecordSchema);