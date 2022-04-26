const chainHandlerMgr = require('../../basic/chainHandlerMgr');
const config = require('config');

class NearRelayer {
  constructor(chainName) {
    this.chainName = chainName;
    this.relayers = {};
    this.receiveChains = [];
  }

  async init() {
    let networks = config.get('networks');
    let network = networks[this.chainName];
    this.receiveChains = network.receiveChains;
    // let network = config.get('networks.' + this.chainName);
    // this.receiveChains = network.receiveChains;
    for (let i = 0; i < this.receiveChains.length; i++) {
      this.relayers[this.receiveChains[i]] = require('./' + networks[this.receiveChains[i]].compatibleChain + 'ToNear');
    }
    console.log("init relayers:", this.relayers);
  }

  async sendMessage() {
    for (let i in this.relayers) {
      await this.relayers[i].sendMessage(i, this.chainName);
    }
  }

  async executeMessage() {
    // query Near executetable message
    let handler = chainHandlerMgr.getHandlerByName(this.chainName);
    let executableMessage = await handler.queryExecutableMessage();
    if (executableMessage.length == 0) {
      return;
    }

    for (let i in executableMessage) {
      let from = executableMessage[i][0].chain;
      let id = executableMessage[i][0].id;
      await handler.executeMessage(from, id);
    }
  }
}

module.exports = NearRelayer;