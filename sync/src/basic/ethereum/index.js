'use strict';

const Web3 = require('eth-web3');
const config = require('config');
const ethereum = require('./ethereum.js');
const fs = require('fs');
const assert = require('assert');

const ErrorCode = {
  SUCCESS: 0,
  INTERFACE_ERROR: 1,
  DATA_FORMAT_ERROR: 2,
  ABI_ENCODE_ERROR: 3,
  SEND_TRANSACTION_ERROR: 4,
  GET_TARGET_ERROR: 5,
  DECODE_DATA_ERROR: 6,
  CONVERT_TO_JSON_ERROR: 7,
}

class EthereumHandler {
  constructor(chainName) {
    this.chainName = chainName;
  }

  async init() {
    this.web3 = new Web3(config.get('networks.' + this.chainName + '.nodeAddress'));
    this.web3.eth.handleRevert = true;
    this.testAccountPrivateKey = config.get('networks.' + this.chainName + '.validatorPrivateKey');
    this.porterAddress = this.web3.eth.accounts.privateKeyToAccount(this.testAccountPrivateKey).address;
    let crossChainContractAddress = config.get('networks.' + this.chainName + '.crossChainContractAddress');
    let crossChainRawData = fs.readFileSync(config.get('networks.' + this.chainName + '.abiPath'));
    let crossChainAbi = JSON.parse(crossChainRawData).abi;
    this.crossChainContract = new this.web3.eth.Contract(crossChainAbi, crossChainContractAddress);
    this.chainId = config.get('networks.' + this.chainName + '.chainId');
  }

  // query sent message count
  async querySentMessageCount(toChain) {
    const messageCount =
      await ethereum.contractCall(this.crossChainContract, 'getSentMessageNumber', [toChain]);
    return messageCount;
  }

  // query received message count
  async queryReceivedMessageCount(chainName) {
    const messageCount = await ethereum.contractCall(
      this.crossChainContract, 'getReceivedMessageNumber', [chainName]);
    return messageCount;
  }

  // get cross chain message by id
  async getSentMessageById(toChain, id) {
    const crossChainMessage = await ethereum.contractCall(
      this.crossChainContract, 'getSentMessage', [toChain, id]);
    return crossChainMessage;
  }

  // get id of message to be ported
  async getMsgPortingTask(chainName) {
    const crossChainMessage = await ethereum.contractCall(
      this.crossChainContract, 'getMsgPortingTask', [chainName]);
    return crossChainMessage;
  }

  // query target info by sender and action
  async queryTargetInfo(appContractAddress, methodHex) {
    let contractBaseRawData = fs.readFileSync('./ContractBase.json');
    let contractBaseAbi = JSON.parse(contractBaseRawData).abi;
    let appContract = new this.web3.eth.Contract(contractBaseAbi, appContractAddress);
    const target = await ethereum.contractCall(
      appContract, 'messageABIMap', [methodHex]);
    return target;
  }

  // query target info by sender and action
  async queryInterfaceInfo(contract, action) {
    const _interface = await ethereum.contractCall(
      this.crossChainContract, 'interfaces', [contract, action]);
    return _interface;
  }

  // query executable 
  async queryExecutableMessage(chainNames) {
    const _messages = await ethereum.contractCall(
      this.crossChainContract, 'getExecutableMessages', [chainNames]);
    return _messages;
  }

  /*
  push message to cross chain contract
  message = {
    id,
    fromChain,
    toChain,
    sender,
    signer,
    sqos: {
    },
    content: {
      contract,
      action,
      data:{
        JSON(parameterName: value):string
      },
    }
  }
  */
  async pushMessage(message) {
    let dataRet = await this.getEncodedData(message);
    if (dataRet.errorCode != ErrorCode.SUCCESS) {
      return dataRet.errorCode;
    }
    let calldata = dataRet.data;

    // prepare message info
    const messageInfo = [
      message.fromChain, message.id, message.sender, message.signer, message.content.contract,
      message.sqos, message.content.action, calldata
    ];

    // send transaction
    console.log('messageInfo', messageInfo);
    // return;
    let ret = await ethereum.sendTransaction(
      this.web3, this.chainId,
      this.crossChainContract, 'receiveMessage', this.testAccountPrivateKey,
      messageInfo);

    if (ret != null) {
      console.log('Push message successfully, messageInfo: ' + messageInfo);
      return ErrorCode.SUCCESS;
    }

    return ErrorCode.SEND_TRANSACTION_ERROR;
  }

  // encode the data
  async getEncodedData(message) {
    // construct data array
    let function_json;
    try {
      let function_str = await this.queryInterfaceInfo(message.content.contract, message.content.action);
      function_json = JSON.parse(function_str);
    }
    catch (e) {
      console.log(e);
      return {errorCode: ErrorCode.INTERFACE_ERROR};
    }

    let dataArray = [];
    try {
      let data = JSON.parse(message.content.data);
      for (let i = 0; i < function_json.inputs.length; i++) {
        dataArray.push(data[function_json.inputs[i].name]);
      }
    }
    catch (e) {
      console.log(e);
      return {errorCode: ErrorCode.DATA_FORMAT_ERROR};
    }
    
    // encode params by ABI
    let calldata;
    try {
      calldata = this.web3.eth.abi.encodeFunctionCall(function_json, dataArray);
    }
    catch (e) {
      console.log(e);
      return {errorCode: ErrorCode.ABI_ENCODE_ERROR};
    }

    return  {errorCode: ErrorCode.SUCCESS, data: calldata};
  }

  // parse data
  async parseData(message) {
    let target;
    try {
      let methodName = message.toChain + message.content.contractAddress + message.content.action;
      let methodHex = this.web3.utils.toHex(methodName);
      target = await this.queryTargetInfo(message.sender, methodHex);
    }
    catch (e) {
      return {errorCode: ErrorCode.GET_TARGET_ERROR};
    }
    
    let abi;
    let parameterNames;
    let result;
    try {
      abi = target.parametertypes.split('|');
      parameterNames = target.parameterNames.split('|');
      result = this.decodeParameters(abi, message.content.data.arguments);
    }
    catch (e) {
      return {errorCode: ErrorCode.DECODE_DATA_ERROR};
    }

    let ret = '';
    try {
      let jsonObj = {};
      for (let i = 0; i < parameterNames.length; i++) {
          let value = result[i];
          if (abi[i].indexOf('int') != -1 && abi[i].indexOf('[]') == -1) {
              value = parseInt(value);
          }
          jsonObj[parameterNames[i]] = value;
      }
      ret = JSON.stringify(jsonObj);
    }
    catch (e) {
      return {errorCode: ErrorCode.CONVERT_TO_JSON_ERROR};
    }

    return {errorCode: ErrorCode.SUCCESS, data: ret};
  }

  // execute message
  async executeMessage(chainName, id) {
    // send transaction
    let ret = await ethereum.sendTransaction(
      this.web3, this.chainId,
      this.crossChainContract, 'executeMessage', this.testAccountPrivateKey, [chainName, id]);

    if (ret != null) {
      console.log(
        'Ethereum messageId ' + id + ' executed, fromChain ' + chainName);
    }
  }

  // push hidden message
  async pushHiddenMessage(chainName, id, hash) {
    let ret = await ethereum.sendTransaction(
      this.web3, this.chainId,
      this.crossChainContract, 'receiveHiddenMessage', this.testAccountPrivateKey,
      [chainName, id, hash]);

    if (ret != null) {
      console.log('Push hidden message successfully, hash: ' + hash);
      return ErrorCode.SUCCESS;
    }

    return ErrorCode.SEND_TRANSACTION_ERROR;
  }

  // reveal message
  async revealMessage(message) {
    let dataRet = await this.getEncodedData(message);
    if (dataRet.errorCode != ErrorCode.SUCCESS) {
      return dataRet.errorCode;
    }
    let calldata = dataRet.data;

    // prepare message info
    const messageInfo = [
      message.fromChain, message.id, message.sender, message.signer, message.content.contract,
      message.sqos, message.content.action, calldata
    ];
    console.log('message', messageInfo);

    let ret = await ethereum.sendTransaction(
      this.web3, this.chainId,
      this.crossChainContract, 'revealMessage', this.testAccountPrivateKey, messageInfo);

    if (ret != null) {
      console.log('Reveal message successfully, messageInfo: ' + messageInfo);
      return ErrorCode.SUCCESS;
    }

    return ErrorCode.SEND_TRANSACTION_ERROR;
  }

  // abandon message
  async abandonMessage(chainName, id, errorCode) {
    // send transaction
    let ret = await ethereum.sendTransaction(
      this.web3, this.chainId,
      this.crossChainContract, 'abandonMessage', this.testAccountPrivateKey, [chainName, id, errorCode]);

    if (ret != null) {
      console.log('Abandon messageId:' + id + ' successfully, fromChain ' + chainName, ', errorCode is:', errorCode);
    }
  }

  async getFirstStageMessage(chainName, id) {
    const _message = await ethereum.contractCall(
      this.crossChainContract, 'getFirstStageMessage', [chainName, id]);
    return _message;
  }

  // decode parameters
  decodeParameters(abi, argus) {
    return this.web3.eth.abi.decodeParameters(abi, argus);
  }

  getProvider() {
    return this.web3;
  }
}

module.exports = EthereumHandler;