var SmappeeAPI = require('smappee2mqtt');

var smappee = new SmappeeAPI({
    debug: true,

    clientId: "xxx",
    clientSecret: "xxx",

    username: "xxx",
    password: "xxx",

    mqtt_server: "192.168.0.1",
    mqtt_port: "1883",
    mqtt_baseTopic : "smappee/"
});

module.exports = smappee;