"use strict";

const path = require("path");
const homedir = require("os").homedir();
const nearAPI = require("near-api-js");
const config = require('config');

// init near protocol contract
const credentialsPath = path.join(homedir, ".near-credentials");

class NearHandler {
  constructor(chainName) {
    this.chainName = chainName;
  }

  async init() {
    this.nearConfig = {
      networkId: config.get('networks.' + this.chainName + '.networkId'),
      keyStore: new nearAPI.keyStores.UnencryptedFileSystemKeyStore(
        credentialsPath
      ),
      nodeUrl: config.get('networks.' + this.chainName + '.nodeUrl'),
      contractName: config.get('networks.' + this.chainName + '.crossChainContractAddress'),
      accountId: config.get('networks.' + this.chainName + '.validatorAccountId'),
      walletUrl: config.get('networks.' + this.chainName + '.walletUrl'),
      helperUrl: config.get('networks.' + this.chainName + '.helperUrl'),
    };
    // near connect
    let near = await nearAPI.connect(this.nearConfig);
    this.account = await near.account(this.nearConfig.accountId);
  }

  // query sent message count of near protocol
  async queryReceivedMessageCount(fromChain) {
    const messageCount = await this.account.viewFunction(
      this.nearConfig.contractName,
      "get_final_received_message_id",
      {
        from_chain: fromChain,
        validator: config.get('networks.' + this.chainName + '.validatorPublicKey'),
      }
    );
    return messageCount;
  }

  async queryLatestMessageId(fromChain) {
    const latestMessageCount = await this.account.viewFunction(
      this.nearConfig.contractName,
      "get_latest_message_id",
      { from_chain: fromChain }
    );
    return latestMessageCount;
  }

  async queryPendingMessage() {
    let pendingMessage = [];
    var from_index = 0;
    var limit = 20;
    do {
      var result = await this.account.viewFunction(
        this.nearConfig.contractName,
        "get_pending_message",
        { from_index, limit }
      );
      pendingMessage.concat(result);
      from_index += limit;
    } while (result.length);

    return pendingMessage;
  }

  async queryNextMessageId(fromChain) {
    return this.account.viewFunction(this.nearConfig.contractName, "get_msg_porting_task", {
      from_chain: fromChain,
      validator: config.get('networks.' + this.chainName + '.validatorPublicKey'),
    });
  }

  async queryExecutableMessage() {
    return this.account.viewFunction(
      this.nearConfig.contractName,
      "get_executable_message",
      { from_index: 0, limit: 20, });
  }

  // query receive message count of near protocol
  async querySentMessageCount(toChain) {
    const messageCount = await this.account.viewFunction(
      this.nearConfig.contractName,
      "get_sent_message_count",
      { to_chain: toChain }
    );
    return messageCount;
  }

  // query receive message count of near protocol
  async getSentMessageById(toChain, id) {
    const messageCount = await this.account.viewFunction(
      this.nearConfig.contractName,
      "get_sent_message",
      { to_chain: toChain, id: id }
    );
    return messageCount;
  }

  // push message to Near
  async pushMessage(crossChainMessage) {
    const content = crossChainMessage[6];
    const args = {
      id: crossChainMessage[0], // message id
      from_chain: crossChainMessage[1], // from chain name
      to_chain: crossChainMessage[2], // to chain name
      sender: crossChainMessage[3], // message sender
      signer: crossChainMessage[4],
      sqos: crossChainMessage[5],
      content: {
        contract: content[0], // contract name
        action: content[1], // contract action name
        data: content[2], // contract data
      },
    }
    console.log('Push message', args);
    await this.pushTransaction("receive_message", args);
  }

  // 
  async executeMessage(fromChain, id) {
    const args = {
      from_chain: fromChain, // from chain name
      id, // message id
    };
    await this.pushTransaction("execute_message", args);
    console.log(
      'NEAR messageId ' + args.id + ' executed, fromChain ' + args.from_chain);
  }

  // push transaction to near protocol
  async pushTransaction(methodName, args) {
    try {
      const functionCallResponse = await this.account.functionCall({
        contractId: this.nearConfig.contractName,
        methodName: methodName,
        args: args,
        gas: 70000000000000,
      });
      const result =
        await nearAPI.providers.getTransactionLastResult(functionCallResponse);
      console.log(result);
    } catch (error) {
      switch (JSON.stringify(error.kind)) {
        case '{"ExecutionError":"Exceeded the prepaid gas."}': {
          handleExceededThePrepaidGasError(error, options);
          break;
        }
        default: {
          console.log(error);
        }
      }
    }
  }
}

module.exports = NearHandler;
