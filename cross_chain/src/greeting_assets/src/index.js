import { greeting } from "../../declarations/greeting";

document.querySelector("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("button");

  const name = document.getElementById("toChainName").value.toString();
  const title = document.getElementById("title").value.toString();
  const content = document.getElementById("content").value.toString();
  console.log(name, title, content);

  button.setAttribute("disabled", true);

  // Interact with foo actor, calling the greet method
  try {
    let date = (new Date()).toISOString();
    const greet = await greeting.sendGreeting(name, title, content, date);
    console.log(date, greet);
    document.getElementById("greeting").innerText = greet.Ok;
  } catch (e) {
    document.getElementById("greeting").innerText = e;
  }

  button.removeAttribute("disabled");
  return false;
});
