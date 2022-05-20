use ic_cdk::{
    api,
    export::{candid::CandidType, Principal},
};

#[macro_use]
extern crate serde;
use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

#[derive(CandidType, Deserialize, Clone)]
struct Greeting {
    title: String,
    content: String,
    date: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Content {
    contract: String,
    action: String,
    data: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Session {
    res_type: u8,
    id: u64,
}

#[derive(CandidType, Deserialize, Clone)]
struct DstContract {
    contract_address: String,
    action_name: String,
}

#[derive(CandidType, Deserialize, Default, Clone)]
struct State {
    custodians: HashSet<Principal>,
    cross_chain_canister: Option<Principal>,
    greeting_data: HashMap<String, Greeting>,
    destination_contract: HashMap<String, HashMap<String, DstContract>>,
    permitted_contract: HashMap<String, HashMap<String, HashSet<String>>>,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::default();
}

#[init]
fn int() {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        state.custodians = HashSet::from([api::caller()]);
    })
}

#[update(name = "registerDstContract")]
fn register_dst_contract(
    chain_name: String,
    action_name: String,
    contract_address: String,
    contract_action_name: String,
) {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        if state.destination_contract.contains_key(&chain_name) {
            state
                .destination_contract
                .get_mut(&chain_name)
                .and_then(|map| {
                    map.insert(
                        action_name,
                        DstContract {
                            contract_address,
                            action_name: contract_action_name,
                        },
                    )
                });
        } else {
            state.destination_contract.insert(
                chain_name,
                HashMap::from([(
                    action_name,
                    DstContract {
                        contract_address,
                        action_name: contract_action_name,
                    },
                )]),
            );
        }
    })
}

#[update(name = "registerPermittedContract")]
fn register_permitted_contract(chain_name: String, sender: String, action_name: String) {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        if let Some(contract) = state.permitted_contract.get_mut(&chain_name) {
            if let Some(actions) = contract.get_mut(&sender) {
                assert!(
                    !actions.contains(&action_name),
                    "Permitted contract already register"
                );
                actions.insert(action_name);
            } else {
                contract.insert(sender, HashSet::from([action_name]));
            }
        } else {
            state.permitted_contract.insert(
                chain_name,
                HashMap::from([(sender, HashSet::from([action_name]))]),
            );
        }
    })
}

#[update(name = "receiveGreeting")]
fn receive_greeting(from_chain: String, title: String, content: String, date: String) {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        assert_eq!(
            api::caller(),
            state.cross_chain_canister.unwrap(),
            "only call by cross chain canister"
        );

        state.greeting_data.insert(
            from_chain,
            Greeting {
                title,
                content,
                date,
            },
        );
    })
}

#[update(name = "sendGreeting")]
async fn send_greeting(
    to_chain: String,
    title: String,
    content: String,
    date: String,
) -> Result<bool, String> {
    // let greeting_action_data = json!({
    //     "greeting": [to_chain, title, content, date]
    // }).to_string();
    let from_chain = "DFINITY".to_string();
    let greeting_action_data: String = format!(
        r#"{{"greeting": ["{}","{}","{}","{}"]}}"#,
        from_chain, title, content, date
    );
    let action_name = "receiveGreeting".to_string();
    let destination_contract = STATE.with(|state| {
        let state = state.borrow();
        let destination_contract = state
            .destination_contract
            .get(&to_chain)
            .expect("to chain not register");
        destination_contract
            .get(&action_name)
            .expect("action name not register")
            .clone()
    });

    let cross_chain_canister = STATE.with(|state| {
        let state = state.borrow();
        state.cross_chain_canister.unwrap()
    });

    let result = api::call::call::<(String, Content, Session), ()>(
        cross_chain_canister,
        "sendMessage",
        (
            to_chain,
            Content {
                contract: destination_contract.contract_address.clone(),
                action: destination_contract.action_name.clone(),
                data: greeting_action_data,
            },
            Session { res_type: 0, id: 0 },
        ),
    )
    .await;
    match result {
        Ok(_) => Ok(true),
        Err(err) => {
            api::print(format!("{:?}", err));
            Err("call cross canister failed".to_string())
        }
    }
}

#[update(name = "setCrossChainCanister")]
fn set_cross_chain_canister(cross_chain_canister: Principal) {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        assert!(
            state.custodians.contains(&api::caller()),
            "Only call by custodian"
        );
        state.cross_chain_canister = Some(cross_chain_canister);
    })
}

#[query(name = "getCrossChainCanister")]
fn get_cross_chain_canister() -> Option<Principal> {
    STATE.with(|state| state.borrow().cross_chain_canister)
}

#[query(name = "getCustodians")]
fn get_custodians() -> Vec<Principal> {
    STATE.with(|state| {
        state
            .borrow()
            .custodians
            .clone()
            .into_iter()
            .map(|custodian| custodian)
            .collect()
    })
}

#[query(name = "getGreetingData")]
fn get_greeting_data(from_chain: String) -> Option<Greeting> {
    STATE.with(|state| state.borrow().greeting_data.get(&from_chain).cloned())
}
