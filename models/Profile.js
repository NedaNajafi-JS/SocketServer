const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Create Schema
const ProfileSchema = new Schema({
  socket:{},
  room:String,
  chargeByPhoneInfo:{
    CPID: String,
    connectorId: String//Number,
    //connectorName: String
  },
  notifs:[{
    message: String,
    messageEN: String,
    status: Boolean,
    endTime:Date,
    CPID: String,
    connectorId: String
  }],
  email:String,
  password:String,
  // handle: {//national code
  //   type: String,
  //   required: true
  // },
  namee: {
    type: String
  },
  parents:[{
    parentId:{
      type:String
    }
    
  }],
  status:{
    type:String,
    default:"Accepted"
  },
  rfidserial: {
    type: String
  },
  rfids: [{
    rfidserial:{
        type:String
    },
    expiryDate: {
        type: Date,
        // format: date-time
    },
    parentIdTag: {
        type: String,
        maxLength: 20
    },
    status: {
        type: String,
        additionalProperties: false,
        enum: [
            "Accepted",
            "Blocked",
            "Expired",
            "Invalid",
            "ConcurrentTx"
        ]
    },
    private: {
        type: Boolean,
        default: false
    },
    issuanceDate: {
      type: Date
    },
    cardrequestDate: {
      type: Date
    },
    chargeInfo:{
      CPID: String,
      connectorId: String//Number,
      //connectorName: String
    }
  }
  ],
  blockList:[],
  currency: {
    type: Number,
    default:0
  },
  currencyUsd: {
    type: Number,
    default:0
  },
  cardrequest:{
    type:Boolean,
    default:false
  },
  cardrequestDate: {
    type: Date
  },
  // vehicleType: {
  //   type: String,
  //   // required: true
  // },
  nationalcode: {
    type: String,
    // required: true,
    // unique:true
  },
  phone: {
    type: String,
    // required: true,
    // unique:true
  },
  prefixe: Number,
  // vehicleName: {
  //   type: String,
  //   // required: true
  // },
  company: {
    type: String
  },
  address: {
    type: String,
    default:"",
    // required: true
  },
  // chargertype: {
  //   type: String,
  //   // required: true
  // },
  edu: {
    type: String
  },
  job: {
    type: String
  },
  date: {
    type: Date,
    default: Date.now
  },
  datelastuse: {
    type: Date,
    default: Date.now
  },
  postalCode: {
    type: String
  },
  cart:{
    type:Boolean,
    default:false
  },
  device:[{
    deviceId: String,
    sendPush: Boolean,
    language: String
  }],
  active:{
    type: Boolean,
    default:0 //0 is not active, 1 is active
  },
  batteries:[
      {
          type: Schema.Types.ObjectId,
          ref: 'bs_battery'
      }
  ],
  docs:[
      {
          data: String,  
          contentType: String
      }
  ],
  MotorCode:{
      type: String
  },
  confirmed:{
      type: Boolean,
      default:0 //0 is not permitted, 1 is permitted
  },
  swap: {
      type:Boolean,
      default: false
  }
});

module.exports = Profile = mongoose.model("profile", ProfileSchema);