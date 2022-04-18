#!/usr/bin/env bash
dfx stop
set -e
trap 'dfx stop' EXIT
dfx start --background --clean

dfx identity new owner || true
dfx identity new validator1 || true
dfx identity new validator2 || true
dfx --identity owner deploy
CROSSCHAINID=$(dfx canister id cross_chain)
GREETING=$(dfx canister id greeting)

echo '(*) Greeting canister set cross chain canister'
dfx --identity owner canister call greeting setCrossChainCanister "(principal \"$CROSSCHAINID\")"
echo '(*) Validator register in cross chain canister'
dfx --identity validator1 canister call cross_chain registerValidator
dfx --identity validator2 canister call cross_chain registerValidator
echo '(*) Validators'
dfx canister call cross_chain getValidators
echo '(*) Validator1 receive cross message'
dfx --identity validator1 canister call cross_chain receiveMessage "(1:nat64, record{from_chain=\"PlatON\"; to_chain=\"InternetCompute\"; sender=\"123\"; signer=\"123\"; sqos = record{ reveal = 1:nat8}; content = record{ contract = \"$GREETING\"; action=\"receiveGreeting\";data=\"(\\\"PlatON\\\",\\\"title\\\",\\\"content\\\",\\\"date\\\")\"}})"
echo '(*) Pending messages'
dfx canister call cross_chain getPendingMessage
echo '(*) Validator2 receive cross message'
dfx --identity validator2 canister call cross_chain receiveMessage "(1:nat64, record{from_chain=\"PlatON\"; to_chain=\"InternetCompute\"; sender=\"123\"; signer=\"123\"; sqos = record{ reveal = 1:nat8}; content = record{ contract = \"$GREETING\"; action=\"receiveGreeting\";data=\"(\\\"PlatON\\\",\\\"title\\\",\\\"content\\\",\\\"date\\\")\"}})"
echo '(*) Executable messages'
dfx canister call cross_chain getExecutableMessage
echo '(*) Execute cross message'
dfx --identity validator1 canister call cross_chain executeMessage "(\"PlatON\", 1:nat64)"
echo '(*) Query greeting canister received message'
dfx canister call greeting getGreetingData '("PlatON")'

dfx --identity owner identity remove owner
dfx --identity validator1 identity remove validator1
dfx --identity validator2 identity remove validator2