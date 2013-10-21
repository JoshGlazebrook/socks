var SocksFactory = require('../lib/socks-factory.js');

var options = {
    proxy: {
        ipaddress: "202.118.236.141",
        port: 1080,
        type: 5  // (4 or 5)
    },

    target: {
        host: "173.194.33.103", // (google.com)
        port: 80
    }
};

SocksFactory.createConnection(options, function(err, socket, info) {
    if (err)
        console.log(err);
    else {
        console.log("Connected");

        // We can do whatever we want with the socket now.
    }
});