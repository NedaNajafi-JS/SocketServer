const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Create Schema
const ProfileSchema = new Schema({
  socket:{},
  room:String,
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
  currency: {
    type: Number,
    default:0
  },
  cardrequest:{
    type:Boolean,
    default:false
  },
  carORmotor: {
    type: String,
    // required: true
  },
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
  vehicleName: {
    type: String,
    // required: true
  },
  company: {
    type: String
  },
  address: {
    type: String,
    default:"",
    // required: true
  },
  chargertype: {
    type: String,
    // required: true
  },
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
  }
});

module.exports = Profile = mongoose.model("profile", ProfileSchema);
