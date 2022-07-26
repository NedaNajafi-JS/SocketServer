const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const startSchedulingSchema = new Schema({
  stationId: {
    type: String
  },
  stationName:{
    type: String
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'profile',
    required: true
  },
  vehicleType: {
    type: String
  },
  cpID: {
    type: String,
    required: true
  },
  connector: {
    type: String,
    required: true
  },
  startTime: {//editable
    type: Date,
    required: true
  },
  endTime: {//editable
    type: Date,
    required: true
  },
  startTransactionTime: Date, //recieved from OCPP in startTransaction
  endTransctionTime: Date,  //recieved from OCPP in stopTransaction
  doScheduleDate: {
    type: Date,
    default: new Date(),
    required: true
  },  
  status:{
      type: String,
      enum:[
          'waiting',
          'charging',
          'over',
          'missed',
          'notConnected',
          'rejected',
          'notFoundRFID',
          'startCharging',
          'remoteStop'
      ],
      required: true
  },
  tempStartId:{
    type: Schema.Types.ObjectId,
    ref: 'temp'
  },
  tempStopId:{
    type: Schema.Types.ObjectId,
    ref: 'temp'
  },
  transactionId:{
    type: Number
  },
  repeatWeekly: {
    type: Boolean,
    default: false
  },
  repeatDaily: {
    type: Boolean,
    default: false
  }
});

module.exports = startScheduling = mongoose.model('startScheduling', startSchedulingSchema);