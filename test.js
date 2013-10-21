var SocksFactory = require('./lib/socks-factory.js');
var dgram = require('dgram');

var options = {
    proxy: {
        ipaddress: "127.0.0.1",
        port: 1080,
        type: 5,
        command: "associate" // Since we are using associate, we must specify it here.
    },
    target: {
        host: "0.0.0.0", // When using associate, either set the ip and port to 0.0.0.0:0 or the expected source of incoming udp packets.
        port: 0
    }
};


SocksFactory.createConnection(options, function(err, socket, info) {
    if (err)
        console.log(err);
    else {
        // Associate request has completed.
        // info object contains the remote ip and udp port to send UDP frames to.
        console.log(info);

        // { port: 1494, host: '202.101.228.108' }
        var udp = new dgram.Socket('udp4');

        var pack = SocksFactory.createUDPFrame({ host: "127.0.0.1", port: 6699}, new Buffer("Hello"));

        udp.send(pack, 0, pack.length, info.port, info.host);

    }
});
