'use strict';

var redis = require('redis');
var utils = require('../utils');
var EventEmitter = require('events').EventEmitter;

function RedisCache(config) {

    var redisConfig;
    var oneMinute = 60 * 1000;
    var tenSeconds = 10 * 1000;
    var cleanupPeriod = 60 * 60 * 24; // 1 day
    var self = this;

    if(config.url) {
        redisConfig = utils.parseRedisConnectionString(config.url);
    } else {
        redisConfig = config;
    }
    redisConfig.options = redisConfig.options || {};

    // Default redis client behaviour is to back off exponentially forever. Not very useful.
    redisConfig.options.retry_max_delay = redisConfig.options.retry_max_delay || tenSeconds;

    self._redisClient = redis.createClient(redisConfig.port || null, redisConfig.host || null, redisConfig.options);

    // Prevent error events bubbling up to v8 and taking the worker down if redis is unavailable
    // By listening for the error event, the redis client will automatically attempt to
    // re-establish the connection
    self._redisClient.on('error', function(err) {
        console.log('Error connecting to %s:%s - %s', redisConfig.host, redisConfig.port, err.message);
    });

    self._redisClient.on('ready', function() {
        self.emit('ready');
    });

    self._redisClient.select(redisConfig.db || 0);

    this.engine = 'redis';

    this.get = function(key, next) {

        if (!self._redisClient.connected) { return next(); }

        self._redisClient.hgetall(key, function(err, data) {

            if(!data) { return next(err, null); }

            // Check if there is a hit but look at expiry time
            // Allows us to serve stale cached values vs TTL only
            var expires = Date.now();
            var returnData = null;

            try {
                returnData = {
                    content: data.content,
                    headers: JSON.parse(data.headers),
                    options: JSON.parse(data.options)
                }
            } catch (err) {
                console.log('Error parsing cached data: %s', key);
                return next(); // Returning nothing will hopefully trigger the cache to be repopulated with valid data
            }

            if(expires - data.expires > 0) {
                next(err, null, returnData);
            } else {
                next(err, returnData);
            }
        });
    };

    this.set = function(key, value, _ttl, next) {

        if (!self._redisClient.connected) { return next(); }

        if (arguments.length === 3) { return this.set(key, value, _ttl, function() {}); }

        var ttl = _ttl || oneMinute;
        var expires = Date.now() + ttl*1;
        var multi = self._redisClient.multi();

        multi.hset(key, 'content', value.content);
        multi.hset(key, 'headers', JSON.stringify(value.headers || {}));
        multi.hset(key, 'options', JSON.stringify(value.options || {}));
        multi.hset(key, 'expires', expires);
        multi.hset(key, 'ttl', ttl);

        multi.expire(key, (ttl / 1000) * cleanupPeriod); // Delete them eventually

        multi.exec(next);

    };
}

module.exports = RedisCache;

require('util').inherits(RedisCache, EventEmitter);
