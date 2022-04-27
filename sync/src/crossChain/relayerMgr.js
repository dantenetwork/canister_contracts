'use strict';
const config = require('config');
const utils = require('../utils/utils');

class relayerMgr {
    constructor() {
        this.relayers = {};
    }

    async init() {
        let networks = config.get('networks');
        for (let i in networks) {
            let network = networks[i];
            let relayer = require('./' + network['compatibleChain'] + '/index');
            let inst = new relayer(i);
            this.relayers[i] = inst;
            await inst.init();
            await utils.sleep(1);
        }
    }
}

let mgr = new relayerMgr();
module.exports = mgr;