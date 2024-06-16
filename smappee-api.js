var http = require('http');
var request = require('request');
var querystring = require('querystring');
var moment = require('moment');
const fs = require('node:fs');
const mqtt = require('mqtt');

function SmappeeAPI(settings) {

    var clientId = settings.clientId;
    var clientSecret = settings.clientSecret;
    var username = settings.username;
    var password = settings.password;
    var mqtt_server = settings.mqtt_server;
    var mqtt_port = settings.mqtt_port;
    var mqtt_baseTopic = settings.mqtt_baseTopic;

    this.debug = settings.debug || false;

    var thisObject = this;

    var accessToken = undefined;

    this.AGGREGATION_TYPES = {
        MINUTES: 1,
        HOURLY: 2,
        DAILY: 3,
        MONTHLY: 4,
        QUARTERLY: 5
    };

    // PUBLIC METHODS ++++++++++++++++++++++++++++++++++++++++

    /**
     * Get a list of all houses/installations on this account.
     *
     * See https://smappee.atlassian.net/wiki/display/DEVAPI/Get+Servicelocations
     *
     * @param handler           function that will be called when request is completed.
     */
    this.getServiceLocations = function(handler) {
        _get('https://app1pub.smappee.net/dev/v3/servicelocation', {}, handler);
    };

    /**
     * Get the details about 1 service location (list of appliances, list of actuators, ...).
     *
     * See https://smappee.atlassian.net/wiki/display/DEVAPI/Get+Servicelocation+Info
     *
     * @param serviceLocationId     one of the ids from the getServiceLocations() request.
     * @param handler               function that will be called when request is completed.
     */
    this.getServiceLocationInfo = function(serviceLocationId, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/servicelocation/' + serviceLocationId + '/info';
        _get(url, {}, handler);
    };

    /**
     * Get a list of all consumptions for the specified period and interval.
     *
     * see https://smappee.atlassian.net/wiki/display/DEVAPI/Get+Consumption
     *
     * @param serviceLocationId     serviceLocationId one of the ids from the getServiceLocations() request.
     * @param aggregation           one of the AGGREGATION TYPES to specify the periodically of the consumptions to return.
     * @param from                  date in UTC milliseconds to start from
     * @param to                    date in UTC milliseconds to end with
     * @param handler               function that will be called when request is completed.
     */
    this.getConsumptions = function(serviceLocationId, aggregation, from, to, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/servicelocation/' + serviceLocationId + '/consumption';
        var fields = {
            aggregation: aggregation,
            from: from,
            to: to
        };
        //_get(url, fields, handler);
        _get(url, fields, function(output) {
            if (thisObject.debug) {
                console.log("getConsumptions output : "+ JSON.stringify(output));
            }

            if (output!=null) {
                if (thisObject.debug) {
                    console.log("publishing getConsumptions output to mqtt");
                }
                _publishMQTT(mqtt_baseTopic+"consumptions",JSON.stringify(output));
                handler(output);
            } else {
                if (thisObject.debug) {
                    console.log("getConsumptions output null");
                }
                _publishMQTT(mqtt_baseTopic+"consumptions","no consumptions");
                handler(undefined);
            }
        });
    };

    this.getLatestConsumption = function(serviceLocationId, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/servicelocation/' + serviceLocationId + '/consumption';
        var fields = {
            aggregation: this.AGGREGATION_TYPES.MINUTES,
            from: moment().subtract(20, 'minutes').utc().valueOf(),
            to: moment().add(5, 'minutes').utc().valueOf()
        };
        _get(url, fields, function(output) {
            if (thisObject.debug) {
                console.log("getConsumptions output : "+ JSON.stringify(output));
            }

            if (output.consumptions.length > 0) {
                if (thisObject.debug) {
                    console.log("publishing getConsumptions output to mqtt");
                }
                _publishMQTT(mqtt_baseTopic+"consumptions",JSON.stringify(output.consumptions[output.consumptions.length - 1]));
                handler(output.consumptions[output.consumptions.length - 1]);
            } else {
                if (thisObject.debug) {
                    console.log("getConsumptions output null");
                }
                _publishMQTT(mqtt_baseTopic+"consumptions","no consumptions");
                handler(undefined);
            }
        });
    };

    this.getMonthlyConsumptionsForLastYear = function(serviceLocationId, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/servicelocation/' + serviceLocationId + '/consumption';
        var fields = {
            aggregation: this.AGGREGATION_TYPES.MONTHLY,
            from: moment().subtract(1, 'year').utc().valueOf(),
            to: moment().utc().valueOf()
        };
        _get(url, fields, handler);
    };

    this.getEvents = function(serviceLocationId, applianceId, from, to, maxNumber, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/servicelocation/' + serviceLocationId + '/events';
        var fields = {
            applienceId: applianceId,
            from: from,
            to: to,
            maxNumber: maxNumber || 10
        };
        _get(url, fields, handler);
    };

    this.turnActuatorOn = function(serviceLocationId, actuatorId, duration, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/servicelocation/' + serviceLocationId + '/actuator/' + actuatorId + '/on';

        _post(url, "{'duration': " + duration + "}", handler);
    };

    this.turnActuatorOff = function(serviceLocationId, actuatorId, duration, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/servicelocation/' + serviceLocationId + '/actuator/' + actuatorId + '/off';
        _post(url, "{'duration': " + duration + "}", handler);
    };

    this.getCurrentChargingSession = function(chargingStationSN, handler) {
        var url = 'https://app1pub.smappee.net/dev/v3/chargingstations/' + chargingStationSN + '/sessions';

        if (thisObject.debug) {
            console.log("getCurrentChargingSession url : "+ url);
        }

        var fields = {
            active: true,
            range:"1635721200000"
        };
        _get(url, fields, function(output) {
            if (output.length > 0) {
                _publishMQTT(mqtt_baseTopic+"currentChargingSession",output);
                handler(output);
            } else {
                _publishMQTT(mqtt_baseTopic+"currentChargingSession","no session");
                handler(undefined);
            }
        });
    };


    // HELPER METHODS ++++++++++++++++++++++++++++++++++++++++
  
    var _getAccessToken = function(handler) {
        var tokenFile = null;
        var existingToken = null;
        let timestampNow = Date.now();
        var timestampNowSeconds = timestampNow/1000;

        //Try to read Access token from file
        if (fs.existsSync('./token.json') && fs.existsSync('./tokenBirth.txt')) {
            tokenFile=fs.readFileSync('./token.json');
            existingToken = JSON.parse(tokenFile);
            if (thisObject.debug) {
                console.log("Existing Token found : "+tokenFile);
            }
            var tokenBirth=fs.readFileSync('./tokenBirth.txt');
            var tokenDeath = Number(tokenBirth)+existingToken.expires_in-60; //token death with 60sec threshold
            if (tokenDeath<timestampNowSeconds){
                //Token expired or less than 60 secs remaining; try to Refresh Token
                if (thisObject.debug) {
                    console.log("Token expired : "+tokenDeath);
                    console.log("Time is now : "+timestampNowSeconds);
                    console.log("Making oAuth call with refresh token : "+existingToken.refresh_token);
                }

                var body = {
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: existingToken.refresh_token,
                    grant_type: 'refresh_token'
                };
    
                var options =  {
                    url: 'https://app1pub.smappee.net/dev/v3/oauth2/token',
                    headers: {
                        'Host': 'app1pub.smappee.net'
                    },
                    form: body
                };
    
                request.post(options, function (err, httpResponse, body) {
                    if (err) {
                        return console.error('Request failed:', err);
                    }
                    if (thisObject.debug) {
                        console.log('Server responded with:', body);
                    }
    
                    accessToken = JSON.parse(body);
                
                    fs.writeFileSync('./token.json', body, err => {
                        if (err) {
                            console.error('Could not save token to file', err);
                        } 
                    });
    
                    fs.writeFileSync('./tokenBirth.txt', timestampNowSeconds.toString(), err => {
                        if (err) {
                            console.error('Could not save token birth to file', err);
                        } 
                    });
                });
            } else {
                //Using existing Token from file
                accessToken=existingToken;
            }
        } 

        if (accessToken==null){
            //Still got no Token, requesting a new one
            var body = {
                client_id: clientId,
                client_secret: clientSecret,
                username: username,
                password: password,
                grant_type: 'password'
            };

            if (thisObject.debug) {
                console.log("Making oAuth call...");
            }

            var options =  {
                url: 'https://app1pub.smappee.net/dev/v3/oauth2/token',
                headers: {
                    'Host': 'app1pub.smappee.net'
                },
                form: body
            };

            request.post(options, function (err, httpResponse, body) {
                if (err) {
                    return console.error('Request failed:', err);
                }
                if (thisObject.debug) {
                    console.log('Server responded with:', body);
                }

                accessToken = JSON.parse(body);
            
                fs.writeFileSync('./token.json', body, err => {
                    if (err) {
                        console.error('Could not save token to file', err);
                    } 
                });

                fs.writeFileSync('./tokenBirth.txt', timestampNowSeconds.toString(), err => {
                    if (err) {
                        console.error('Could not save token birth to file', err);
                    } 
                });
            });
        }

        if (accessToken!=null){
            handler(accessToken);
        } else {
            return console.error('Could not get valid token'); 
        }
    };

    var _post = function(url, fields, handler) {
        _getAccessToken(function(accessToken) {
            if (thisObject.debug) {
                console.log("Request to " + url);
                console.log("With parameters: " + fields);
            }

            var options =  {
                url: url,
                headers: {
                    'Authorization': 'Bearer ' + accessToken.access_token
                },
                body: fields
            };

            request.post(options, function (err, httpResponse, body) {
                if (err) {
                    return console.error('Request failed:', err);
                }
                if (thisObject.debug) {
                    //console.log('Server responded with:', body);
                }

                handler({status: 'OK'});
            }); //end of POST request
        }); //end of access token request
    };

    var _get = function(url, fields, handler) {
        _getAccessToken(function(accessToken) {
            var query = querystring.stringify(fields);
            if (thisObject.debug) {
                console.log("Request to " + url);
                console.log("With parameters: " + query);
            }

            var options =  {
                url: url + "?" + query,
                headers: {
                    'Authorization': 'Bearer ' + accessToken.access_token
                }
            };

            request.get(options, function (err, httpResponse, body) {
                if (err) {
                    return console.error('Request failed:', err);
                }
                if (thisObject.debug) {
                    console.log('Server responded with:', body);
                }
                var output = JSON.parse(body);
                handler(output);
            });   //end of GET request
        }); //end of access token request
    };

    var _publishMQTT = function(topic, value){

        const options = {
            protocol: 'mqtt',
            host: mqtt_server,
            port: mqtt_port
          };
          
        if (thisObject.debug) {
            console.log('Connecting to mqtt');
        }  
        const client = mqtt.connect(options);



        client.on('offline', () => {
            console.log('Client is offline');
        });
        
        client.on('reconnect', () => {
            console.log('Reconnecting to MQTT broker');
        });
        
        client.on('end', () => { 
            console.log('Connection to MQTT broker ended');
        });

        client.on('connect', () => { 
            console.log('Connected to MQTT broker');
            client.publish(topic, value, { retain: true }, (err) => {
                if (thisObject.debug) {
                    console.log('Publishing to mqtt');
                }
                if (err) {
                  console.error('Failed to publish message:', err);
                } else {
                    if (thisObject.debug) {
                        console.log('Message published with retain flag set to true');
                    }
                }
            });
            client.end();
        });
        
    }

}

module.exports = SmappeeAPI;