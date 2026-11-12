import { EventEmitter } from 'events';

import { addMissingSocketMethods } from '../../../worklet/bare-tls-socket-methods/addMissingSocketMethods';

// The worklet preload that lets @mempool/electrum-client use bare-tls
// sockets (Electrum over TLS). The fakes stand in for bare-tls's Socket and
// the bare-net TCP socket it wraps.

class FakeTcpSocket extends EventEmitter {
  setTimeout = jest.fn(() => this);
  setKeepAlive = jest.fn(() => this);
  setNoDelay = jest.fn(() => this);
}

interface PatchedSocket extends EventEmitter {
  socket: FakeTcpSocket;
  setTimeout(ms: number, ontimeout?: () => void): this;
  setKeepAlive(enable?: boolean, delay?: number): this;
  setNoDelay(enable?: boolean): this;
}

function makeSocketClass() {
  return class FakeTlsSocket extends EventEmitter {
    readonly socket = new FakeTcpSocket();
  };
}

function patchedSocket(SocketClass: ReturnType<typeof makeSocketClass>): PatchedSocket {
  return new SocketClass() as unknown as PatchedSocket;
}

describe('addMissingSocketMethods', () => {
  it('adds the missing methods, forwarding them to the TCP socket and returning the TLS socket', () => {
    const SocketClass = makeSocketClass();
    expect(addMissingSocketMethods(SocketClass)).toEqual(['setTimeout', 'setKeepAlive', 'setNoDelay']);

    const tls = patchedSocket(SocketClass);
    expect(tls.setTimeout(60000)).toBe(tls);
    expect(tls.setKeepAlive(true, 0)).toBe(tls);
    expect(tls.setNoDelay(true)).toBe(tls);

    expect(tls.socket.setTimeout).toHaveBeenCalledWith(60000);
    expect(tls.socket.setKeepAlive).toHaveBeenCalledWith(true, 0);
    expect(tls.socket.setNoDelay).toHaveBeenCalledWith(true);
  });

  it('adds them as non-enumerable prototype methods', () => {
    const SocketClass = makeSocketClass();
    addMissingSocketMethods(SocketClass);
    expect(Object.keys(SocketClass.prototype)).toEqual([]);
  });

  it("re-emits the TCP socket's timeout once, however often setTimeout is called", () => {
    const SocketClass = makeSocketClass();
    addMissingSocketMethods(SocketClass);
    const tls = patchedSocket(SocketClass);
    const onTimeout = jest.fn();
    tls.on('timeout', onTimeout);

    tls.setTimeout(60000).setTimeout(0).setTimeout(5000);
    expect(tls.socket.listenerCount('timeout')).toBe(1);

    tls.socket.emit('timeout');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('keeps timeout forwarding separate per socket', () => {
    const SocketClass = makeSocketClass();
    addMissingSocketMethods(SocketClass);
    const first = patchedSocket(SocketClass);
    const second = patchedSocket(SocketClass);
    const onSecondTimeout = jest.fn();
    second.on('timeout', onSecondTimeout);

    first.setTimeout(1000);
    second.setTimeout(1000);
    first.socket.emit('timeout');

    expect(onSecondTimeout).not.toHaveBeenCalled();
  });

  it('runs a setTimeout callback once on timeout, and ignores it for a zero timeout', () => {
    const SocketClass = makeSocketClass();
    addMissingSocketMethods(SocketClass);
    const tls = patchedSocket(SocketClass);
    const ontimeout = jest.fn();
    const ignored = jest.fn();

    tls.setTimeout(1000, ontimeout);
    tls.setTimeout(0, ignored);
    tls.socket.emit('timeout');
    tls.socket.emit('timeout');

    expect(ontimeout).toHaveBeenCalledTimes(1);
    expect(ignored).not.toHaveBeenCalled();
  });

  it('leaves methods the class already has untouched', () => {
    class SocketWithMethods extends EventEmitter {
      readonly socket = new FakeTcpSocket();
      setTimeout() {
        return 'own setTimeout';
      }
      setNoDelay() {
        return 'own setNoDelay';
      }
    }
    const { setTimeout: ownSetTimeout, setNoDelay: ownSetNoDelay } = SocketWithMethods.prototype;

    expect(addMissingSocketMethods(SocketWithMethods)).toEqual(['setKeepAlive']);
    expect(SocketWithMethods.prototype.setTimeout).toBe(ownSetTimeout);
    expect(SocketWithMethods.prototype.setNoDelay).toBe(ownSetNoDelay);
  });

  it('does nothing once every method is present', () => {
    const SocketClass = makeSocketClass();
    addMissingSocketMethods(SocketClass);
    expect(addMissingSocketMethods(SocketClass)).toEqual([]);
  });
});
