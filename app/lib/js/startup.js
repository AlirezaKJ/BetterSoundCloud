// setTimeout(() => {
//   webview.loadURL("https://soundcloud.com/discover");
// }, 100);

let loadingscreen = document.querySelector("#loadingscreen")
let loadingscreenver = document.querySelector("#loadingscreenver")
loadingscreenver.innerHTML =  "V" + packagefile.version
let loadingscreentxt = document.querySelector("#loadingscreentxt")
loadingscreentxt.innerHTML = "Loading Main Window"
function mainWindowload() {
  loadingscreentxt.innerHTML = "Loaded Main Window"
}

function loadstop() {
  loadingscreentxt.innerHTML = "Loaded SoundCloud Window"
  console.log("loaded");
  
  // LOAD SCI SET
  addscript("\\app\\plugins\\SCI.js")
  addstyle("\\app\\themes\\SCI.css")


  
  // LOAD RIGHTCLICK MENU ESSENTIALS
  addscript("\\app\\plugins\\ctxMenu.js")
  
  // LOAD DISCORD RPC
  // addscript("\\app\\plugins\\discordRPC.js")
  
  // LOAD CUSTOMBG
  // addscript("\\app\\plugins\\custombg.js")
  
  // LOAD THEME
  // addstyle("\\app\\themes\\darkCloud.css")

  loadingscreentxt.innerHTML = "Loading Finished"
  setTimeout(() => {
    loadingscreen.classList.add("fadels")
  }, 500);
}

webview.addEventListener('did-stop-loading', loadstop)