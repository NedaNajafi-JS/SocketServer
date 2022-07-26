/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/**
 * Packages in alphabetic order
 */

//-----wss----------
'use strict';
const fs = require('fs');
const Https = require('https');
const log4js = require("log4js");
const path = require('path');

log4js.configure({
  appenders: { logs: { type: "file", filename: path.dirname(require.main.filename) + "/wserror.log" } },
  categories: { default: { appenders: ["logs"], level: "debug" } }
});

const logger = log4js.getLogger("logs");

// const httpsServer = Https.createServer({
//   cert: fs.readFileSync('/etc/pki/tls/certs/mapna_evidc_com.crt'),
//   key: fs.readFileSync('/etc/pki/tls/private/mapna_evidc_com.key')
// });
//-----wss---------- 

const Validator = require('jsonschema').Validator; // To use jsonschema package
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

//--------wss-----------
const WebSocketServer = require('ws').Server;
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 5012 });
//--------wss-----------

const keys = require('./config/keys');
const db = require('./config/keys').mongoURI; // DB Config
//const chargePointModel = require('./models/chargepoints/chargePoint');
const ChargeRecordModel = require('./models/chargeRecord');
const profileModel = require('./models/Profile');
const ocpp_chargepointModel = require('./models/chargepoints/ocpp_chargepoints');

const RemoteStartTransaction = require('./schema/RemoteStartTransaction.json');
const RemoteStartTransactionResponse = require('./schema/RemoteStartTransactionResponse.json');
const RemoteStopTransaction = require('./schema/RemoteStopTransaction.json');
const RemoteStopTransactionResponse = require('./schema/RemoteStopTransactionResponse.json');
const StartTransactionResponse = require('./schema/StartTransactionResponse.json');
const StopTransaction = require('./schema/StopTransaction.json');
const meterAPP = require('./schema/meterAPP.json');
const traffApp = require('./schema/traffAPP.json');
const paymentSchema = require('./schema/payment.json')
//const chargeInfoEXPModel = require('./models/chargeInfoEXP');
const chargeScheduleModel = require('./models/chargeScheduling');
const newChargeScheduleSchema = require('./schema/startScheduling.json');
const deletedChargeScheduleSchema = require('./schema/deleteScheduling.json');
const { update } = require('./models/chargeRecord');
const ocpp_transaction = require('./models/chargepoints/Transactions');

const validateSchema = new Validator();

let cpID = '';
let payload = 200;
let payloadUsd = 0.5;

let dbCollection = '';
let profileCollection = '';
let reserveCollection = '';
let chargeInfoEXPCollection = '';
let chargeScheduleCollection = '';

let wsOcpp = '';
let wsClient = [];
// Connect to MongoDB
mongoose
  .connect(db, { useNewUrlParser: true/*, useFindAndModify: false */ })
  .then(() => {
    console.log('MongoDB Connected');
    const client = mongoose.connection.client;
    dbCollection = client.db('dashboard_db');
    profileCollection = dbCollection.collection('profiles');
    //chargeInfoEXPCollection = dbCollection.collection('chargeInfoEXPs');
    chargeScheduleCollection = dbCollection.collection('startschedulings');
    reserveCollection = dbCollection.collection('reserves');

    let reserveChangeStream = reserveCollection.watch();

    reserveChangeStream.on('change', async (next) => {
      //reserve does not have update
      if (next.operationType === 'insert') {

        if (wsOcpp.readyState === wsOcpp.OPEN) {

          wsOcpp.send(JSON.stringify([5, next.fullDocument.cpID, 'newReserve', next.fullDocument]));

        } else {
          logger.debug('A new reserve is added but the ocpp server is not in the ready state');
        }
      }

      if (next.operationType === 'delete') {

        if (wsOcpp.readyState === wsOcpp.OPEN) {

          wsOcpp.send(JSON.stringify([5, next.fullDocument.cpID, 'deleteReserve', next.documentKey._id]));

        } else {
          logger.debug('A reserve is deleted but the ocpp server is not in the ready state');
          console.log('A reserve is deleted but the ocpp server is not in ready state.');
        }

      }

    });

    let chargeInfoEXPChangeStream = '';
    /*chargeInfoEXPChangeStream = chargeInfoEXPCollection.watch();
    chargeInfoEXPChangeStream.on('change', async(next) => {
      if(next.operationType === 'delete'){
        
        let prof = await profileModel
        .findOne(
          {
            _id: next.fullDocument.profileID,
            rfids: { 
              $elemMatch:{
                rfidserial: next.fullDocument._id
              }
            }
          }
        )
        .lean()
        .exec();

        if(prof && next.fullDocument._id !== undefined){
          await freeChargeInfo(prof.phone, next.fullDocument._id);
        }else{

          if(next.fullDocument.profileID !== undefined){

            prof = await profileModel
            .findOne(
              {
                _id: next.fullDocument.profileID
              }
            )
            .lean()
            .exec();

            if(prof){
              await freeChargeInfo(prof.phone);
            }
            
          }
          
        }
        
      }
    });*/

    let chargeScheduleChangeStream = '';
    chargeScheduleChangeStream = chargeScheduleCollection.watch();
    chargeScheduleChangeStream.on('change', async (next) => {

      if (next.operationType === 'insert') {

        console.log('New start schedule insert.', next.fullDocument, wsOcpp.readyState);

        let newScheduleObj = {
          profile: next.fullDocument.user,
          connectorName: next.fullDocument.connector,
          startTime: next.fullDocument.startTime,
          endTime: next.fullDocument.endTime
        }

        if (//validateSchema.validate(newScheduleObj, newChargeScheduleSchema).valid &&
          wsOcpp.readyState === wsOcpp.OPEN) {

          wsOcpp.send(
            JSON.stringify([5, next.fullDocument.cpID, 'newStartSchedule', newScheduleObj])
          );

        } else {

          logger.debug('A new start schedule in inserter, but the ocpp server is not in ready state.');
        }
      }

      if (next.operationType === 'delete') {

        console.log('An start schedule is deleted', next.fullDocument);

        let deletedScheduleObj = {

          // profile: next.fullDocument.user,
          // connectorName: next.fullDocument.connector
          tempStartId: next.fullDocument.tempStartId

        }

        if (//validateSchema.validate(deletedScheduleObj, deletedChargeScheduleSchema) && 
          wsOcpp.readyState === wsOcpp.OPEN) {

          wsOcpp.send(
            JSON.stringify(

              [5, next.fullDocument.cpID, 'deletedStartSchedule', deletedScheduleObj]

            )
          );

          console.log('Message sent to OCPP deletedStartSchedule, tempStartId: ', next.fullDocument.tempStartId);
          logger.debug('Message sent to OCPP deletedStartSchedule, tempStartId: ', next.fullDocument.tempStartId);

        } else {

          logger.debug('A start schedule in deleted, but the ocpp server is not in the ready state.');
        }

      }
    });

    var filter = [{
      $match: {
        $and: [
          { "updateDescription.updatedFields.status": { $exists: true } },
          { operationType: "update" }]
      }
    }];

    var options = { fullDocument: 'updateLookup' };

    dbCollection.collection('ocpp_chargepoints').watch(filter, options).on('change', async (next) => {

      if (next.operationType === 'update') {
        console.log(next.fullDocument);

        let chargers = await ocpp_chargepointModel
          .find()
          .lean()
          .exec()
          .select({ status: 1, usageType: 1 });

        let privates = await chargers.filter(ch => ch.usageType === 'private');
        let publics = await chargers.filter(ch => ch.usageType === 'public');

        wss.clients.forEach(async function each(client) {

          client.send(JSON.stringify({
            action: 'cpStatusChanged',
            cpID: next.fullDocument.CPID,
            status: next.fullDocument.status,
            usageType: next.fullDocument.usageType,
            allChargers: { privates, publics }
          }));
        });

      }
    });

    var filterMaxOfEnergy = [{
      $match: {
        $and: [
          { "updateDescription.updatedFields.maxOfEnergy": { $exists: true } },
          { operationType: "update" }]
      }
    }];

    dbCollection.collection('ocpp_chargepoints').watch(filterMaxOfEnergy, options).on('change', async (next) => {

      if (next.operationType === 'update') {
        console.log(next.fullDocument);

        if (wsOcpp.readyState === wsOcpp.OPEN) {

          wsOcpp.send(
            JSON.stringify([5, next.fullDocument.cpID, 'maxOfEnergyUpdated', next.fullDocument])
          );

        }

      }
    });

  })
  .catch((err) => {
    logger.debug(err);
    console.log(err);
  });

let charging = false;
const cpIDs = {};
const clients = {};

let freeChargeInfo = (profilePhone, idTag) => new Promise(async (resolve, reject) => {

  let chargeInfo = {
    CPID: ''
  }

  const profi = await profileModel
    .findOne(
      {
        phone: profilePhone
      }
    )
    .lean()
    .exec();

  if (profi) {

    if (profi.rfids && profi.rfids !== undefined && profi.rfids.length > 0) {

      if (idTag !== undefined && idTag.length > 0) {

        console.log("idTag", idTag)
        await profileModel
          .updateOne(
            {
              phone: profilePhone,
              rfids: {
                $elemMatch: {
                  rfidserial: idTag
                }
              }
              //'rfids.rfidserial': idTag
            },
            {
              $set: {
                'rfids.$.chargeInfo': chargeInfo
              }
            }
          )
          .exec();

      } else {
        logger.debug('idTag is undefined.');
      }

    } else {

      await profileModel
        .updateOne(
          {
            phone: profilePhone
          },
          {
            $set: {
              chargeByPhoneInfo: chargeInfo
            }
          }
        )
        .exec();
    }

    resolve(true);
  } else {
    resolve(false);
  }

});

function connect() {
  const urlOcpp = 'ws://as5:5007/ocpp/APP';
  wsOcpp = new WebSocket(urlOcpp);

  wsOcpp.on('open', function open() {
    console.log('connecting to ocpp server');

    let ws_client = '';

    wsOcpp.on('message', async function (message) {
      if (message) {
        console.log("message", message);
        logger.debug("message: ", message);
        const data = JSON.parse(message);
        if (data.length > 0) {
          try {
            switch (data[2]) {

              case 'Tariff':

                logger.debug("messageRecieved Tariff: ", data[3]);

                if (
                  validateSchema.validate(
                    data[3],
                    traffApp,
                  ).valid
                ) {
                  clients[data[1]].tariff = data[3].tariff;
                  clients[data[1]].tariffUsd = data[3].tariffUsd;
                }

                break;
              case 'RemoteStartTransaction':
                console.log("messageRecieved RemoteStartTransaction: ", data[3]);
                logger.debug("messageRecieved RemoteStartTransaction: ", data[3]);

                ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                if (
                  validateSchema.validate(
                    data[3],
                    RemoteStartTransactionResponse,
                  ).valid &&
                  data[3].status === 'Accepted'
                ) {
                  logger.debug("RemoteStartTransaction, ws_client", ws_client, "readyStateeeeeeeeeeeeeeeeeeee",
                    ws_client.readyState, "wsClient allllllllllllllllllllllll", wsClient)
                  // send startChargingRes to app
                  if (ws_client.readyState === ws_client.OPEN) {

                    ws_client.send(
                      JSON.stringify({ cpID: data[1], action: 'startChargingRes' }),
                    );

                    logger.debug("messageSentToApp startChargingRes ");

                  } else {
                    logger.debug("App socket is not open.");
                    //clients[data[1]].terminate();
                  }
                } else {
                  // data format is not valid

                  charging = false;

                  let err_msg = '';
                  let err_msgEN = '';
                  if (data[3] && data[3].status === 'Rejected') {
                    err_msg = data[3].reason;
                    err_msgEN = data[3].reasonEN;
                  } else {
                    err_msg = 'ط®ط·ط§غŒ ط³ط±ظˆط±';
                    err_msgEN = 'Server error'
                  }

                  logger.debug("error in RemoteStartTransaction: ", err_msg);

                  if (data[3] && ws_client &&
                    ws_client.readyState === ws_client.OPEN) {

                    ws_client.send(
                      JSON.stringify({ cpID: data[1], action: 'problemOccured', message: err_msg, messageEN: err_msgEN }),
                    ); // to app

                    logger.debug("messageSentToApp problemOccured ");

                    //clients[data[1]].close();


                    await freeChargeInfo(clients[data[1]].phone, clients[data[1]].idTag);

                    delete clients[data[1]];


                    if (cpIDs[data[1]]) {
                      delete cpIDs[data[1]];
                    }

                  } else {
                    logger.debug("App socket is closed.");
                    //clients[data[1]].terminate();
                  }
                }
                break;

              case 'StartTransaction':

                console.log("messageRecieved StartTransaction: ", data[3]);
                logger.debug("messageRecieved StartTransaction: ", data[3]);

                charging = true;

                ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                if (
                  validateSchema.validate(data[3], StartTransactionResponse)
                    .valid
                ) {

                  cpIDs[data[1]].transactionId = data[3].transactionId;
                  cpIDs[data[1]].meterStart = data[3].meterStart;

                  // send chargeData to app
                  if (ws_client.readyState === ws_client.OPEN) {

                    const profi = await profileModel
                      .findOne(
                        {
                          phone: clients[data[1]].phone
                        }
                      )
                      .lean()
                      .exec();

                    if (profi) {

                      let chargeInfo = '';
                      if (profi.rfids !== undefined && profi.rfids.length > 0) {

                        let rf = profi.rfids.find(rfid => rfid.rfidserial === clients[cpID].idTag);
                        if (rf !== undefined && rf.length > 0) {
                          chargeInfo = rf.chargeInfo;

                        }

                        // const chargeInfoEXPrec = new chargeInfoEXPModel({
                        //   _id: clients[cpID].idTag,
                        //   profileID: profi._id
                        // });

                        // const EXP = await chargeInfoEXPModel
                        // .findOne(
                        //   {
                        //     _id:clients[cpID].idTag,
                        //     profileID:profi._id
                        //   }
                        // )
                        // .lean()
                        // .exec();

                        // if(EXP !== undefined && EXP !== null){

                        //   await chargeInfoEXPModel
                        //   .findOneAndDelete(
                        //     {
                        //       _id: EXP._id
                        //     }
                        //   )
                        //   .exec();

                        //   await chargeInfoEXPrec.save();

                        // }else{
                        //   await chargeInfoEXPrec.save();

                        // }                      

                      } else {
                        chargeInfo = profi.chargeByPhoneInfo;
                      }

                      if (chargeInfo !== '') {

                        if (chargeInfo.CPID !== data[3].CPID) {

                          logger.debug("error in StartTransaction profile not found.");

                        } else {

                          ws_client.send(
                            JSON.stringify({
                              cpID: data[1],
                              action: 'chargeData',
                              percentage: 0,
                              kwh: 0,
                              currency: 0,
                              currencyUsd: 0,
                              phone: clients[data[1]].phone,
                              timer: 0,
                            }),
                          );

                          if (data[3].transactionId !== undefined && data[3].transactionId.length > 0) {

                            const schedule = await chargeScheduleModel
                              .findOne(
                                {
                                  transactionId: data[3].transactionId,
                                  status: 'charging'
                                }
                              )
                              .exec();

                            if (schedule && schedule.length > 0) {

                              if (data[3].scheduleStartTime !== undefined && data[3].scheduleStartTime.length > 0) {

                                schedule.startTransactionTime = data[3].scheduleStartTime;

                              } else {

                                schedule.startTransactionTime = new Date();

                              }

                              await schedule.save();
                            }

                          }

                          logger.debug("messageSentToApp chargeData in StartTransaction: ", clients[data[1]].phone);

                        }
                      }
                    }

                    profileModel.findOne(
                      {
                        phone: clients[data[1]].phone
                      }
                    )
                      .then((profile) => {

                        if (profile) {
                          //------check idTag then send
                          if (profile.rfidserial === clients[data[1]].idTag || profile.phone === clients[data[1]].idTag) {

                            ws_client.send(
                              JSON.stringify({
                                cpID: data[1],
                                action: 'chargeData',
                                percentage: 0,
                                kwh: 0,
                                currency: 0,
                                currencyUsd: 0,
                                phone: clients[data[1]].phone,
                                timer: 0,
                              }),
                            );

                            logger.debug("messageSentToApp chargeData in StartTransaction: ", clients[data[1]].phone);

                          }
                        } else {
                          logger.debug("error in StartTransaction profile not found ");

                        }

                      })
                      .catch((err) => {
                        logger.debug("error in StartTransaction profile query: ", err);
                        console.log("error in StartTransaction profile query: ", err);
                      })

                  } else {
                    logger.debug("App socket is closed.");
                    //clients[data[1]].terminate();
                  }
                } else {
                  // data format is not valid

                  charging = false;
                  if (data[3] && ws_client && ws_client.readyState === ws_client.OPEN) {

                    ws_client.send(
                      JSON.stringify({ cpID: data[1], action: 'problemOccured', message: 'ط®ط·ط§غŒ ط³ط±ظˆط±', messageEN: 'Server error' }),
                    ); // to app

                    logger.debug("error in StartTransaction dataFormat not valid, messageSentToApp problemOccured in StartTransaction ");
                    console.log("error in StartTransaction dataFormat not valid, messageSentToApp problemOccured in StartTransaction ");

                    //clients[data[1]].close();

                    await freeChargeInfo(clients[data[1]].phone, clients[data[1]].idTag);

                    if (clients[data[1]]) {

                      //clients[data[1]].close();
                      delete clients[data[1]];

                    }
                    //delete clients[data[1]];

                    if (cpIDs[data[1]]) {
                      delete cpIDs[data[1]];
                    }

                  }
                }

                break;
              case 'MeterValues':

                ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                if (ws_client) {
                  logger.debug("messageRecieved MeterValues: ", data[3],
                    " ws_client.readyState: ", ws_client.readyState,
                    " validation: ", validateSchema.validate(data[3], meterAPP).valid
                  );

                  charging = true;

                  if (ws_client.readyState === ws_client.OPEN &&
                    validateSchema.validate(data[3], meterAPP).valid) {

                    console.log("\n");
                    console.log("messageSentToApp chargeData in MeterValues: ", data[3],
                      " meterStart: ", cpIDs[data[1]].meterStart,
                      " payload: ", clients[data[1]].tariff,
                      " profilePhone: ", clients[data[1]].phone);

                    let profile = await profileModel
                      .findOne(
                        {
                          phone: clients[data[1]].phone
                        }
                      )
                      .exec();

                    ws_client.send(
                      JSON.stringify({
                        cpID: data[1],
                        action: 'chargeData',
                        percentage: data[3].meterValue.SOC,
                        kwh: data[3].meterValue.KWH - cpIDs[data[1]].meterStart,
                        currency: /*parseInt(profile.prefixe) === 98*/ clients[data[1]].currencyUnit === 'IR' ? (data[3].meterValue.KWH - cpIDs[data[1]].meterStart) * clients[data[1]].tariff : 0,
                        currencyUsd: /*parseInt(profile.prefixe) !== 98*/ clients[data[1]].currencyUnit !== 'IR' ? (data[3].meterValue.KWH - cpIDs[data[1]].meterStart) * clients[data[1]].tariffUsd : 0,
                        phone: clients[data[1]].phone,
                        timer: data[3].timestamp,
                        voltage: data[3].Voltage,
                        current: data[3].Current
                      })
                    );

                    logger.debug("messageSentToApp chargeData in MeterValues: ", data[3],
                      " meterStart: ", cpIDs[data[1]].meterStart,
                      " payload: ", clients[data[1]].tariff,
                      " profilePhone: ", clients[data[1]].phone);

                    console.log("\n");
                    console.log("messageSentToApp chargeData in MeterValues: ", data[3],
                      " meterStart: ", cpIDs[data[1]].meterStart,
                      " payload: ", clients[data[1]].tariff,
                      " profilePhone: ", clients[data[1]].phone);

                  } else {
                    if (data[3] &&
                      ws_client &&
                      ws_client.readyState === ws_client.OPEN) {

                      ws_client.send(
                        JSON.stringify({
                          cpID: data[1],
                          action: 'problemOccured', message: 'ط®ط·ط§غŒ ط¯ط±غŒط§ظپطھ ظ…ظ‚ط¯ط§ط± ط´ط§ط±عک.',
                          messageEN: 'Error in recieving charge value.'
                        }),
                      ); // to app

                      logger.debug("messageSentToApp problemOccured in MeterValues ");
                      console.log("messageSentToApp problemOccured in MeterValues ");

                      //clients[data[1]].close();

                      //ocpp gauranties to send stopCharging, so making rfid free is not neccessary here and
                      //will be done in stopCharging

                      // delete clients[data[1]];

                      // if (cpIDs[data[1]]) {
                      //   delete cpIDs[data[1]];
                      // }

                    } else {
                      logger.debug("failed to send problemOccured to application");
                      console.log("failed to send problemOccured to application");
                      //clients[data[1]].terminate();
                    }
                  }
                }


                break;
              case 'RemoteStopTransaction':

                logger.debug("messageRecieved RemoteStopTransaction: ", data[3]);
                console.log("messageRecieved RemoteStopTransaction: ", data[3]);

                charging = false;

                ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                if (validateSchema.validate(data[3], RemoteStopTransactionResponse).valid &&
                  data[3].status === 'Accepted'
                ) {

                  console.log('data fromat is valid in RemoteStopTransactionResponse.');
                  logger.debug('data fromat is valid in RemoteStopTransactionResponse.');

                } else {

                  let err_msg = '';
                  let err_msgEN = '';
                  if (data[3] && data[3].status === 'Rejected') {
                    err_msg = data[3].reason;
                    err_msgEN = data[3].reasonEN;
                  } else {
                    err_msg = 'ط®ط·ط§غŒ ط³ط±ظˆط±';
                    err_msgEN = 'Server error';
                  }

                  logger.debug("error in RemoteStopTransaction: ", err_msg);

                  // data format is not valid
                  if (data[3] && ws_client &&
                    ws_client.readyState === ws_client.OPEN) {

                    ws_client.send(
                      JSON.stringify({ cpID: data[1], action: 'problemOccured', message: err_msg, messageEN: err_msgEN }),
                    ); // to app

                    logger.debug("messageSentToApp problemOccured in RemoteStopTransaction: ", err_msg);

                    //ocpp gauranties to send stopCharging, so making rfid free is not neccessary here and
                    //will be done in stopCharging

                    // console.log("deleteRemoteStopTransaction");
                    // logger.debug("deleteRemoteStopTransaction ");

                    //clients[data[1]].close();
                    // delete clients[data[1]];

                    // if (cpIDs[data[1]]) {
                    //   delete cpIDs[data[1]];
                    // }

                  } /*else {
                    logger.debug("App socket is closed.");
                    clients[data[1]].terminate();
                  }*/
                }
                break;
              case "Reservedmessage":

                logger.debug("messageRecieved Resevedmessage: ", data[3]);

                ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                let message = '';
                let startTime = '';
                let stopTime = '';

                if (data[3]) {

                  if (data[3].message) {
                    message = data[3].message;
                  }

                  if (data[3].startTime) {
                    startTime = data[3].startTime;
                  }

                  if (data[3].startTime) {
                    stopTime = data[3].stoptime;
                  }

                }

                let finalMessage = '';
                let finalMessageEN = '';
                if (startTime !== '' && stopTime !== '') {
                  finalMessage = message + ' ' + 'شما در بازه زماني ' + toString(startTime) + ' تا ' + toString(stopTime)
                    + ' امکان شارژ داريد. ';

                  finalMessageEN = 'You are allowed to charge in the period of ' + toString(startTime) + ' to ' + toString(stopTime);
                }

                if (finalMessage !== '') {

                  if (data[3] && ws_client && ws_client.readyState === ws_client.OPEN) {

                    ws_client.send(
                      JSON.stringify({ cpID: data[1], action: 'notification', message: finalMessage, messageEN: finalMessageEN })
                    ); // to app

                    logger.debug("messageSentToApp notification in Resevedmessage: " + finalMessage);

                  } /*else {
                    logger.debug("App socket is closed.");
                    clients[data[1]].terminate();
                  }*/

                } else {
                  logger.debug("error in Resevedmessage startTime or stopTime null ");

                }

                break;
              case 'Payment':


                const cptmp = await ocpp_chargepointModel
                  .findOne({ CPID: data[1] })
                  .exec();

                if (validateSchema.validate(data[3], paymentSchema).valid) {

                  let rec = await ChargeRecordModel
                    .find(
                      {
                        transactionId: data[3].TransactionId
                      }
                    )
                    .exec();

                  if (!(rec !== undefined && rec !== null && rec.length > 0)) {

                    let remained_currency = 0;
                    let remained_currencyUsd = 0;
                    profileModel.findOne(
                      {
                        $or: [{ rfids: { $elemMatch: { rfidserial: data[3].idTag } } }, { phone: data[3].idTag }]
                      }
                    )
                      .then(async (profile) => {

                        if (profile) {

                          let pp = '';
                          let used_currency = 0;
                          let used_currencyUsd = 0;
                          if (/*parseInt(profile.prefixe) !== 98*/ cptmp.currencyUnit !== 'IR') {

                            used_currencyUsd = Math.round((data[3].meterStop - data[3].meterStart) * data[3].tariffUsd);
                            const currencyUsd = profile.currencyUsd;
                            remained_currencyUsd = currencyUsd - used_currencyUsd;

                            pp = await profileModel.findOneAndUpdate(
                              {
                                phone: profile.phone
                              },
                              {
                                $set: {
                                  currencyUsd: remained_currencyUsd
                                },
                              }
                            )
                              .exec();

                          } else {

                            used_currency = Math.round((data[3].meterStop - data[3].meterStart) * data[3].tariff);
                            remained_currency = profile.currency - used_currency;

                            pp = await profileModel.findOneAndUpdate(
                              {
                                phone: profile.phone
                              },
                              {
                                $set: {
                                  currency: remained_currency
                                },
                              }
                            )
                              .exec();

                            logger.debug("remained_currency in Payment: ", remained_currency,
                              " profile.currency: ", profile.currency,
                              " used_currency: ", used_currency,
                              " profile.phone: ", profile.phone);

                          }

                          if (pp !== undefined && pp !== null && pp != '') {

                            console.log("paymentResult in Payment: ", pp);
                            logger.debug("paymentResult in Payment: ", pp);

                            let vehicleType = '';
                            if (data[3].connectorName === 'Motorcycle-AC-Default' ||
                              data[3].connectorName === 'Motorcycle-AC-Type1' ||
                              data[3].connectorName === 'Motorcycle-AC-Type2') {

                              vehicleType = 2;

                            } else if (data[3].connectorName === 'Car-DC-CHAdeMO' ||
                              data[3].connectorName === 'Car-AC-Type1' ||
                              data[3].connectorName === 'Car-AC-Type2' ||
                              data[3].connectorName === 'Car-DC-CCS1' ||
                              data[3].connectorName === 'Car-DC-CCS2' ||
                              data[3].connectorName === 'Car-DC-GB/T' ||
                              data[3].connectorName === 'Car-DC-Chaoji' ||
                              data[3].connectorName === 'Car-AC-GB/T') {

                              vehicleType = 1;

                            } else if (data[3].connectorName === 'Bus-AC-Type2' ||
                              data[3].connectorName === 'Bus-AC-GB/Ttype2' ||
                              data[3].connectorName === 'Bus-DC-CCS2') {

                              vehicleType = 3;

                            }

                            if (data[3].timestamp === undefined) {
                              data[3].timestamp = Date.now();
                            }



                            //if(!(rec !== undefined && rec !== null && rec.length > 0)){

                            let tmp = new ChargeRecordModel({
                              cpId: data[1],
                              phone: profile.phone,
                              vehicleType: vehicleType,
                              connector: data[3].connectorName,
                              currency: used_currency,
                              currencyUsd: used_currencyUsd,
                              currencyUnit: cptmp.currencyUnit,
                              startTime: data[3].timestamp,
                              transactionId: data[3].TransactionId,
                              meterStart: data[3].meterStart,
                              meterStop: data[3].meterStop,
                              rfidserial: data[3].idTag
                            });

                            logger.debug("ChargeRecord in Payment: ", tmp);

                            tmp.save()
                              .then(rec => {
                                console.log("ChargeRecordResult in Payment: ", rec);
                                logger.debug("ChargeRecordResult in Payment: ", rec);

                              })
                              .catch(err => {
                                console.log("ChargeRecord query error in Payment: ", err);
                                logger.debug("ChargeRecord query error in Payment: ", err);

                              });
                            //}
                          }

                        } else {
                          logger.debug("profile not found in Payment ");
                        }

                      })
                      .catch(err => {
                        console.log("profile query error in Payment: ", err);
                        logger.debug("profile query error in Payment: ", err);

                      });
                  }
                } else {

                  ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                  // data format is not valid
                  if (data[3] && ws_client && ws_client.readyState === ws_client.OPEN) {

                    ws_client.send(
                      JSON.stringify({ cpID: data[1], action: 'problemOccured', message: 'خطاي سرور', messageEN: 'Server error' }),
                    ); // to app

                    logger.debug("messageSentToApp problemOccured in payment dataFormat notValid ");

                  } else {
                    logger.debug("App socket is closed.");
                    //clients[data[1]].terminate();
                  }

                }

                break;
              case 'StopTransaction':
                charging = false;

                ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                if (ws_client &&
                  //validateSchema.validate(data[3], StopTransaction).valid &&
                  ws_client.readyState === ws_client.OPEN
                ) {

                  let kwh = 0;
                  let currency = 0;
                  let currencyUsd = 0;
                  if (data[3].meterStop && cpIDs[data[1]].meterStart) {
                    kwh = data[3].meterStop - cpIDs[data[1]].meterStart;
                    currency = clients[data[1]].currencyUnit === 'IR' ? (data[3].meterStop - cpIDs[data[1]].meterStart) * data[3].tariff : 0;
                    currencyUsd = clients[data[1]].currencyUnit !== 'IR' ? (data[3].meterStop - cpIDs[data[1]].meterStart) * data[3].tariffUsd : 0;
                  }

                  ws_client.send(
                    JSON.stringify({ cpID: data[1], action: 'stopCharging', kwh, currency, currencyUsd, reason: data[3].reason }),
                  );

                  if (data[3].transactionId !== undefined && data[3].transactionId.length > 0) {

                    const schedule = await chargeScheduleModel
                      .findOne(
                        {
                          transactionId: data[3].transactionId,
                          status: { $in: ['remoteStop', 'over'] }
                        }
                      )
                      .exec();

                    if (schedule && schedule.length > 0) {

                      if (data[3].scheduleStopTime !== undefined && data[3].scheduleStopTime.length > 0) {
                        schedule.endTransctionTime = data[3].scheduleStopTime;

                      } else {
                        schedule.endTransctionTime = new Date();
                      }

                      await schedule.save();
                    }

                  }

                  logger.debug("messageSentToApp stopCharging in StopTransaction ");

                  logger.debug("Charge Finished and the charger is free:/// ", clients[data[1]].idTag);
                  console.log('Charge Finished and the charger is free:/// ', clients[data[1]].idTag);

                } else {
                  // data format is not valid
                  if (data[3] && ws_client && ws_client.readyState === ws_client.OPEN) {

                    ws_client.send(
                      JSON.stringify({ cpID: data[1], action: 'problemOccured', message: 'ط®ط·ط§غŒ ط³ط±ظˆط±', messageEN: 'Server error' }),
                    ); // to app

                    logger.debug("messageSentToApp problemOccured in StopTransaction dataFormat notValid ");
                    console.log("messageSentToApp problemOccured in StopTransaction dataFormat notValid ");

                  } /*else {
                    logger.debug("App socket is closed.");
                    clients[data[1]].terminate();
                  }*/
                }

                if (data[3] && clients[data[1]]) {

                  await freeChargeInfo(clients[data[1]].phone, clients[data[1]].idTag);

                  const pro = await profileModel
                    .findOne(
                      {
                        phone: clients[data[1]].phone
                      }
                    )
                    .lean()
                    .exec();

                  // if(pro){

                  //   await chargeInfoEXPModel
                  //   .findOneAndDelete(
                  //     {
                  //       profileID: pro._id,
                  //       _id: clients[data[1]].idTag
                  //     }
                  //   )
                  //   .exec();

                  // }


                  //clients[data[1]].close();
                  delete clients[data[1]];

                  console.log("deleteStopTransaction");
                  logger.debug("deleteStopTransaction ");

                }

                if (data[3] && cpIDs[data[1]]) {
                  delete cpIDs[data[1]];
                }

                break;
              case 'Errors'://[6, cp1, "action","errorTxt"]
                //send completely to app

                logger.debug("messageRecieved Errors: ", data[3]);

                ws_client = await wsClient.find(ws__ => ws__.cpID === data[1]);

                charging = false;

                if (data[3] && ws_client && ws_client.readyState === ws_client.OPEN) {

                  ws_client.send(
                    JSON.stringify({ cpID: data[1], action: 'error', data: data[3] }),
                  );

                  logger.debug("messageSentToApp error in Errors: ", data[3]);

                } else {
                  logger.debug("App socket is closed.");
                  //clients[data[1]].terminate();
                }

                break;
              case 'Status'://[6, cp1,"action", {status : (0(unavailable),1(available),2(charging))}]
                break;
              default:
                console.log(data[2]);
            }
          } catch (err) {
            console.log(err);
            logger.debug(err);
          }
        }
      }
    });
  });

  wsOcpp.on('error', function err() {
    logger.debug(" ocpp connection error ");

    setTimeout(function () {

      logger.debug(" ocpp connection error, try to connect ");
      connect();
    }, 60000);
  });

  wsOcpp.on('close', async function err() {

    logger.debug(" ocpp connection close ");

    // wss.clients.forEach(async function each(client) {

    //   if (clients[client.cpID] && client.readyState === WebSocket.OPEN) {

    //     client.close();

    //     console.log(" ocpp connection close, delete socket: " + client.cpID);
    //     logger.debug(" ocpp connection close, delete socket: " + client.cpID);

    //     await freeChargeInfo(clients[client.cpID].phone, clients[client.cpID].idTag);

    //     delete clients[client.cpID];

    //     if (cpIDs[client.cpID]) {
    //       delete cpIDs[client.cpID];
    //     }

    //   }
    // });

    setTimeout(function () {
      logger.debug(" ocpp connection close, try to connect ");
      connect();
    }, 15000);
  });
}

connect();

//------wss-------------
// const wss = new WebSocketServer({
//   server: httpsServer
// });

// httpsServer.on('request', (req, res) => {
//   res.writeHead(200);
//   res.end('hello\n');
// });
//-------wss-------------


wss.on('error', function err(err) {
  logger.debug(" client connection error: ", err);
  console.log(" client connection error: ", err);
});

wss.on('close', function err(err) {
  logger.debug(" client connection close: ", err);
  console.log(" client connection close: ", err);
});

wss.on('connection', async function connection(ws, req) {



  console.log("number of opened sockets: ", wss.clients.size);
  logger.debug("number of opened sockets: ", wss.clients.size);

  ws.on('message', async function (message) {
    if (message) {
      const data = JSON.parse(message);
      switch (data.action) {
        // /////////////////////////////////////// USERCONNECTING ///////////////////////////////
        // from app

        case 'newCPID':

          cpID = data.cpID;

          if (data.cpID) {
            logger.debug(" client new connection CPID: " + data.cpID);

            //ws.cpID = cpID;

            if (!cpIDs[data.cpID])
              cpIDs[data.cpID] = {};

            ocpp_chargepointModel.findOne(
              {
                CPID: data.cpID
              }
            )
              .then(async (cpInfo) => {
                if (cpInfo) {

                  logger.debug(" client new connection cpInfo: " + cpInfo);


                  let connectors = [];

                  let CHAdeMO_cp = cpInfo.connector.find(cp => cp.connectorName === 'Car-DC-CHAdeMO');
                  let CCS1_cp = cpInfo.connector.find(cp => cp.connectorName === 'Car-DC-CCS1');
                  let CCS2_cp = cpInfo.connector.find(cp => cp.connectorName === 'Car-DC-CCS2');
                  let GBT_cp = cpInfo.connector.find(cp => cp.connectorName === 'Car-DC-GB/T');
                  let Type1_cp = cpInfo.connector.find(cp => cp.connectorName === 'Car-AC-Type1');
                  let AC_Type2_cp = cpInfo.connector.find(cp => cp.connectorName === 'Car-AC-Type2');
                  let Chaoji_cp = cpInfo.connector.find(cp => cp.connectorName === 'Car-DC-Chaoji');
                  let Type2_GB_cp = cpInfo.connector.find(cp => cp.connectorName === 'Bus-AC-GB/Ttype2');
                  let BUS_Type2_cp = cpInfo.connector.find(cp => cp.connectorName === 'Bus-AC-Type2');
                  let BUS_CCS2_cp = cpInfo.connector.find(cp => cp.connectorName === 'Bus-DC-CCS2');
                  let AC_Motorcycle_cp = cpInfo.connector.find(cp => cp.connectorName === 'Motorcycle-AC-Default');
                  let Motor_AC_Type1_cp = cpInfo.connector.find(cp => cp.connectorName === 'Motorcycle-AC-Type1');
                  let Motor_AC_Type2_cp = cpInfo.connector.find(cp => cp.connectorName === 'Motorcycle-AC-Type2');
                  let Car_AC_GBT = cpInfo.connector.find(cp => cp.connectorName === 'Car-AC-GB/T');

                  if (CHAdeMO_cp !== undefined &&
                    CHAdeMO_cp.status !== "Notexist" &&
                    CHAdeMO_cp.status !== "Unavailable" &&
                    CHAdeMO_cp.status !== "Faulted") {
                    connectors.push(CHAdeMO_cp/*.connectorName*/);
                  }
                  if (CCS1_cp !== undefined &&
                    CCS1_cp.status !== "Notexist" &&
                    CCS1_cp.status !== "Unavailable" &&
                    CCS1_cp.status !== "Faulted") {
                    connectors.push(CCS1_cp/*.connectorName*/);
                  }
                  if (CCS2_cp !== undefined &&
                    CCS2_cp.status !== "Notexist" &&
                    CCS2_cp.status !== "Unavailable" &&
                    CCS2_cp.status !== "Faulted") {
                    connectors.push(CCS2_cp/*.connectorName*/);
                  }
                  if (GBT_cp !== undefined &&
                    GBT_cp.status !== "Notexist" &&
                    GBT_cp.status !== "Unavailable" &&
                    GBT_cp.status !== "Faulted") {
                    connectors.push(GBT_cp/*.connectorName*/);
                  }
                  if (Car_AC_GBT !== undefined &&
                    Car_AC_GBT.status !== "Notexist" &&
                    Car_AC_GBT.status !== "Unavailable" &&
                    Car_AC_GBT.status !== "Faulted") {
                    connectors.push(Car_AC_GBT/*.connectorName*/);
                  }

                  if (Type1_cp !== undefined &&
                    Type1_cp.status !== "Notexist" &&
                    Type1_cp.status !== "Unavailable" &&
                    Type1_cp.status !== "Faulted") {
                    connectors.push(Type1_cp/*.connectorName*/);
                  }
                  if (AC_Type2_cp !== undefined &&
                    AC_Type2_cp.status !== "Notexist" &&
                    AC_Type2_cp.status !== "Unavailable" &&
                    AC_Type2_cp.status !== "Faulted") {
                    connectors.push(AC_Type2_cp/*.connectorName*/);
                  }
                  if (Chaoji_cp !== undefined &&
                    Chaoji_cp.status !== "Notexist" &&
                    Chaoji_cp.status !== "Unavailable" &&
                    Chaoji_cp.status !== "Faulted") {
                    connectors.push(Chaoji_cp/*.connectorName*/);
                  }

                  //------------------------bus-------------------------
                  if (Type2_GB_cp !== undefined &&
                    Type2_GB_cp.status !== "Notexist" &&
                    Type2_GB_cp.status !== "Unavailable" &&
                    Type2_GB_cp.status !== "Faulted") {
                    connectors.push(Type2_GB_cp/*.connectorName*/);
                  }
                  if (BUS_Type2_cp !== undefined &&
                    BUS_Type2_cp.status !== "Notexist" &&
                    BUS_Type2_cp.status !== "Unavailable" &&
                    BUS_Type2_cp.status !== "Faulted") {
                    connectors.push(BUS_Type2_cp/*.connectorName*/);
                  }
                  if (BUS_CCS2_cp !== undefined &&
                    BUS_CCS2_cp.status !== "Notexist" &&
                    BUS_CCS2_cp.status !== "Unavailable" &&
                    BUS_CCS2_cp.status !== "Faulted") {
                    connectors.push(BUS_CCS2_cp/*.connectorName*/);
                  }

                  //-------------------------motor----------------------
                  if (AC_Motorcycle_cp !== undefined &&
                    AC_Motorcycle_cp.status !== "Notexist" &&
                    AC_Motorcycle_cp.status !== "Unavailable" &&
                    AC_Motorcycle_cp.status !== "Faulted") {
                    connectors.push(AC_Motorcycle_cp/*.connectorName*/);
                  }
                  if (Motor_AC_Type1_cp !== undefined &&
                    Motor_AC_Type1_cp.status !== "Notexist" &&
                    Motor_AC_Type1_cp.status !== "Unavailable" &&
                    Motor_AC_Type1_cp.status !== "Faulted") {
                    connectors.push(Motor_AC_Type1_cp/*.connectorName*/);
                  }
                  if (Motor_AC_Type2_cp !== undefined &&
                    Motor_AC_Type2_cp.status !== "Notexist" &&
                    Motor_AC_Type2_cp.status !== "Unavailable" &&
                    Motor_AC_Type2_cp.status !== "Faulted") {
                    connectors.push(Motor_AC_Type2_cp/*.connectorName*/);
                  }
                  //------------------------end motor--------------------

                  console.log("messageSentToApp connectors: ", connectors);
                  logger.debug(" messageSentToApp Connectors : ", connectors);

                  //ws.currencyUnit = cpInfo.currencyUnit;
                  ws.send(JSON.stringify({ cpID: data.cpID, action: 'Connectors', connectors: connectors }));

                  // let ws_ = await wsClient.find(ws__ => ws.device_id === ws__.device_id);
                  // if(ws_){
                  //   if(ws_.readyState === ws_.OPEN){
                  //     ws_.cpID = data.cpID;
                  //   }else{
                  //     ws_.open();
                  //     ws_.cpID = data.cpID;
                  //   }

                  //   //ws.close();

                  // }else{

                  //   ws.cpID = data.cpID;
                  //   ws.device_id = data.device_id;
                  //   wsClient.push(ws);
                  // }

                } else {

                  ws.send(JSON.stringify({ cpID: data.cpID, action: 'problemOccured', message: 'خطا در شناسایی شارژر.', messageEN: 'Error in charger recognition.' })); // to app
                  //ws.close();

                  logger.debug(" messageSentToApp in new connection problemOccured1 ");

                }
              });
          } else {

            ws.send(JSON.stringify({ cpID: data.cpID, action: 'problemOccured', message: 'خطا در شناسایی شارژر.', messageEN: 'Error in charger recognition.' })); // to app
            //ws.close();

            logger.debug(" messageSentToApp in new connection problemOccured2 ");

          }
          break;

        case 'cpChanged':
          let ws_ = await wsClient.find(ws__ => ws.id === ws__.id);

          if (ws_) {
            ws_.cpID = data.cpID;

          } else {

            ws.cpID = data.cpID;
            wsClient.push(ws);
          }

          break;
        case 'userconnecting':

          try {



            const decoded = await jwt.verify(
              data.token.split(' ')[1],
              keys.secretOrKey,
            );

            console.log('\n');
            console.log(" userconnecting phone, data: ", decoded.phone, data);
            logger.debug(" userconnecting phone, data: ", decoded.phone, data);

            let prf = await profileModel
              .findOne(
                {
                  phone: decoded.phone
                }
              )
              .lean()
              .exec();
            console.log("typeof(data.connectorId)", typeof (data.connectorId));
            if (typeof (data.connectorId) === 'object' && data.connectorId.connectorName) {
              data.connectorId = data.connectorId.connectorName;
            }

            let prof = '';
            if (prf && prf.rfids !== undefined && prf.rfids.length > 0) {

              prof = await profileModel.findOne({
                phone: decoded.phone,
                rfids: { $elemMatch: { 'chargeInfo.CPID': data.cpID } }
              });


            } else {

              prof = await profileModel.findOne({
                phone: decoded.phone,
                'chargeByPhoneInfo.CPID': data.cpID
              });

            }
            //if prof is found, this means probably the user is in the middle of charging process

            console.log("data.connector", data.connectorId);
            //if connector is not charging

            let client_tmp = '';
            if (clients[data.cpID]) {
              client_tmp = clients[data.cpID];
            } else {
              clients[data.cpID] = {}
            }

            // if (data.connectorId !== undefined)
            //   clients[data.cpID].connectorId = data.connectorId;

            // clients[data.cpID].prefixe = prf.prefixe;

            // let cp_tmp = await ocpp_chargepointModel.findOne(
            //   {
            //     CPID: data.cpID
            //   }
            // )
            //   .lean()
            //   .exec();

            // if (cp_tmp) {
            //   clients[data.cpID].currencyUnit = cp_tmp.currencyUnit;
            // }

            let chPoint = await ocpp_chargepointModel.findOne(
              {
                CPID: data.cpID,
                connector: {
                  $elemMatch:
                  {
                    connectorName: data.connectorId,
                    status: { $ne: 'Charging' }
                  }
                }
              })
              .lean()
              .exec();
            console.log("data.first", data.first, prof, chPoint, data.connectorId, data.cpID);
            if ((chPoint !== undefined && chPoint !== null && chPoint !== '') || (prof && !data.first)) {

              //clients[cpID] = ws;

              if (chPoint !== undefined && chPoint !== null) {
                clients[data.cpID].stationID = chPoint.stationId;
                clients[data.cpID].coordinates = chPoint.location.coordinates;
                clients[data.cpID].stationName = chPoint.location.name;
                clients[data.cpID].stationNameEN = chPoint.location.nameEn;
              }
              //clients[data.cpID].prefixe = prf.prefixe;

              if (client_tmp) {
                clients[data.cpID].phone = client_tmp.phone;
                clients[data.cpID].idTag = client_tmp.idTag;
                clients[data.cpID].logID = client_tmp.logID;
              }

              //clients[data.cpID].connectorName = data.connectorName;


              if (prof) {

                if (data.first) {

                  if (prof.rfids !== undefined && prof.rfids.length > 0) {
                    let rfidToFree = prof.rfids.find(rfid => rfid.chargeInfo !== undefined &&
                      rfid.chargeInfo.CPID === data.cpID);

                    if (rfidToFree && rfidToFree !== undefined) {
                      await freeChargeInfo(prof.phone, rfidToFree.rfidserial);
                    }

                  } else {
                    await freeChargeInfo(prof.phone);
                  }

                  const cptmp = await ocpp_chargepointModel
                    .findOne({ CPID: data.cpID })
                    .exec();
                  //.select({location: 1});

                  if (cptmp === undefined || cptmp === null) {
                    cptmp = '';
                  } else {
                    console.log("cptmp.currencyUnit1", cptmp.currencyUnit, cptmp);
                    clients[data.cpID].currencyUnit = cptmp.currencyUnit;

                    if (data.connectorId !== undefined)
                      clients[data.cpID].connectorId = data.connectorId;

                    clients[data.cpID].prefixe = prf.prefixe;

                  }

                  ws.send(JSON.stringify({ cpID: data.cpID, action: 'authenticated', cp: cptmp })); // to app

                  logger.debug(" messageSentToApp in userconnecting authenticated first=: ", data.first, cptmp);
                  console.log(" messageSentToApp in userconnecting authenticated first=: ", data.first, cptmp);

                } else {

                  if (charging) {
                    let ws_ = await wsClient.find(ws__ => data.cpID === ws__.cpID);
                    if (ws_) {

                      ws_.close();
                      let index = await wsClient.indexOf(ws_);
                      wsClient.splice(index, 1);

                    }

                    ws.cpID = data.cpID;
                    //ws.device_id = data.device_id;
                    wsClient.push(ws);

                    ws.send(JSON.stringify({ cpID: data.cpID, action: 'ContinueCharging' }));
                    logger.debug(" userconnecting ContinueCharging ");

                  } else {

                    if (prof.rfids !== undefined && prof.rfids.length > 0) {
                      let rfidToFree = prof.rfids.find(rfid => rfid.chargeInfo !== undefined &&
                        rfid.chargeInfo.CPID === data.cpID);

                      if (rfidToFree && rfidToFree !== undefined) {
                        await freeChargeInfo(prof.phone, rfidToFree.rfidserial);
                      }
                    } else {
                      await freeChargeInfo(prof.phone);
                    }

                    const cptmp = await ocpp_chargepointModel
                      .findOne({ CPID: data.cpID })
                      .exec();
                    //.select({location: 1});
                    console.log("cptmp.currencyUnit2", cptmp.currencyUnit);

                    clients[data.cpID].currencyUnit = cptmp.currencyUnit;

                    if (data.connectorId !== undefined)
                      clients[data.cpID].connectorId = data.connectorId;

                    clients[data.cpID].prefixe = prf.prefixe;

                    ws.send(JSON.stringify({ cpID: data.cpID, action: 'authenticated', cp: cptmp })); // to app

                    logger.debug(" messageSentToApp in userconnecting authenticated first: ", data.first, cptmp);
                    console.log(" messageSentToApp in userconnecting authenticate first: ", data.first, cptmp);
                  }
                }

              } else {

                if (data.first) {

                  let proff = await profileModel.findOne({
                    phone: decoded.phone,
                  });

                  if (proff) {

                    const cptmp = await ocpp_chargepointModel
                      .findOne({ CPID: data.cpID })
                      .exec();
                    //.select({location: 1});
                    console.log("cptmp.currencyUnit3", cptmp.currencyUnit);

                    clients[data.cpID].currencyUnit = cptmp.currencyUnit;

                    if (data.connectorId !== undefined)
                      clients[data.cpID].connectorId = data.connectorId;

                    clients[data.cpID].prefixe = prf.prefixe;

                    ws.send(JSON.stringify({ cpID: data.cpID, action: 'authenticated', cp: cptmp })); // to app

                    logger.debug(" messageSentToApp in userconnecting authenticated first=true&&roome=cleaned: ", cptmp);
                    console.log(" messageSentToApp in userconnecting authenticated first=true&&roome=cleaned: ", cptmp);

                  } else {

                    ws.send(JSON.stringify({ cpID: data.cpID, action: 'unauthorized' }));
                    //ws.close();

                    logger.debug(" messageSentToApp unauthorized profile not found: ", decoded.phone);
                    console.log(" messageSentToApp unauthorized profile not found: ", decoded.phone);

                    if (clients[data.cpID]) {
                      console.log(" messageSentToApp delete socket ");
                      logger.debug(" messageSentToApp delete socket ");

                      delete clients[data.cpID];
                    }

                    if (cpIDs[data.cpID]) {
                      delete cpIDs[data.cpID];
                    }

                  }

                } else {

                  const ocppJson = { transactionId: cpIDs[data.cpID].transactionId };

                  let trans = await ocpp_transaction
                    .findOne({
                      transactionId: cpIDs[data.cpID].transactionId
                    })
                    .lean()
                    .exec();

                  let kwh = 0;
                  let currency = 0;
                  let currencyUsd = 0;
                  let reason = '';

                  if (trans) {
                    kwh = trans.KWH;
                    reason = trans.reason;
                  }

                  let record = await ChargeRecordModel.findOne({
                    transactionId: cpIDs[data.cpID].transactionId
                  })
                    .lean()
                    .exec();

                  if (record) {
                    currency = record.currency;
                    currencyUsd = record.currencyUsd;
                  }

                  logger.debug('ws.readyState in userconnecting, problem and send stopCharging to app', ws.readyState, 'cpIDs[data.cpID].transactionId', cpIDs[data.cpID].transactionId);
                  ws.send(JSON.stringify({ cpID: data.cpID, action: 'stopCharging', kwh, currency, currencyUsd, reason })); // to app

                  // to OCPP


                  if (
                    wsOcpp.readyState === wsOcpp.OPEN &&
                    validateSchema.validate(ocppJson, RemoteStopTransaction).valid
                  ) {

                    wsOcpp.send(
                      JSON.stringify([5, data.cpID, 'RemoteStopTransaction', ocppJson])
                    );

                    logger.debug(" messageSentToApp in userconnecting stopCharging data.first==false&&prof==null ");
                    logger.debug(" messageSentToOCPP in userconnecting RemoteStopTransaction ");

                  } else {
                    logger.debug("ocppJson dataType is not valid and the message RemoteStopTransaction is not sent to OCPP");
                    console.log("ocppJson dataType is not valid and the message RemoteStopTransaction is not sent to OCPP");
                  }
                }
              }

            }
            else {
              ws.send(JSON.stringify({
                cpID: data.cpID,
                action: 'problemOccured', message: 'ط´ط§ط±عکط± ط¯ط±ط­ط§ظ„ ط§ط±ط§ط¦ظ‡ ط³ط±ظˆغŒط³ ظ…غŒâ€Œط¨ط§ط´ط¯. ط§ظ…ع©ط§ظ† ط´ط±ظˆط¹ ط´ط§ط±عک ظˆط¬ظˆط¯ ظ†ط¯ط§ط±ط¯',
                messageEN: 'Charger is serving another process, currently a new charge process is not allowed.'
              })); // to app
              //ws.close();

              if (prof && data.first) {

                if (prof.rfids !== undefined && prof.rfids.length > 0) {

                  let rfidToFree = prof.rfids.find(rfid => rfid.chargeInfo !== undefined &&
                    rfid.chargeInfo.CPID === data.cpID);

                  if (rfidToFree) {
                    await freeChargeInfo(prof.phone, rfidToFree.rfidserial);
                  }

                } else {
                  await freeChargeInfo(prof.phone);
                }

              }
            }

          } catch (err) {

            if (err === 'jwt expired') {
              logger.debug(" userconnecting tokenExpired ", err);
              console.log(" userconnecting tokenExpired ", err);
            } else {
              logger.debug(" messageSentToApp in userconnecting problemOccured: ", err);
              console.log(" messageSentToApp in userconnecting problemOccured: ", err);
            }

            ws.send(JSON.stringify({
              cpID: data.cpID,
              action: 'problemOccured', message: 'ط®ط·ط§ ط¯ط± ط´ظ†ط§ط³ط§غŒغŒ ع©ط§ط±ط¨ط± غŒط§ ط´ط§ط±عکط±.',
              messageEN: 'Error in client or charger recognition.'
            })); // to app
            //ws.close();

            if (clients[data.cpID]) {
              console.log(" userconnecting socket delete ");
              logger.debug(" userconnecting socket delete ");

              await freeChargeInfo(clients[data.cpID].phone, clients[data.cpID].idTag);

              delete clients[data.cpID];
            }

            if (cpIDs[data.cpID]) {
              delete cpIDs[data.cpID];
            }
          }
          break;
        // /////////////////////////////// USER APPROVED //////////////////////////////
        // from app
        case 'userapproved':
          logger.debug(" messageReceivedApp userapproved ");
          console.log(" messageReceivedApp userapproved ");

          try {
            const decoded = await jwt.verify(
              data.token.split(' ')[1],
              keys.secretOrKey
            );
            let currency = 0;

            await profileModel
              .findOne(
                {
                  phone: decoded.phone
                }
              )
              .then(async (profilee) => {
                if (profilee) {

                  let prf_rfid = null;
                  if (profilee.rfids !== undefined) {
                    prf_rfid = profilee.rfids.find(rfid => rfid.private === true && rfid.status === "Accepted");

                  }

                  if (prf_rfid === undefined || prf_rfid === null) {

                    if (profilee.rfids !== undefined) {
                      prf_rfid = profilee.rfids.find(rfid => rfid.private === false && rfid.status === "Accepted");
                    }

                  }

                  console.log("profilee.rfids", profilee.rfids, prf_rfid);
                  logger.debug("profilee.rfids", profilee.rfids, prf_rfid);


                  clients[data.cpID].phone = decoded.phone;
                  clients[data.cpID].prefixe = profilee.prefixe;

                  let chargeInfo = {
                    CPID: data.cpID
                  }

                  if (prf_rfid !== undefined && prf_rfid !== null && prf_rfid.rfidserial) {
                    clients[data.cpID].idTag = prf_rfid.rfidserial;//--------to save idTag

                    await profileModel
                      .updateOne(
                        {
                          _id: profilee._id,
                          rfids: {
                            $elemMatch: {
                              rfidserial: prf_rfid.rfidserial
                            }
                          }
                        },
                        {
                          $set: {
                            'rfids.$.chargeInfo': chargeInfo
                          }
                        }
                      )
                      .exec();

                  } else {

                    if (!profilee.rfids || (profilee.rfids && profilee.rfids.length) === 0) {

                      clients[data.cpID].idTag = decoded.phone;

                      await profileModel
                        .updateOne(
                          {
                            _id: profilee._id
                          },
                          {
                            $set: {
                              chargeByPhoneInfo: chargeInfo
                            }
                          }
                        )
                        .exec();

                    } else {

                      //if the client has registered rfidserial, he is not allowed to charge by phone.
                      if (wsOcpp.readyState === wsOcpp.OPEN) {

                        wsOcpp.send(
                          JSON.stringify([5, data.cpID, 'Authorize', { status: 'Block', idTag: clients[data.cpID].idTag }])
                        );

                        ws.send(JSON.stringify({
                          cpID: data.cpID,
                          action: 'problemOccured', message: 'ط®ط·ط§! طھط¹ط¯ط§ط¯ ط¯ظپط¹ط§طھ ط´ط§ط±عک ظ‡ظ…ط²ظ…ط§ظ† ط´ظ…ط§ ط§ط² ط­ط¯ ظ…ط¬ط§ط² ط¨غŒط´طھط± ط§ط³طھ.',
                          messageEN: 'Error! The number of your synchronized charge processes is out of valid range.'
                        })); // to app
                        //ws.close();

                      } else {
                        logger.debug('Error sending authorize block to ocpp, ocpp is not in ready state.');
                      }
                    }

                  }
                  console.log("currencyUnit", clients[data.cpID].currencyUnit, "profilee.currencyUsd", profilee.currencyUsd);
                  //Check if currency is enough. if it is > 0
                  if ((/*parseInt(profilee.prefixe) === 98*/ clients[data.cpID].currencyUnit === 'IR' && profilee.currency > 0) ||
                    (/*parseInt(profilee.prefixe) !== 98*/ clients[data.cpID].currencyUnit !== 'IR' && profilee.currencyUsd > 0)) {

                    currency = profilee.currency;
                    const currencyUsd = profilee.currencyUsd;

                    let ws_ = await wsClient.find(ws__ => data.cpID === ws__.cpID);
                    if (ws_) {
                      // if(ws_.readyState === ws_.OPEN){
                      //   ws_.cpID = data.cpID;
                      // }else{
                      //   let index = await wsClient.indexOf(ws_);
                      //   wsClient.splice(index, 1);
                      //   ws.cpID = data.cpID;
                      //   ws.device_id = data.device_id;
                      //   wsClient.push(ws);
                      // }

                      ws_.close();
                      let index = await wsClient.indexOf(ws_);
                      wsClient.splice(index, 1);

                    }//else{

                    ws.cpID = data.cpID;
                    ws.device_id = data.device_id;
                    wsClient.push(ws);


                    ws.send(

                      JSON.stringify({
                        cpID: data.cpID,
                        action: 'approved',
                        phone: decoded.phone,
                        prefixe: profilee.prefixe,
                        currencyUnit: clients[data.cpID].currencyUnit,
                        currency: currency,
                        currencyUsd: currencyUsd
                      })

                    ); // to app

                    logger.debug(" messageSentToApp approved currency: ", currency, currencyUsd);
                    console.log(" messageSentToApp approved currency: ", currency, currencyUsd);
                    // to OCPP

                    logger.debug("data.cpID in userApproved", data.cpID, clients[data.cpID])
                    const ocppJson = { idTag: clients[data.cpID].idTag, connectorName: clients[data.cpID].connectorId };

                    if (
                      wsOcpp.readyState === wsOcpp.OPEN &&
                      validateSchema.validate(ocppJson, RemoteStartTransaction).valid
                    ) {

                      wsOcpp.send(JSON.stringify([5, data.cpID, 'RemoteStartTransaction', ocppJson]));

                      charging = true;

                      logger.debug(" messageSentToOCPP in userapproved RemoteStartTransaction: ", ocppJson);

                    } else {
                      logger.debug("ocppJson dataType is not valid. message RemoteStartTransaction is not sent to OCPP");
                      console.log("ocppJson dataType is not valid. message RemoteStartTransaction is not sent to OCPP");
                    }

                    logger.debug("APPROVED ");
                    console.log('APPROVED');
                    //}
                  } else if (wsOcpp.readyState === wsOcpp.OPEN) {

                    wsOcpp.send(
                      JSON.stringify([5, data.cpID, 'Authorize', { status: 'Block', idTag: clients[data.cpID].idTag }])
                    );

                    ws.send(JSON.stringify({ cpID: data.cpID, action: 'problemOccured', message: 'ظ…ظˆط¬ظˆط¯غŒ ظ†ط§ع©ط§ظپغŒ.', messageEN: 'Not sufficient currency.' })); // to app
                    //ws.close();

                    logger.debug(" messageSentToOCPP in userapproved Authorize: ", { status: 'Block', idTag: clients[data.cpID].idTag });
                    console.log("User's currency is not sufficient, messageSentToOCPP in userapproved Authorize blocked.");
                  } else {
                    logger.debug('Not sufficient currency, but ocpp in not in ready state so the message authorize block is not sent.');
                  }
                }
              });

          } catch (err) {
            console.log("catch err:", err);
            logger.debug("catch err:", err);

            ws.send(JSON.stringify({ cpID: data.cpID, action: 'unapproved' })); // to app
            //ws.close();

            logger.debug(" messageSentToApp in userapproved unapproved ");
            console.log(" messageSentToApp in userapproved unapproved ");

            if (clients[data.cpID]) {
              logger.debug(" socket delete in userapproved ");
              console.log(" socket delete in userapproved ");

              await freeChargeInfo(clients[data.cpID].phone, clients[data.cpID].idTag);

              delete clients[data.cpID];
            }

            if (cpIDs[data.cpID]) {
              delete cpIDs[data.cpID];
            }

          }
          break;

        // //////////////////////////////////// USER STOP ////////////////////////////////
        // from app
        case 'userstop':

          logger.debug(" messageReceivedApp userstop ");
          console.log(" messageReceivedApp userstop ");

          charging = false;
          try {
            const decoded = await jwt.verify(
              data.token.split(' ')[1],
              keys.secretOrKey,
            );
            let prof = await profileModel.findOne({ phone: decoded.phone });
            if (prof) {

              logger.debug(" messageSentToApp in userstop disconnect: wsOcpp.readyState: ", wsOcpp.readyState,
                " cpIDs[cpID].transactionId: ", cpIDs[data.cpID].transactionId);

              console.log(" messageSentToApp in userstop disconnect: wsOcpp.readyState: ", wsOcpp.readyState,
                " cpIDs[cpID].transactionId: ", cpIDs[data.cpID].transactionId);

              ws.send(JSON.stringify({ cpID: data.cpID, action: 'disconnect' }));

              // to OCPP
              const ocppJson = { transactionId: cpIDs[data.cpID].transactionId };
              if (
                wsOcpp.readyState === wsOcpp.OPEN &&
                validateSchema.validate(ocppJson, RemoteStopTransaction).valid
              ) {
                wsOcpp.send(
                  JSON.stringify([5, data.cpID, 'RemoteStopTransaction', ocppJson]),
                );

                logger.debug(" messageSentToOCPP in userstop RemoteStopTransaction: ", ocppJson);

              } else {
                logger.debug("ocppJson dataType is not valid and the RemoteStopTransaction message is not sent to OCPP");
                console.log("ocppJson dataType is not valid and the RemoteStopTransaction message is not sent to OCPP");
              }
            }
          } catch (err) {
            logger.debug(" error in userstop: ", err);
            console.log(" error in userstop: ", err);
          }
          break;
        // ////////////////////////////////////////// USER DISSCONNECT //////////////////////////////

        case 'error':
          logger.debug(" messageReceivedApp error ");

          charging = false;

          ws.send(JSON.stringify({ cpID: data.cpID, action: 'error', data: data }));
          logger.debug(" messageSentToApp in error error: ", data);

          // to OCPP
          const ocppJson = { transactionId: cpIDs[data.cpID].transactionId };
          if (
            wsOcpp.readyState === wsOcpp.OPEN &&
            validateSchema.validate(ocppJson, RemoteStopTransaction).valid
          ) {
            wsOcpp.send(
              JSON.stringify([5, data.cpID, 'RemoteStopTransaction', ocppJson]),
            );

            logger.debug(" messageSentToOCPP in error RemoteStopTransaction: ", ocppJson);

          } else {
            logger.debug("ocppJson dataType is not valid and the message RemoteStopTransaction is not sent to OCPP");
            console.log("ocppJson dataType is not valid and the message RemoteStopTransaction is not sent to OCPP");
          }
          break;

        case 'pingg':
          logger.debug('pingg pongg');
          logger.debug("number of opened sockets in ping pong: ", wss.clients.size, "sockettttttttt", ws);

          ws.send(JSON.stringify({ action: 'pongg' }));
          break;

        case 'getAllChargers':

          const decoded = await jwt.verify(
            data.token.split(' ')[1],
            keys.secretOrKey,
          );
          logger.debug('getAllChargers', data, decoded, decoded.phone);

          logger.debug(" getAllChargers phone, data: ", decoded.phone);

          let prf = await profileModel
            .findOne(
              {
                phone: decoded.phone
              }
            )
            .lean()
            .exec();


          let chargers = await ocpp_chargepointModel
            .find()
            .lean()
            .exec()
            /*.select({ status: 1, usageType: 1 })*/;

          let privates = [];
          let publics = [];
          let chargings = [];

          if (prf) {

            privates = await chargers.filter(ch => ch.usageType === 'private' && ch.userPhone === prf.phone);

            await Promise.all(prf.rfids.map(rf => {

              if (rf.chargeInfo && rf.chargeInfo.CPID) {
                chargings.push(rf.chargeInfo.CPID);
              }

            }));

            publics = await chargers.filter(ch => ch.usageType === 'public' &&
              ((prf.chargeByPhoneInfo && prf.chargeByPhoneInfo.CPID && prf.chargeByPhoneInfo.CPID === ch.CPID)) ||
              (chargings.includes(ch.CPID)));

            logger.debug('getAllChargers privates, publics', privates, publics);

            ws.send(JSON.stringify({ action: 'allChargers', privates, publics }));

          } else {
            ws.send(JSON.stringify({ action: 'allChargers', privates: [], publics: [] }));
          }

          break;

        case 'stopRecievingData':

          if (data.cpID) {

            const decoded = await jwt.verify(
              data.token.split(' ')[1],
              keys.secretOrKey,
            );

            logger.debug(" getAllChargers phone, data: ", decoded.phone);

            let prf = await profileModel
              .findOne(
                {
                  phone: decoded.phone
                }
              )
              .lean()
              .exec();

            if (prf) {

              let ws_client_ = await wsClient.find(ws__ => ws__.cpID === data.cpID);

              if (ws_client_) {
                ws_client_.cpID = '';
              }

              delete clients[data.cpID];
              delete cpIDs[data.cpID];

              logger.debug('stopRecievingData for ', data.cpID);
            } else {
              ws.send(
                JSON.stringify({ cpID: data.cpID, action: 'problemOccured', message: 'خطا در شناسایی کاربر', messageEN: 'User is not Valid.' }),
              );
            }

          } else {
            ws.send(
              JSON.stringify({ cpID: data.cpID, action: 'problemOccured', message: 'خطا در شناسایی شارژر', messageEN: 'cpID is not Valid.' }),
            );
          }
          break;
      }
    }
  });
});

//httpsServer.listen(5012);
