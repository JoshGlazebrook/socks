var socks = require('./lib/socks-factory.js');

var options = {

    // Information about proxy server
    proxy: {
        // IP Address of Proxy (Required)
        ipaddress: "1.2.3.4",

        // TCP Port of Proxy (Required)
        port: 1080,

        // Proxy Type [4, 5] (Required)
        // Note: 4 works for both 4 and 4a.
        type: 4,

        // Socks Connection Type (Optional)
        // - defaults to 'connect'

        // 'connect'    - establishes a regular Socks connection to the target host. (Client -> Proxy -> Server)
        // 'bind'       - establishes an open tcp port on the Socks for another client to connect to (Client -> Proxy <- Client)
        // 'associate'  - establishes a udp association relay on the Socks server. (Client ->(udp) Proxy ->(udp) Another Host)
        command: "connect",


        // Socks 4 Specific:

        // UserId used when making a Socks 4/4a request. (Optional)
        userid: "someuserid",

        // Socks 5 Specific:

        // Authentication used for Socks 5 (when it's required) (Optional)
        authentication: {
            username: "Josh",
            password: "somepassword"
        }
    },

    // Information about target host and/or expected client of a bind association. (Required)
    target: {
        // When using 'connect':    IP Address or hostname of a target to connect to.
        // When using 'bind':       IP Address of the expected client that will connect to the newly open tcp port.
        // When using 'associate':  IP Address and Port of the expected client that will send UDP packets to this UDP association.
        host: "1.2.3.4",

        // TCP port of target to connect to.
        port: 1080
    },

    // Amount of time to wait for a connection to be established. (Optional)
    // - defaults to 10000ms (10 seconds)
    timeout: 10000
};

socks.createConnection(options, function(err, socket, info) {
    if (err)
        console.log(err);
    else {
        // BIND request has completed. info contains the remote ip and tcp port to connect to.
        console.log(info);

        // { port: 1494, host: '202.101.228.108' }

        socket.on('data', function(data) {
            console.log(data.length);
            console.log(data);
        });

        // Remember to resume the stream.
        socket.resume();

    }
});

/*
 Joshs-MacBook-Pro:~ Josh$ telnet 202.101.228.108 1494
 Trying 202.101.228.108...
 Connected to 202.101.228.108.
 Escape character is '^]'.
 hello
 aaaaaaaaa


 { port: 1494, host: '202.101.228.108' }
 8
 <Buffer 00 5a ca 61 43 a8 09 01>
 7
 <Buffer 68 65 6c 6c 6f 0d 0a>
 11
 <Buffer 61 61 61 61 61 61 61 61 61 0d 0a>

 */