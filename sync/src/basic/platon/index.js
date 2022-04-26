'use strict';

const Web3 = require('web3');
const config = require('config');
const platon = require('./platon.js');
const fs = require('fs');

class PlatONHandler {
  constructor(chainName) {
    this.chainName = chainName;
  }

  async init() {
    this.web3 = new Web3(config.get('networks.' + this.chainName + '.nodeAddress'));
    // cross chain contract
    let crossChainContractAddress = config.get('networks.' + this.chainName + '.crossChainContractAddress');    
    // validator account
    this.validatorPrivateKey = config.get('networks.' + this.chainName + '.validatorPrivateKey');
    // cross chain contract abi
    let crossChainRawData = fs.readFileSync('cross_chain.abi.json');
    let crossChainAbi = JSON.parse(crossChainRawData);    
    // init cross chain contract
    this.crossChainContract = new this.web3.platon.Contract(
      crossChainAbi, crossChainContractAddress, { vmType: 1 });
    this.chainId = config.get('networks.' + this.chainName + '.chainId');
  }

  /**
   * Query sent message count
   * @param toChain - toChain name
   */
  async querySentMessageCount(toChain) {
    const messageCount = await platon.contractCall(
      this.crossChainContract, 'get_sent_message_count_by_to_chain', [toChain]);
    return messageCount;
  }

  /**
   * Query received message count
   * @param fromChain - fromChain name
   */
  async queryReceivedMessageCount(fromChain) {
    const messageCount = await platon.contractCall(
      this.crossChainContract, 'get_received_message_count_by_from_chain',
      [fromChain]);
    return messageCount;
  }

  /**
   * Get cross chain message by id
   * @param toChain - toChain name
   * @param id - message id
   */
  async getSentMessageById(toChain, id) {
    const crossChainMessage = await platon.contractCall(
      this.crossChainContract, 'get_sent_message_by_id', [toChain, id]);
    return crossChainMessage;
  }

  /**
   * Push message to cross chain contract
   * @param message - message info
   */
  async pushMessage(message) {
    const contractAddress = message.content.contract;
    const action = message.content.action;

    // quert contract abi
    const abiInfo = await platon.contractCall(
      this.crossChainContract, 'get_abi_by_contract_action',
      [message.content.contract, action]);

    // ensure contract abi is registered
    if (!abiInfo[3]) {
      console.log('contract ' + contractAddress + ' is not registered on PlatON');
      return;
    }
    const abi = [JSON.parse(abiInfo[3])];

    const contract = new this.web3.platon.Contract(abi, contractAddress, { vmType: 1 });

    // format data
    let data = JSON.parse(message.content.data);
    let formattedData = [];

    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        formattedData.push(data[key]);
      }
    }

    // encode params by ABI
    let params =
      contract.methods[action].apply(action, formattedData).encodeABI();
    params = this.web3.utils.hexToBytes(params);

    // prepare message info
    const messageInfo = [
      message.id, message.from_chain, message.sender, message.content.contract,
      message.content.action, params
    ];

    // send transaction
    let ret = await platon.sendTransaction(
      this.web3, this.chainId,
      this.crossChainContract, 'receive_message', this.validatorPrivateKey, messageInfo);

    if (ret != null) {
      console.log('Push message successfully', message);
    }

    return -1;
  }

  /**
   * Query executable message
   */
  async getExecutableMessages() {
    const messages = await platon.contractCall(
      this.crossChainContract, 'get_executable_messages', []);
    return messages;
  }

  /**
   * Query message by id & fromChain
   * @param messageId - message id
   * @param fromChain - fromChain name
   */
  async getReceivedMessageById(messageId, fromChain) {
    const messages = await platon.contractCall(
      this.crossChainContract, 'get_received_message_by_id', [messageId, fromChain]);
    return messages;
  }

  /**
   * Execute message
   * @param messageId - message id
   * @param fromChain - fromChain name
   */
  async executeMessage(messageId, fromChain) {
    const messageInfo = [messageId, fromChain];

    // send transaction
    const ret = await platon.sendTransaction(
      this.web3, this.chainId,
      this.crossChainContract, 'execute_message', this.validatorPrivateKey, messageInfo);

    if (ret != null) {
      console.log(
        'PlatON messageId ' + messageId + ' executed, fromChain ' + fromChain);
    }
  }

  /**
   * Get last validator submitted id
   * @param fromChain - fromChain name
   * @param validatorAccount - validator account
   */
  async getLastValidatorSubmittedId(fromChain, validatorAccount) {
    const id = await platon.contractCall(
      this.crossChainContract, 'get_last_validator_submitted_id',
      [fromChain, validatorAccount]);
    return id;
  }

  /**
   * Get validator list
   */
  async getValidatorList() {
    const validators =
      await platon.contractCall(this.crossChainContract, 'get_validator_list', []);
    return validators;
  }

  /**
   * Get validator next task id
   * @param fromChain - fromChain name
   * @param validatorAccount - validator account
   */
  async getValidatorNextTaskId(fromChain, validatorAccount) {
    const id = await platon.contractCall(
      this.crossChainContract, 'get_msg_porting_task',
      [fromChain, validatorAccount]);
    return id;
  }

  getProvider() {
    return this.web3;
  }
}

module.exports = PlatONHandler;