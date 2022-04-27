module.exports = {
  // 通过私钥签名交易
  async sendTransaction(
    provider, chainId, targetContract, methodName, accountPrivateKey, arguments) {
    try {
      const account =
        provider.platon.accounts.privateKeyToAccount(accountPrivateKey)
          .address;  // 私钥导出公钥
      const to = targetContract.options.address;
      const nonce = provider.utils.numberToHex(
        await provider.platon.getTransactionCount(account));  // 获取生成 nonce
      const data = targetContract.methods[methodName]
        .apply(targetContract.methods, arguments)
        .encodeABI();  // encode ABI
      // const estimateGas =
      //     await provider.platon.estimateGas({from: account, to, data});
      const gas = provider.utils.numberToHex(
        parseInt((await provider.platon.getBlock('latest')).gasLimit - 1));
      // const gasPrice = await provider.platon.getGasPrice();
      // console.log('gas: '+gas);
      // console.log('gasPrice: '+gasPrice);
      // console.log('estimateGas: ' + estimateGas);

      // 准备交易数据
      const tx = { account, to, chainId, data, nonce, gas };
      // console.log(tx);

      // 签名交易
      let signTx =
        await provider.platon.accounts.signTransaction(tx, accountPrivateKey);
      let ret = await provider.platon.sendSignedTransaction(signTx.rawTransaction);
      // console.log('gasUsed: ' + methodName + ' ' + ret.gasUsed);
      return ret;
    } catch (e) {
      console.error(e);
    }
  },
  // query info from blockchain node
  async contractCall(targetContract, method, arguments) {
    let methodObj =
      targetContract.methods[method].apply(targetContract.methods, arguments);
    let ret = await methodObj.call({});
    // console.log(ret);
    return ret;
  }
}