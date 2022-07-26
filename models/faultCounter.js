const mongoose = require('mongoose');
const schema = mongoose.Schema;

const faultCounter = new schema({
    fault:{
        date: Date,
        text: String,
        code: String,
        source: {
            type:String,
            enum:[
                "ocpp",
                "app",
                "server"
            ]
        }
    }
});

module.exports = faultCounterSchema = mongoose.model('faultCounter', faultCounter);