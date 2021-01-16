/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/**
 * Packages in alphabetic order
 */

//-----wss----------
'use strict';
const fs = require('fs');
const Https = require('https');

// const httpsServer = Https.createServer({
//   cert: fs.readFileSync('/etc/pki/tls/certs/ca.crt'),
//   key: fs.readFileSync('/etc/pki/tls/private/ca.key')
// });
//-----wss---------- 

const Validator = require('jsonschema').Validator; // To use jsonschema package
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

//--------wss-----------
const WebSocketServer = require('ws').Server;
const WebSocket = require('ws');
//--------wss-----------

const keys = require('./config/keys');
const db = require('./config/keys').mongoURI; // DB Config
const chargePointModel = require('./models/chargepoints/chargePoint');
const ChargeRecordModel = require('./models/chargeRecord');
const profileModel = require('./models/Profile');

const RemoteStartTransaction = require('./schema/RemoteStartTransaction.json');
const RemoteStartTransactionResponse = require('./schema/RemoteStartTransactionResponse.json');
const RemoteStopTransaction = require('./schema/RemoteStopTransaction.json');
const RemoteStopTransactionResponse = require('./schema/RemoteStopTransactionResponse.json');
const StartTransactionResponse = require('./schema/StartTransactionResponse.json');
const StopTransactionResponse = require('./schema/StopTransactionResponse.json');
const meterAPP = require('./schema/meterAPP.json');
const traffApp = require('./schema/traffAPP.json');

const validateSchema = new Validator();

let payload = 200;

let dbCollection ='';
let profileCollection = '';
let wsOcpp = '';
// Connect to MongoDB
mongoose
    .connect(db, {useNewUrlParser: true, useFindAndModify: false})
    .then(() => {
      console.log('MongoDB Connected');
      const client = mongoose.connection.client;
      dbCollection = client.db('dashboard_db');
      profileCollection = dbCollection.collection('profiles');

      let profileChangeStream = '';
      profileChangeStream = profileCollection.watch();
      profileChangeStream.on('change', next=>{

        if(next.operationType === 'insert'){
            
            console.log('profile insert.', next.fullDocument);            
            if(wsOcpp.readyState === wsOcpp.OPEN) {
              wsOcpp.send(
                JSON.stringify([5, '', 'NewUser', {phone: next.fullDocument.phone, rfidserial: next.fullDocument.rfidserial ? next.fullDocument.rfidserial : ''}])
            );
            }
        }
            
      });
    })
    .catch((err) => console.log(err));

let charging = false;
const cpIDs = {};
const clients = {};

function connect() {
  const urlOcpp = 'ws://www.mapev.ir:5007/ocpp/APP';
  wsOcpp = new WebSocket(urlOcpp);

  wsOcpp.on('open', function open() {
    console.log('connecting to ocpp server');

    wsOcpp.on('message', async function(message) {
      if (message) {
        console.log("message", message);
        const data = JSON.parse(message);
        if (data.length > 0) {
          try {
            switch (data[2]) {

              case 'Tariff':
                
                if(
                  validateSchema.validate(
                    data[3],
                    traffApp,
                  ).valid
                ) {
                  payload = data[3].tariff;
                }

                break;
              case 'RemoteStartTransaction':
                console.log(data);

                if (
                  validateSchema.validate(
                      data[3],
                      RemoteStartTransactionResponse,
                  ).valid &&
                  data[3].status === 'Accepted'
                ) {
                  // send startChargingRes to app
                  if (clients[data[1]].readyState === clients[data[1]].OPEN) {
                    clients[data[1]].send(
                        JSON.stringify({action: 'startChargingRes'}),
                    );
                  }
                } else {
                  // data format is not valid

                  let err_msg = '';
                  if(data[3].status === 'Rejected'){
                    err_msg = data[3].reason;
                  }else{
                    err_msg = 'خطای سرور';
                  }

                  if (clients[data[1]].readyState === clients[data[1]].OPEN) {
                    clients[data[1]].send(
                        JSON.stringify({action: 'problemOccured', message: err_msg}),
                    ); // to app

                    clients[data[1]].close();
                    
                    if(clients[data[1]]){console.log("delete11");
                      delete clients[data[1]];
                    }
            
                    if(cpIDs[data[1]]){
                      delete cpIDs[data[1]];
                    }

                  }
                }
                break;

              case 'StartTransaction':
                
                console.log(data);
                charging = true;
                if (
                  validateSchema.validate(data[3], StartTransactionResponse)
                      .valid
                ) {

                  cpIDs[data[1]].transactionId = data[3].transactionId;
                  cpIDs[data[1]].meterStart = data[3].meterStart;

                  // send chargeData to app
                  if (clients[data[1]].readyState === clients[data[1]].OPEN) {

                    profileModel.findOne(
                      {
                        phone: clients[data[1]].phone
                      }
                    )
                    .then((profile) => {

                      if(profile){
                        //------check idTag then send
                        if(profile.rfidserial === clients[data[1]].idTag /*|| profile.phone === clients[data[1]].idTag*/){

                          clients[data[1]].send(
                            JSON.stringify({
                              action: 'chargeData',
                              percentage: 0,
                              kwh: 0,
                              currency: profile.currency,
                              phone: clients[data[1]].phone,
                              timer: 0,
                            }),
                          );

                        }
                      }
                      

                    })
                    .catch((err) => {
                      console.log(err);
                    })
                    
                  }
                } else {
                  // data format is not valid

                  console.log('inValid');
                  if (clients[data[1]].readyState === clients[data[1]].OPEN) {
                    clients[data[1]].send(
                        JSON.stringify({action: 'problemOccured', message: 'خطای سرور'}),
                    ); // to app

                    clients[data[1]].close();
                    
                    if(clients[data[1]]){console.log("delete10");
                      delete clients[data[1]];
                    }
            
                    if(cpIDs[data[1]]){
                      delete cpIDs[data[1]];
                    }

                  }
                }

                break;
              case 'MeterValues':
                charging = true;

                console.log("MeterValues", data, clients[data[1]].readyState, clients[data[1]].OPEN, validateSchema.validate(
                  data[3],
                  meterAPP
                ).valid);

                if (clients[data[1]].readyState === clients[data[1]].OPEN && validateSchema.validate(
                  data[3],
                  meterAPP
                ).valid) {
                  
                  console.log('mein parameters', data[3].meterValue.SOC, data[3].meterValue.KWH, cpIDs[data[1]].meterStart, payload);
                  clients[data[1]].send(
                      JSON.stringify({
                        action: 'chargeData',
                        percentage: data[3].meterValue.SOC,
                        kwh: data[3].meterValue.KWH - cpIDs[data[1]].meterStart,
                        currency: (data[3].meterValue.KWH - cpIDs[data[1]].meterStart) * payload,
                        phone: clients[data[1]].phone,
                        timer: data[3].timestamp,
                      }),
                  );
                }else{
                  if (clients[data[1]].readyState === clients[data[1]].OPEN) {
                    clients[data[1]].send(
                        JSON.stringify({action: 'problemOccured', message: 'خطای دریافت مقدار شارژ.'}),
                    ); // to app

                    clients[data[1]].close();
                    
                    if(clients[data[1]]){console.log("delete9");
                      delete clients[data[1]];
                    }
            
                    if(cpIDs[data[1]]){
                      delete cpIDs[data[1]];
                    }

                  }
                }

                break;
              case 'RemoteStopTransaction':
                charging = false;
                console.log(data);

                if (
                  validateSchema.validate(
                      data[3],
                      RemoteStopTransactionResponse,
                  ).valid &&
                  data[3].status === 'Accepted'
                ) {

                  console.log(
                      'data fromat is valid in RemoteStopTransactionResponse.',
                  );

                } else {

                  let err_msg = '';
                  if(data[3].status === 'Rejected'){
                    err_msg = data[3].reason;
                  }else{
                    err_msg = 'خطای سرور';
                  }

                  // data format is not valid
                  if (clients[data[1]].readyState === clients[data[1]].OPEN) {
                    clients[data[1]].send(
                        JSON.stringify({action: 'problemOccured', message: err_msg}),
                    ); // to app

                    clients[data[1]].close();

                    if(clients[data[1]]){console.log("delete8");
                      delete clients[data[1]];
                    }
            
                    if(cpIDs[data[1]]){
                      delete cpIDs[data[1]];
                    }

                  }
                }
                break;
              case 'Payment':

                let cRFID = 'C' + data[3].idTag;
                let mRFID = 'M' + data[3].idTag;

                    let remained_currency = 0;
                    profileModel.findOne(
                      {
                        $or : [{rfidserial: cRFID}, {rfidserial: mRFID}/*, {phone: data[3].idTag}*/]
                      }
                    )
                    .then(profile => {

                      if(profile){

                        let used_currency = (data[3].meterStop - data[3].meterStart) * data[3].tariff;
                        remained_currency = profile.currency - used_currency;

                        profileModel.findOneAndUpdate(
                          {
                            phone: profile.phone
                          },
                          {
                            $set: {
                              currency: remained_currency
                            },
                          }
                        ).then((pp) => {console.log("clients[data[1]] ", clients[data[1]]);
                          console.log("data[1]", data[1]);

                          console.log('Payment pp', pp);
                          ChargeRecordModel
                          .findOneAndUpdate(
                            {
                              _id: clients[data[1]].logID
                            },
                            {
                              currency: used_currency
                            }
                          )
                          .then(() => {
                            console.log("log saved successfully");

                            if(clients[data[1]]){console.log("delete7");
                              delete clients[data[1]];
                            }
                    
                            if(cpIDs[data[1]]){
                              delete cpIDs[data[1]];
                            }
                          })
                          .catch(err => {
                            console.log(err);
                            if(clients[data[1]]){console.log("delete7");
                              delete clients[data[1]];
                            }
                    
                            if(cpIDs[data[1]]){
                              delete cpIDs[data[1]];
                            }
                          });

                        });
                      }
                      
                    })
                    .catch(err => {
                      console.log(err);
                      if(clients[data[1]]){console.log("delete7");
                        delete clients[data[1]];
                      }
              
                      if(cpIDs[data[1]]){
                        delete cpIDs[data[1]];
                      }
                    });

                    

                break;
              case 'StopTransaction':
                charging = false;
                console.log(data);
                if (
                  validateSchema.validate(data[3], StopTransactionResponse)
                      .valid &&
                  clients[data[1]].readyState === clients[data[1]].OPEN
                ) {
                  console.log(
                      'data fromat is valid in StopTransactionResponse.',
                  );
                  clients[data[1]].send(
                      JSON.stringify({action: 'stopCharging'}),
                  );

                  //  let remained_currency = 0;
                  //   profileModel.findOne(
                  //     {
                  //       phone: clients[data[1]].phone
                  //     }
                  //   )
                  //   .then(profile => {
                  //     remained_currency = profile.currency - ((data[3].meterStop - cpIDs[data[1]].meterStart) * payload);

                  //     profileModel.findOneAndUpdate(
                  //       {
                  //         phone: clients[data[1]].phone
                  //       },
                  //       {
                  //         $set: {
                  //           currency: remained_currency
                  //         },
                  //       }
                  //     ).then(() => {});
                  //   })
                  //   .catch(err => {
                  //     console.log(err);
                  //   });

                  await profileModel.findOneAndUpdate(
                      {
                        room: data[1],
                      },
                      {
                        $set: {
                          room: ''/*,
                          currency: remained_currency*/
                        },
                      },
                  );

                  clients[data[1]].close();


                  console.log('Charge Finished and Room cleaned');
                } else {
                  // data format is not valid
                   if (clients[data[1]].readyState === clients[data[1]].OPEN) {
                    clients[data[1]].send(
                        JSON.stringify({action: 'problemOccured', message: 'خطای سرور'}),
                    ); // to app

                    clients[data[1]].close();

                    if(clients[data[1]]){console.log("delete6");
                      delete clients[data[1]];
                    }
            
                    if(cpIDs[data[1]]){
                      delete cpIDs[data[1]];
                    }

                  }
                }
                break;
              case 'Errors'://[6, cp1, "action","errorTxt"]
                //send completely to app

                charging = false;

                clients[data[1]].send(
                  JSON.stringify({action: 'error', data: data[3]}),
                );
                break;
              case 'Status'://[6, cp1,"action", {status : (0(unavailable),1(available),2(charging))}]
                break;
              default:
                console.log(data[2]);
            }
          } catch (err) {}
        }
      }
    });
  });

  wsOcpp.on('error', function err() {
    setTimeout(function() {
      connect();
    }, 1000);
  });

  wsOcpp.on('close', function err() {

    wss.clients.forEach(function each(client) {

      if (client.readyState === WebSocket.OPEN) {

        client.close();

        if(clients[client.cpID]){console.log("delete5");
          delete clients[client.cpID];
        }

        if(cpIDs[client.cpID]){
          delete cpIDs[client.cpID];
        }

      }
    });

    setTimeout(function() {
      connect();
    }, 15000);
  });
}

connect();

//------wss-------------
// const wss = new WebSocketServer({
//   server: httpsServer
// });
const wss = new WebSocket.Server({port: 5001});

// httpsServer.on('request', (req, res) => {
//   res.writeHead(200);
//   res.end('hello\n');
// });
//-------wss-------------


//const wss = new WebSocket.Server({port: 5012});
console.log('Socket server listening to port 5012');

wss.on('error', function err(err) {
  console.log(err);
});

wss.on('close', function err(err) {
  console.log(err);
});

wss.on('connection', async function connection(ws, req) {
  const url = req.url.split('/');
  let cpID = '';
  if (url.length > 1) cpID = url[4];
  if (cpID) {

    ws.cpID = cpID;

    if(!cpIDs[cpID])
      cpIDs[cpID] = {};

    let client_tmp = '';
    if(clients[cpID]){
      client_tmp = clients[cpID];
    }

    clients[cpID] = ws;

    if(clients[cpID]){

      clients[cpID].phone = client_tmp.phone;
      clients[cpID].idTag = client_tmp.idTag;
      clients[cpID].logID = client_tmp.logID;
    }
    
    chargePointModel.findOne(
      {
        chargePointID: cpID
      }
    )
    .then((cpInfo) => {
      if(cpInfo){

        let connectors = [];

        if(cpInfo.Chademo.has && cpInfo.Chademo.isAvailable)  connectors.push('Chademo');
        if(cpInfo.Ccs.has && cpInfo.Ccs.isAvailable)  connectors.push('Ccs');
        if(cpInfo.Gb.has && cpInfo.Gb.isAvailable)  connectors.push('Gb');
        if(cpInfo.Ac.has && cpInfo.Ac.isAvailable)  connectors.push('Ac');
	      console.log('connectors', connectors);
        ws.send(JSON.stringify({action:'Connectors', connectors: connectors}));

        if(clients[cpID]){

          clients[cpID].stationID = cpInfo.stationID;
          clients[cpID].coordinates = cpInfo.location.coordinates;
          clients[cpID].stationName = cpInfo.location.name;

        }
        
      }else{

        ws.send(JSON.stringify({action: 'problemOccured', message: 'خطا در شناسایی شارژر.'})); // to app
        ws.close();

        if(clients[cpID]){console.log("delete4");
          delete clients[cpID];
        }

        if(cpIDs[cpID]){
          delete cpIDs[cpID];
        }
          
      }
    });
  }

  console.log('one new point connected to room ', cpID);
  ws.on('message', async function(message) {
    if (message) {
      const data = JSON.parse(message);
      switch (data.action) {
        // /////////////////////////////////////// USERCONNECTING ///////////////////////////////
        // from app
        case 'userconnecting':
          console.log('User Connecting...');
          try {console.log('data', data);
            const decoded = await jwt.verify(
                data.token.split(' ')[1],
                keys.secretOrKey,
            );
		      console.log('decoded ', decoded);

            let prof = await profileModel.findOne({
              phone: decoded.phone,
              room: cpID,
            });

            ws.connectorId = data.connectorId;
            //console.log('ws.connectorId', ws.connectorId, prof);

            if (prof && !data.first) {
              if (charging) {
                ws.send(JSON.stringify({action: 'ContinueCharging'}));
              // eslint-disable-next-line brace-style
              }
              // to app
              else {
                
                const cptmp = await chargePointModel
                    .find({chargePointID: cpID})
                    .select({location: 1});
                ws.send(JSON.stringify({action: 'authenticated', cp: cptmp})); // to app

                console.log('User Authenticated');
              }
            }
            if (prof && data.first) {console.log('cptmp');
              const cptmp = await chargePointModel
                  .find({chargePointID: cpID})
                  .select({location: 1});
              console.log(cptmp);
              ws.send(JSON.stringify({action: 'authenticated', cp: cptmp})); // to app

              console.log('User Authenticated');
            }
            if (prof == null && data.first) {console.log('proff entery');
              let proff = await profileModel.findOne({
                phone: decoded.phone,
              });
		
              if (proff) {console.log('proff', proff);
                const cptmp = await chargePointModel
                    .find({chargePointID: cpID})
                    .select({location: 1});
               console.log('proff cptmp', cptmp);
                ws.send(JSON.stringify({action: 'authenticated', cp: cptmp})); // to app

                console.log('User Authenticated');
              } else {
                ws.send(JSON.stringify({action: 'unauthorized'})); // to app
                console.log('User unAuthenticated');
                ws.close(); // todo

                if(clients[cpID]){console.log("delete3");
                  delete clients[cpID];
                }
        
                if(cpIDs[cpID]){
                  delete cpIDs[cpID];
                }

              }
            }
            if (prof == null && !data.first) {
              ws.send(JSON.stringify({action: 'stopCharging'})); // to app

              // to OCPP
              const ocppJson = {itransactionId: cpIDs[cpID].transactionId};
              if (
                wsOcpp.readyState === wsOcpp.OPEN &&
                validateSchema.validate(ocppJson, RemoteStopTransaction).valid
              ) {
                wsOcpp.send(
                    JSON.stringify([5, cpID, 'RemoteStopTransaction', ocppJson]),
                );
              }
            }
          } catch (err) {console.log('err', err);
            if(err === 'jwt expired'){
              console.log('لاگین کاربر منقضی شده است.')
            }
            ws.send(JSON.stringify({action: 'problemOccured', message: 'خطا در شناسایی کاربر یا شارژر.'})); // to app
            ws.close();

            if(clients[cpID]){console.log("delete2");
              delete clients[cpID];
            }
    
            if(cpIDs[cpID]){
              delete cpIDs[cpID];
            }
          }
          break;
        // /////////////////////////////// USER APPROVED //////////////////////////////
        // from app
        case 'userapproved':
          console.log('User Approving...');
          try {
            const decoded = await jwt.verify(
                data.token.split(' ')[1],
                keys.secretOrKey,
            );
            let currency = 0;
            let rfidserial = '';

            await profileModel
                .findOneAndUpdate(
                    {
                      phone: decoded.phone,
                    },
                    {
                      $set: {
                        room: cpID,
                      },
                    },
                )
                .then((profilee) => {
                  if(profilee){

                      rfidserial = profilee.rfidserial;
                      
                      clients[cpID].phone = decoded.phone;
                      //if(rfidserial)
                        clients[cpID].idTag = rfidserial;//-------------------to save idTag
                      //else{
                        //clients[cpID].idTag = decoded.phone;
                      //}

                    //Check if currency is enough. if it is > 0
                    if(profilee.currency > 0){

                      currency = profilee.currency;
                      
                        ws.send(

                        JSON.stringify({
                          action: 'approved',
                          phone: decoded.phone,
                          currency: currency,
                        })

                      ); // to app

                      // to OCPP
                      
                      const ocppJson = {idTag: clients[cpID].idTag, connectorType: ws.connectorId/*1*/};

                      if (
                        wsOcpp.readyState === wsOcpp.OPEN &&
                        validateSchema.validate(ocppJson, RemoteStartTransaction).valid
                      ) {
                        wsOcpp.send(
                            JSON.stringify([5, cpID, 'RemoteStartTransaction', ocppJson]),
                        );
                      }

                      console.log('APPROVED');

                    }else if (wsOcpp.readyState === wsOcpp.OPEN) {

                        wsOcpp.send(
                            JSON.stringify([5, cpID, 'Authorize', {status: 'Block', idTag: clients[cpID].idTag}])
                        );

                    }
                  }
                });

          } catch (err) {
            ws.send(JSON.stringify({action: 'unapproved'})); // to app
            console.log('Not Approved');
            ws.close();

            if(clients[cpID]){console.log("delete1");
              delete clients[cpID];
            }
    
            if(cpIDs[cpID]){
              delete cpIDs[cpID];
            }

          }
          break;

        // //////////////////////////////////// USER STOP ////////////////////////////////
        // from app
        case 'userstop':
          console.log('User Stop');
          charging = false;
          try {
            const decoded = await jwt.verify(
                data.token.split(' ')[1],
                keys.secretOrKey,
            );
            let prof = await profileModel.find({phone: decoded.phone});
            if (prof) {console.log('userstop profile found',wsOcpp.readyState, cpIDs[cpID].transactionId);
              ws.send(JSON.stringify({action: 'disconnect'}));

              // to OCPP
              const ocppJson = {transactionId: cpIDs[cpID].transactionId};
              if (
                wsOcpp.readyState === wsOcpp.OPEN &&
                validateSchema.validate(ocppJson, RemoteStopTransaction).valid
              ) {
                wsOcpp.send(
                    JSON.stringify([5, cpID, 'RemoteStopTransaction', ocppJson]),
                );
              }
            }
          } catch (err) {
            console.log(err);
          }
          break;
          // ////////////////////////////////////////// USER DISSCONNECT //////////////////////////////

        // from app
        case 'startChargingRes1':
          const decoded = await jwt.verify(
              data.token.split(' ')[1],
              keys.secretOrKey,
          );
          let tmp = new ChargeRecordModel({
            cpId: cpID,
            phone: decoded.phone,
            carORmotor: data.carORmotor,
            chargertype: data.chargertype//,
            //location: 'برج میلاد',
          });

          tmp.save()
          .then(rec => {
            console.log(rec);
            clients[cpID].logID = rec._id;
          });

          break;

        case 'error':
          charging = false;

          ws.send(JSON.stringify({action: 'error', data: data}));

          // to OCPP
          const ocppJson = {transactionId: cpIDs[cpID].transactionId};
          if (
            wsOcpp.readyState === wsOcpp.OPEN &&
            validateSchema.validate(ocppJson, RemoteStopTransaction).valid
          ) {
            wsOcpp.send(
                JSON.stringify([5, cpID, 'RemoteStopTransaction', ocppJson]),
            );
          }
          break;
      }
    }
  });
});

//httpsServer.listen(5012);