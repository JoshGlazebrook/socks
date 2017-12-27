import { SocksClient, SocksClientOptions } from './client/socksclient';

export * from './client/socksclient';

import './client/socksclient';

import * as readline from 'readline';
import * as dgram from 'dgram';
import {
  SocksClientChainOptions,
  SocksClientEstablishedEvent
} from './common/constants';
import { SocksClientError } from './common/util';

const bindOptions: SocksClientOptions = {
  proxy: {
    ipaddress: '159.203.75.235',
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

const associateOptions = { ...bindOptions };
associateOptions.command = 'associate';

const connectOptions = { ...bindOptions };
connectOptions.command = 'connect';
connectOptions.destination = {
  host: 'yelp.com',
  port: 80
};
connectOptions.proxy.type = 5;
connectOptions.proxy.userId = 'blah';

const connectChainOptions: SocksClientChainOptions = {
  destination: {
    host: 'ip-api.com',
    port: 80
  },
  command: 'connect',
  proxies: [
    {
      ipaddress: '159.203.75.235',
      port: 1081,
      type: 5
    },
    {
      ipaddress: '104.131.124.203',
      port: 1081,
      type: 5
    }
  ]
};

const udpSocket = dgram.createSocket('udp4');
udpSocket.bind();

udpSocket.on('message', (message, rinfo) => {
  console.log(SocksClient.parseUDPFrame(message));
});

async function testConnectChain() {
  SocksClient.createConnectionChain(
    connectChainOptions,
    (err: Error, result: SocksClientEstablishedEvent) => {
      if (err) {
        console.log(err);
      } else {
        console.log('established. remote addr:', result.socket.remoteAddress);
        result.socket.write('GET /json HTTP/1.1\nHost: ip-api.com\n\n');
        result.socket.on('data', (data) => {
          console.log(data.toString());
        });
      }
    }
  );
}

// tests connect proxy between two tcp clients
function testConnect() {
  let client = new SocksClient(connectOptions);

  client.on('established', info => {
    console.log('established', info.remoteHost);

    info.socket.write('GET / HTTP/1.1\nHost: yelp.com\n\n');
    info.socket.on('data', data => {
      console.log(data.toString());
    });
  });

  client.on('error', err => {
    console.log('error');
    //console.error(err);
  });

  client.connect();
}

// tests bind proxy between two tcp clients
function testBind() {
  let client = new SocksClient(bindOptions);

  client.on('bound', info => {
    console.log('bound', info.remoteHost);
  });

  client.on('established', info => {
    console.log('established', info.remoteHost);

    info.socket.on('data', data => {
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

  client.on('error', err => {
    console.log('had error');
    console.error(err);
  });

  client.connect();
}

// Test udp associate proxy between udp clients.
function testAssociate() {
  let client = new SocksClient(associateOptions);

  client.on('established', info => {
    console.log('established', info.remoteHost);

    info.socket.on('data', data => {
      console.log('recv', data);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('line', line => {
      //info.socket.write(line);
      const packet = SocksClient.createUDPFrame({
        remoteHost: { host: '165.227.108.231', port: 4444 },
        data: Buffer.from(line)
      });
      udpSocket.send(
        packet,
        info.remoteHost.port,
        info.remoteHost.host
      );

      console.log('sent', line);
    });
  });

  client.on('error', err => {
    console.log('had error');
    console.error(err);
  });

  client.connect();
}

testAssociate();
//testBind();
//testConnect();
//testConnectChain();
