const mongoose = require("mongoose");

const ChargePointSchema = new mongoose.Schema({
  chargePointID: {
    type: String,
    required: true,
    unique: true
      // ,enum:['cp1','cp2','cp3','cp4','cp5','cp6']
      // ,enum:['cp11','cp12','cp13','cp14','cp15','cp16']
      // ,enum:['cp1','cp3','cp6']
      ,
    enum: ['cp11', 'cp16']

  },
  location: {
    coordinates: {
      type: [Number]
    },
    name: String
  },

  qrcode: String,
  stationID: String,
  // isAvailable:{  //insrtead of is available an "or" operationon all connector's availability
  //   type:Boolean
  // },
  type: {
    type: String,
    //enum:["fast","AC"]
    //enum:["AC"]
  },
  Chademo: {
    has: Boolean,
    isAvailable: Boolean,
    description: String
    //,enum:[false]
  },
  Ccs: {
    has: Boolean,
    isAvailable: Boolean,
    description: String
  },
  Gb: {
    has: Boolean,
    isAvailable: Boolean,
    description: String
  },
  Ac: {
    has: Boolean,
    isAvailable: Boolean,
    description: String
  },
  specs: {
    description: {
      type: String
    },
    images: {
      type: String //TODO=> Edit 
    }
  }
});

module.exports = chargePoint = mongoose.model("chargepoint", ChargePointSchema);