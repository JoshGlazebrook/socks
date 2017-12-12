import {
  SocksClient,
  SocksClientOptions,
  SocksClientChainOptions
} from './client/socksclient';
import * as readline from 'readline';
import * as dgram from 'dgram';

let associateOptions: SocksClientOptions = {
  proxy: {
    ipaddress: '104.236.216.222',
    port: 1081,
    type: 5
  },

  command: 'associate',

  destination: {
    //host: '104.54.207.254',
    //host: '84.19.186.186',
    host: '0.0.0.0',
    port: 0
  }
};

let bindOptions: SocksClientOptions = {
  proxy: {
    ipaddress: '104.236.216.222',
    port: 1081,
    type: 5
  },

  command: 'bind',

  destination: {
    //host: '104.54.207.254',
    //host: '84.19.186.186',
    host: '0.0.0.0',
    port: 0
  }
};

let connectOptions: SocksClientOptions = {
  proxy: {
    ipaddress: '104.236.216.222',
    port: 1081,
    type: 5
  },

  command: 'connect',

  destination: {
    host: 'www.google.com',
    port: 80
  }
};

async function testConnect() {
  //let result = await SocksClient.createConnection(connectOptions);

  let sock = new SocksClient(connectOptions);
  sock.on('established', info => {
    info.socket.on('data', data => {
      console.log(`recv ${data.length}`, data);
      console.log(data.toString());
    });

    info.socket.write("GET / HTTP/1.1\nHost: google.com\n\n");

  });

  sock.on('close', () => {
    console.log('socket closed');
  });

  sock.on('error', (err) => {
    console.log('socket error', err);
  });

  sock.connect();


  //console.log(result.socket);
}

async function testBind() {
  let client = new SocksClient(bindOptions);

  client.on('bound', info => {
    console.log('bound', info.remoteHostInfo);
  });

  client.on('established', info => {
    console.log('established', info.remoteHostInfo);

    info.socket.on('data', (data) => {
      console.log('recv', data);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('line', line => {
      info.socket.write(line);
      console.log('sent', line);
    });
  });

  client.connect();


}

//testConnect();

//let client = new SocksClient(options);
//client.connect();

/*
const udpSocket = dgram.createSocket('udp4');
udpSocket.bind();

udpSocket.on('message', (message, rinfo) => {
  console.log(SocksClient.parseUDPFrame(message));
  //console.log('recv', message);
  //console.log('from', rinfo);
});

async function test() {
  //let result = await SocksClient.createConnection(options);
  let client = new SocksClient(options);

  client.on('bound', info => {
    console.log('bound', info.remoteHostInfo);
  });
  client.on('established', info => {
    console.log('established', info.remoteHostInfo);
    info.socket.resume();
    info.socket.on('data', (data: Buffer) => {
      console.log(data);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('line', line => {
      const packet = SocksClient.createUDPFrame({
        remoteHost: { host: '165.227.108.231', port: 4444 },
        data: Buffer.from(line)
      });
      udpSocket.send(
        packet,
        info.remoteHostInfo.port,
        info.remoteHostInfo.host
      );
      console.log('sent', line);
    });
  });

  client.connect();
}

test();*/


import { DataBuffer } from './common/databuffer';

let buff = new DataBuffer(1024, 8192);

let data = Buffer.alloc(400);


console.log(buff.get(0));