/*
 * @Description: 
 * @Author: kay
 * @Date: 2022-04-19 15:59:32
 * @LastEditTime: 2022-04-25 17:00:45
 * @LastEditors: kay
 */
const chainHandlerMgr = require('../../basic/chainHandlerMgr');
const config = require('config');

class DefinityRelayer {
  constructor(chainName) {
    this.chainName = chainName;
    this.relayers = {};
    this.receiveChains = []
  }

  async init() {
    let networks = config.get('networks');
    let network = networks[this.chainName];
    this.receiveChains = network.receiveChains;
    for (let i = 0; i < this.receiveChains.length; i++) {
      this.relayers[this.receiveChains[i]] = require('./' + networks[this.receiveChains[i]].compatibleChain + 'ToDfinity');
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
      let from = executableMessage[i][0].MessageId.chain_name;
      let id = executableMessage[i][0].MessageId.id;
      await handler.executeMessage(from, id);
    }
  }
}

module.exports = DefinityRelayer;