'use strict';

const chainHandlerMgr = require('../../basic/chainHandlerMgr');

async function sendMessage(fromChain, toChain) {
    let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
    let toHandler = chainHandlerMgr.getHandlerByName(toChain);
    // query ethereum message count
    const ethereumSentMessageCount = await fromHandler.querySentMessageCount(toChain);
    console.log(ethereumSentMessageCount);

    // query ethereum next receive message Id
    let nextMessageId = await toHandler.getMsgPortingTask(fromChain);
    nextMessageId = parseInt(nextMessageId);
    console.log(nextMessageId);

    if (nextMessageId <= ethereumSentMessageCount) {
        // get message by id
        const message = await fromHandler.getSentMessageById(toChain, nextMessageId);
        console.log('Query Ethereum EVM Sent message id ' + nextMessageId, message);
        let jsonRet = await fromHandler.parseData(message);
        if (jsonRet.errorCode != 0) {
            await toHandler.abandonMessage(message[1], message[0], jsonRet.errorCode);
            return;
        }

        let m = {
            id: message.id,
            fromChain: message.fromChain,
            toChain: message.toChain,
            sender: message.sender,
            signer: message.signer,
            sqos: message.sqos,
            content: {
                contract: message.content.contractAddress,
                action: message.content.action,
                data: jsonRet.data
            },
        };

        if (message.sqos.reveal == 1) {
            let firstStageMessage = await toHandler.getFirstStageMessage(message.fromChain, message.id);
            if (firstStageMessage.stage == 0 || firstStageMessage.stage == 1) {
                // push hidden message
                let web3 = toHandler.getProvider();
                let calldataRet = await toHandler.getEncodedData(m);
                if (calldataRet.errorCode == 0) {
                    let data = web3.eth.abi.encodeParameters(['string', 'string', 'tuple(uint8)', 'address', 'string', 'bytes', 'address'],
                    [message.sender, message.signer, [message.sqos.reveal], message.content.contractAddress, message.content.action, calldataRet.data, toHandler.porterAddress]);
                    let hash = web3.utils.sha3(data);
                    await toHandler.pushHiddenMessage(message.fromChain, message.id, hash);
                }
                else {
                    console.log('Error code:', calldataRet.errorCode);
                }
            }
            else if (firstStageMessage.stage == 2) {
                let revealed = false;
                for (let i = 0; i < firstStageMessage.messages.length; i++) {
                    if (firstStageMessage.messages.porter == toHandler.porterAddress) {
                        revealed = true;
                        break;
                    }
                }

                // reveal message
                if (!revealed) {
                    await toHandler.revealMessage(m);
                }
            }
            else {
                console.log('Something is wrong');
            }
        }
        else {
            let ret = await toHandler.pushMessage(m);

            if (ret != 0) {
                await toHandler.abandonMessage(message[1], message[0], ret);
            }
        }
    }
};

module.exports = {
    sendMessage: sendMessage
}