'use strict';

const chainHandlerMgr = require('../../basic/chainHandlerMgr');

const config = require('config');

class PlatONRelayer {
  constructor(chainName) {
    this.chainName = chainName;
  }

  async init() {
    let handler = chainHandlerMgr.getHandlerByName(this.chainName);
    // get validator private key
    const validatorPrivateKey = config.get('networks.' + this.chainName + '.validatorPrivateKey');
    this.validatorAccount =
      handler.getProvider().platon.accounts.privateKeyToAccount(validatorPrivateKey)
        .address;
    console.log('validator PlatON account: ' + this.validatorAccount);
    // get platON validator list
    const validators = await handler.getValidatorList();
    let isDesignatedValidator = false;
    for (let i = 0; i < validators.length; i++) {
      if (this.validatorAccount == validators[i][0]) {
        isDesignatedValidator = true;
      }
    }
  }

  async sendMessage() {
    await this.nearToPlatONMessages();
  }

  // sync messages from near to PlatON
  async nearToPlatONMessages() {
    const fromChain = 'NEAR';
    const toChain = 'PlatON';

    let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
    let toHandler = chainHandlerMgr.getHandlerByName(toChain);
    console.log(1)

    let nextId = await toHandler.getValidatorNextTaskId(fromChain, this.validatorAccount);

    const nearSentMessageCount = await fromHandler.querySentMessageCount(toChain);
    console.log(2)

    if (nearSentMessageCount >= nextId) {
      // get message by id
      const message = await fromHandler.getSentMessageById(toChain, nextId);
      message.id = nextId;
      let ret = await toHandler.pushMessage(message);
      if (ret == 0) {
        setTimeout(function() {
          this.nearToPlatONMessages();
        }, 1000);
      }
    } else {
      await this.avaxToPlatONMessages();
    }
  }

  // sync messages from AVAX to PlatON
  async avaxToPlatONMessages() {
    const fromChain = 'AVALANCHE';
    const toChain = 'PlatON';

    let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
    let toHandler = chainHandlerMgr.getHandlerByName(toChain);

    let nextId = await toHandler.getValidatorNextTaskId(fromChain, this.validatorAccount);
    const avalancheSentMessageCount =
      await fromHandler.querySentMessageCount(toChain);

    if (avalancheSentMessageCount >= nextId) {
      // get message by id
      const message = await fromHandler.getSentMessageById(toChain, nextId);

      let target =
        await fromHandler.queryTargetInfo(message.sender, message.content.action);
      let abi = target.abiString.split(',');
      let argus = message.content.data.arguments;
      let parameterNamesString = target.parameterNamesString;
      let parameterNames = parameterNamesString.split(',');
      let result = fromHandler.getProvider().eth.abi.decodeParameters(abi, argus);

      // format locker contract params
      let jsonObj = {};
      for (let i = 0; i < parameterNames.length; i++) {
        let value = result[i];
        jsonObj[parameterNames[i]] = value;
      }

      // format params
      const originParams = {
        id: message.id,
        from_chain: message.fromChain,
        to_chain: message.toChain,
        sender: message.sender,
        content: {
          contract: message.content[0],
          action: message.content[1],
          data: JSON.stringify(jsonObj)
        }
      };
  let ret = await toHandler.pushMessage(originParams);
      if (ret == 0) {
        setTimeout(function() {
          avaxToPlatONMessages();
        }, 1000);
      }
    }
  }

  // query executable message list
  async executeMessage() {
    let handler = chainHandlerMgr.getHandlerByName(this.chainName);
    const executableMessage = await handler.getExecutableMessages();
    if (executableMessage.length == 0) {
      return;
    }

    for (let i in executableMessage) {
      let from = executableMessage[i][0];
      let id = executableMessage[i][1];
      await handler.executeMessage(from, id);
    }
  }
}

module.exports = PlatONRelayer;