"use strict";

const path = require("path");
const homedir = require("os").homedir();
const config = require("config");
const Actor = require("@dfinity/agent").Actor;
const HttpAgent = require("@dfinity/agent").HttpAgent;
const Principal = require("@dfinity/principal").Principal;
const { Ed25519KeyIdentity } = require("@dfinity/identity");
const { idlFactory } = require("./cross_chain.did");

class DfinityHandler {
  constructor(chainName) {
    this.chainName = chainName;
  }

  async init() {
    let agent = new HttpAgent({
      host: config.get("networks." + this.chainName + ".network"),
      identity: Ed25519KeyIdentity.fromSecretKey(
        Buffer.from(
          config.get("networks." + this.chainName + ".validatorPrivateKey"),
          "hex"
        )
      ),
    });
    agent.fetchRootKey();
    this.actor = Actor.createActor(idlFactory, {
      agent,
      canisterId: config.get("networks." + this.chainName + ".canisterId"),
    });
  }

  // query sent message count of near protocol
  async queryReceivedMessageCount(fromChain) {
    const messageCount = await this.actor.getFinalReceivedMessageId(
      fromChain,
      Principal.fromText(
        config.get("networks." + this.chainName + ".validatorPrincipal")
      )
    );
    return messageCount;
  }

  async queryLatestMessageId(fromChain) {
    const latestMessageCount = await this.actor.getLatestMessageId(fromChain);
    return latestMessageCount;
  }

  async queryNextMessageId(fromChain) {
    return this.actor.getMsgPortingTask(
      fromChain,
      Principal.fromText(
        config.get("networks." + this.chainName + ".validatorPrincipal")
      )
    );
  }

  async queryExecutableMessage() {
    return this.actor.getExecutableMessage();
  }

  // query receive message count of near protocol
  async querySentMessageCount(toChain) {
    return this.actor.getSentMessageCount(toChain);
  }

  // query receive message count of near protocol
  async getSentMessageById(toChain, id) {
    return this.actor.getSentMessageById(toChain, id);
  }

  // push message to Near
  async pushMessage(id, message) {
    // const message = {
    //   from_chain: message.from_chain, // from chain name
    //   to_chain: message.to_chain, // to chain name
    //   sender: message.sender, // message sender
    //   signer: message.signer,
    //   sqos: message.sqos,
    //   content: message.content,
    // };
    // console.log("Push message: ", message);
    console.log(message);
    await this.actor.receiveMessage(id, message);
  }

  //
  async executeMessage(fromChain, id) {
    await this.actor.executeMessage(fromChain, Number(id))
    console.log(
      "InternetComputer messageId " + fromChain + " executed, fromChain " + fromChain
    );
  }
}

module.exports = DfinityHandler;
