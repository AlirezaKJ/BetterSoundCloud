// setTimeout(() => {
//   webview.loadURL("https://soundcloud.com/discover");
// }, 100);



function loadstop() {
  console.log("loaded");
  
  // LOAD SCI SET
  addscript("/app/plugins/SCI.js")
  addstyle("/app/themes/SCI.css")
  
  // addstyle("\\app\\themes\\darkCloud.css")
}

webview.addEventListener('did-stop-loading', loadstop)
// webview.addEventListener('context-menu', loadstop)