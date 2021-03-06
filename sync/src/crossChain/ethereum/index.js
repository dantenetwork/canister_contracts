const chainHandlerMgr = require('../../basic/chainHandlerMgr');
const config = require('config');

class EthereumRelayer {
  constructor(chainName) {
    this.chainName = chainName;
    this.relayers = {};
    this.receiveChains = [];
  }

  async init() {
    let networks = config.get('networks');
    let network = networks[this.chainName];
    this.receiveChains = network.receiveChains;
    for (let i = 0; i < this.receiveChains.length; i++) {
      this.relayers[this.receiveChains[i]] = require('./' + networks[this.receiveChains[i]].compatibleChain + 'ToEthereum');
    }
  }

  async sendMessage() {
    for (let i in this.relayers) {
      await this.relayers[i].sendMessage(i, this.chainName);
    }
  }

  async executeMessage() {
    // query Ethereum executetable message
    let handler = chainHandlerMgr.getHandlerByName(this.chainName);
    let executableMessage = await handler.queryExecutableMessage(this.receiveChains);
    if (executableMessage.length == 0) {
      return;
    }

    for (let i in executableMessage) {
      let from = executableMessage[i].fromChain;
      let id = executableMessage[i].id;
      await handler.executeMessage(from, id);
    }
  }
}

module.exports = EthereumRelayer;