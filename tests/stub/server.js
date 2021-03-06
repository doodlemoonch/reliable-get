'use strict';

var connect = require('connect');
var connectRoute = require('connect-route');
var cookieParser = require('cookie-parser');
var fs = require('fs');

// This should probably be made its own project!
function initStubServer(port, next) {

    var app = connect();

    app.use(cookieParser());

    app.use(connectRoute(function (router) {

        var faultyFn = function(req, res) {
             var faulty = req.originalUrl.indexOf('faulty=true') >= 0 ? true : false;
             setTimeout(function() {
                if(!faulty) {
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end('Faulty service managed to serve good content!');
                } else {
                    res.writeHead(500, {'Content-Type': 'text/html'});
                    res.end('Faulty service broken');
                }
            }, 100);
        }

        router.get('/', function(req, res) {
            res.end('OK');
        });

        router.get('/broken', function(req, res) {
            req.socket.end();
        });

        router.get('/nocache', function(req, res) {
            res.writeHead(200, {'cache-control': 'private, max-age=0, no-cache'});
            res.end('' + Date.now());
        });

        router.get('/maxage', function(req, res) {
            res.writeHead(200, {'cache-control': 'private, max-age=5000'});
            res.end('' + Date.now());
        });

        router.get('/faulty', faultyFn);
        router.get('/cb-faulty', faultyFn);
        router.get('/cb-faulty-default', faultyFn);

    }));

    app.listen(port).on('listening', next);

}

module.exports = {
    init: initStubServer
};
