'use strict'

// Worklet preload (wdk.config.js `preloadModules`): runs before WDK loads
// and patches bare-tls's Socket so @mempool/electrum-client can use it.
// See addMissingSocketMethods.js for why.
//
// No dependency on bare-tls is declared on purpose: this must patch the one
// bare-tls copy that `node:tls` resolves to (pinned in package.json
// `overrides`), not a private copy npm would install for this package.

const tls = require('bare-tls')
const { addMissingSocketMethods } = require('./addMissingSocketMethods.js')

addMissingSocketMethods(tls.Socket)
