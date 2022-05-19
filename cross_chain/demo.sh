#!/usr/bin/env bash
dfx stop
set -e
trap 'dfx stop' EXIT
dfx start --background --clean

dfx identity new --disable-encryption owner || true
dfx identity new --disable-encryption validator1 || true
dfx identity new --disable-encryption validator2 || true
dfx --identity owner deploy
CROSSCHAINID=$(dfx canister id cross_chain)
GREETING=$(dfx canister id greeting)

echo '(*) Greeting canister set cross chain canister'
dfx --identity owner canister call greeting setCrossChainCanister "(principal \"$CROSSCHAINID\")"
echo '(*) Greeting register destination contract'
dfx --identity owner canister call greeting registerDstContract '("NEAR", "receiveGreeting", "9f9350eb575cae7aac7f85a8c62b08d94dcac70a84e3c765464ff87c669fa4e5", "receiveGreeting")'
echo '(*) Greeting register permitted contract'
dfx --identity owner canister call greeting registerPermittedContract '("NEAR", "9f9350eb575cae7aac7f85a8c62b08d94dcac70a84e3c765464ff87c669fa4e5", "receiveGreeting")'
echo '(*) Validator register in cross chain canister'
VALIDATOR1=$(dfx --identity validator1 identity get-principal)
dfx --identity owner canister call cross_chain registerValidator "(principal \"$VALIDATOR1\")"
VALIDATOR2=$(dfx --identity validator2 identity get-principal)
dfx --identity owner canister call cross_chain registerValidator "(principal \"$VALIDATOR2\")"
echo '(*) Validators'
dfx canister call cross_chain getValidators
echo '(*) Validator1 receive cross message'
dfx --identity validator1 canister call cross_chain receiveMessage "(1:nat64, record{from_chain=\"NEAR\"; to_chain=\"DFINITY\"; sender=\"9f9350eb575cae7aac7f85a8c62b08d94dcac70a84e3c765464ff87c669fa4e5\"; signer=\"123\"; sqos = record{ reveal = 1:nat8}; content = record{ contract = \"$GREETING\"; action=\"receiveGreeting\";data=\"(\\\"NEAR\\\",\\\"title\\\",\\\"content\\\",\\\"date\\\")\"}; session = record{res_type = 0:nat8 ; id = 0:nat64}})"
echo '(*) Pending messages'
dfx canister call cross_chain getPendingMessage
echo '(*) Validator2 receive cross message'
dfx --identity validator2 canister call cross_chain receiveMessage "(1:nat64, record{from_chain=\"NEAR\"; to_chain=\"DFINITY\"; sender=\"9f9350eb575cae7aac7f85a8c62b08d94dcac70a84e3c765464ff87c669fa4e5\"; signer=\"123\"; sqos = record{ reveal = 1:nat8}; content = record{ contract = \"$GREETING\"; action=\"receiveGreeting\";data=\"(\\\"NEAR\\\",\\\"title\\\",\\\"content\\\",\\\"date\\\")\"}; session = record{res_type = 0:nat8 ; id = 0:nat64}})"
echo '(*) Get executable messages'
dfx canister call cross_chain getExecutableMessage
echo '(*) Execute cross message'
dfx --identity validator1 canister call cross_chain executeMessage "(\"NEAR\", 1:nat64)"
echo '(*) Query greeting canister received message'
dfx canister call greeting getGreetingData '("NEAR")'

dfx --identity owner identity remove owner
dfx --identity validator1 identity remove validator1
dfx --identity validator2 identity remove validator2