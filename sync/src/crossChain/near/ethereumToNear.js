'use strict';

const chainHandlerMgr = require('../../basic/chainHandlerMgr');

async function sendMessage(fromChain, toChain) {
  let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
  let toHandler = chainHandlerMgr.getHandlerByName(toChain);
  // query Ethereum message count
  let ethereumMessageCount = await fromHandler.querySentMessageCount(toChain);
  console.log(ethereumMessageCount);

  // query Near next receive message Id
  let nextMessageId = await toHandler.queryNextMessageId(fromChain);
  console.log(nextMessageId);

  // push messge
  if (nextMessageId <= ethereumMessageCount) {
    let message = await fromHandler.getSentMessageById(toChain, nextMessageId);
    // console.log('message', message);
    let jsonRet = await fromHandler.parseData(message);
    // console.log(jsonRet);
    if (jsonRet.errorCode != 0) {
        // await toHandler.abandonMessage(message[1], message[0], jsonRet.errorCode);
        return;
    }
    let m = [parseInt(message.id), message.fromChain, message.toChain, message.sender, message.signer, { reveal: true },
    [message.content.contractAddress, message.content.action, jsonRet.data]];
    await await toHandler.pushMessage(m);
  }
}

module.exports = {
  sendMessage: sendMessage,
}