const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userVehicleSchema = new Schema({
  vehicleType:Number,//1:car, 2: motor, 3: bus
  vehicleName:String,
  VIN:String,
  connectors:[String],
  profileID:{
    type: Schema.Types.ObjectId,
    ref: 'profile'
  }
});

module.exports = userVehicle  = mongoose.model("userVehicle", userVehicleSchema);
