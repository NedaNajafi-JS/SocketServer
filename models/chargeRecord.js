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
  rfidserial: {
    type: String
  },
  vehicleType: {
    type: String,
    // required: true
  },
  connector/*chargertype*/: {
    type: String,
    // required: true
  },
  stat:{
    percent:{type:Number},
    kwh:{type:Number}
  },
  currency:{type:Number},
  currencyUsd: Number,
  currencyUnit:{
      type : String,
      enum: ["IR", "Usd"]
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  stopTime: {
    type: Date
  },
  transactionId: String,
  meterStart: String,
  meterStop: String
});
module.exports = ChargeRecord = mongoose.model('chargerecord', ChargeRecordSchema);