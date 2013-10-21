var socks = require('./lib/socks-factory.js');





var options = {
    proxy: {
        ipaddress: /*"202.105.213.92",*/ "202.118.236.141",
        port: 1080,
        type: 5,
        command: "associate",
        //userid: "Josh"
    },
    target: {
        //host: "137.117.36.183",
        host: "209.160.78.60",
        //host: "winmxunlimited.net",
        port: 80
    }
};

socks.createConnection(options, function(err, socket, extra) {
    if (err)
        console.log(err);
    if (!err) {
        console.log("Connected");
        console.log(extra);

        socket.on('data', function(data) {
            console.log(data);
        });

        socket.resume();
    }
});