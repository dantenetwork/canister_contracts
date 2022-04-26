'use strict';
const config = require('config');

class chainHandlerMgr {
    constructor() {
        this.chainHandlers = {};
    }

    async init() {
        let networks = config.get('networks');
        for (let i in networks) {
            let network = networks[i];
            let handler = require('./' + network['compatibleChain'] + '/index');
            let inst = new handler(i);
            this.chainHandlers[i] = inst;
            await inst.init();
        }
    }

    getHandlerByName(name_) {
        if (this.chainHandlers[name_] == null) {
            console.log("chainHandlerMgr: chain handler can not be found: ", name_);
            console.trace();
        }
        return this.chainHandlers[name_];
    }
}

let mgr = new chainHandlerMgr();
module.exports = mgr;