Please note : this fork is probably not working at this stage. I'm trying to edit it to get the refresh token working and add the EV Line charging session stuff. I did never code in Node JS so I'll see what I can do...
Todo list : 
- Store token in file ✅
- Read token from file ✅
- Request new token if token is expired ✅
- Implement EV line API requests ✅ (read current session only)
- Send data to MQTT server : partial
- Remove deprecated dependency : https://github.com/request/request/issues/3142

# Smappee2MQTT (with NodeJS)
This nodejs project allows to read data from the smappee API and send it to an MQTT server. Tested with Mosquitto MQTT server and openHab to import Electric Car (EV) charging session status and house consumption.

Based on https://support.smappee.com/hc/en-us/articles/202153935-Where-can-I-find-the-API-documentation-

## Installation
```bash
npm install smappee2mqtt --save
```

## Usage
### Create a new file 'my-smappee.js'
```javascript
var SmappeeAPI = require('smappee2mqtt');

var smappee = new SmappeeAPI({
    debug: false,
	noAPIcall: false,

    clientId: "xxx",
    clientSecret: "xxx",

    username: "xxx",
    password: "xxx",

    mqtt_server: "xxx",
    mqtt_port: "xxx",
    mqtt_baseTopic : "smappee/"
});

module.exports = smappee;
```

### In another nodejs file : test.js
```javascript
var smappee = require('./my-smappee');

smappee.getServiceLocations(function(output) {
    console.log(output);
})
```
### To run your test.js file type : 
> node test.js

The following functions are available: 
`getServiceLocations(callback)`, `getServiceLocationInfo(serviceLocationId, callback)`, ... 


## API
### getServiceLocations(callback)
This method will get all smappee devices configured on the account.
See https://smappee.atlassian.net/wiki/display/DEVAPI/Get+Servicelocations
```javascript
smappee.getServiceLocations(function(output) {
    console.log(output);
})
```

### getServiceLocationInfo(serviceLocationId, callback)
Get the details about 1 service location (list of appliances, list of actuators, ...).
See https://smappee.atlassian.net/wiki/display/DEVAPI/Get+Servicelocation+Info
```javascript
smappee.getServiceLocationInfo("0000", function(output) {
    console.log(output);
})
```

### getConsumptions(serviceLocationId,aggregation, from, to, callback)
Get a list of all consumptions for the specified period and interval.
The aggregation can be selected from one of the values of smappee.AGGREGATION_TYPES.
See https://smappee.atlassian.net/wiki/display/DEVAPI/Get+Consumption

```javascript
var moment = require('moment');

//This will get the consumptions for the last year til now.
var from = moment().subtract(1, 'year').utc().valueOf();
var to = moment().utc().valueOf();

smappee.getConsumptions("0000", smappee.AGGREGATION_TYPES.MONTHLY, from, to, function(output) {
    console.log(output);
})
```

### getLatestConsumption(serviceLocationId, callback)
Get a list of latest consumptions 

```javascript
var smappee = require('./my-smappee');

smappee.getLatestConsumption(serviceLocationId, function(output) {
	console.log("getLatestConsumption (multiply WH by 12 if aggregate by 5 minutes since 5*12 = one hour to get Watts) : ",output);
})
```

### getCurrentChargingSession(serviceLocationId,aggregation, from, to, callback)
Get a list of current charging session (will return -1 if no car is charging)

```javascript
var smappee = require('./my-smappee');
smappee.getCurrentChargingSession(chargingStationSN, function(output){
	console.log(output);
})
```

TIP: To convert the 5 minute interval from Energy [Wh] to Power [W], like the Smappee Dashboard reports these, you have to do these values times 12 as there are 12 x 5 minute intervals in an hour.
