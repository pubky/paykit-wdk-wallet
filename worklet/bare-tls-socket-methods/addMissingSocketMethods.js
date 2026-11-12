'use strict'

// Adds the Node socket methods that bare-tls's TLS socket lacks, so code
// written for Node's tls.TLSSocket can drive it inside the WDK worklet.
//
// Why: WDK's Bitcoin client connects to TLS Electrum servers with
// @mempool/electrum-client, which calls setTimeout, setEncoding,
// setKeepAlive and setNoDelay on the socket that `tls.connect` returns. In
// the Bare worklet `node:tls` is bare-tls, whose Socket (a streamx Duplex)
// has setEncoding but not the other three, so every TLS Electrum connection
// failed with "this._socket.setTimeout is not a function". The TCP socket
// underneath (`socket.socket`, from bare-net) has all three, so the added
// methods forward to it, as bare-http's HTTPSSocket does. setTimeout also
// re-emits the TCP socket's 'timeout' event on the TLS socket, where Node
// code listens for it.
//
// setEncoding is never added: streamx provides it on the TLS socket, where
// it decodes the decrypted data. Forwarding it to the TCP socket would
// decode the encrypted bytes instead.
//
// Each method is added only when absent, so this becomes a no-op once
// bare-tls forwards them itself. Then remove this package and its
// `preloadModules` entry in wdk.config.js.

const FORWARDED_METHODS = ['setKeepAlive', 'setNoDelay']

// TLS sockets whose TCP socket already re-emits 'timeout' on them, so
// repeated setTimeout calls do not stack listeners.
const forwardingTimeout = new WeakSet()

function forwardTimeoutEvent(tlsSocket) {
  if (forwardingTimeout.has(tlsSocket)) return
  forwardingTimeout.add(tlsSocket)
  tlsSocket.socket.on('timeout', () => tlsSocket.emit('timeout'))
}

function defineMethod(prototype, name, method) {
  // Non-enumerable, like a method declared in a class body.
  Object.defineProperty(prototype, name, {
    value: method,
    writable: true,
    configurable: true,
    enumerable: false,
  })
}

/**
 * Adds setTimeout, setKeepAlive and setNoDelay to `SocketClass.prototype`
 * where they are missing. Instances must expose the TCP socket they wrap as
 * `socket`. Returns the names of the methods it added.
 */
function addMissingSocketMethods(SocketClass) {
  const prototype = SocketClass.prototype
  const added = []

  if (typeof prototype.setTimeout !== 'function') {
    defineMethod(prototype, 'setTimeout', function (ms, ontimeout) {
      forwardTimeoutEvent(this)
      this.socket.setTimeout(ms)
      // Same rule as bare-tcp: a callback only counts for a non-zero timeout.
      if (ontimeout && ms !== 0) this.once('timeout', ontimeout)
      return this
    })
    added.push('setTimeout')
  }

  for (const name of FORWARDED_METHODS) {
    if (typeof prototype[name] === 'function') continue
    defineMethod(prototype, name, function (...args) {
      this.socket[name](...args)
      return this
    })
    added.push(name)
  }

  return added
}

module.exports = { addMissingSocketMethods }
