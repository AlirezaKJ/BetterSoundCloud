let loadingscreen = document.querySelector("#loadingscreen")
let loadingscreenver = document.querySelector(".loadingscreenver")
loadingscreenver.innerHTML =  "V" + packagefile.version
let loadingscreentxt = document.querySelector("#loadingscreentxt")
loadingscreentxt.innerHTML = "Loading Main Window"
function mainWindowload() {
  loadingscreentxt.innerHTML = "Loaded Main Window"
}

function loadstop() {
  webview.setZoomFactor(settings.zoomfactorperc / 100)
  if (settings.startupfullscreen) {
    ipcRenderer.send("appReqFullscreenApp")
  }
  changeSettings("lasturlvisited", webview.getURL())
  setTimeout(() => { // TODO: figure out why it have to wait 2 seconds and load after
    webview.executeJavaScript("let issciloaded = false")
    addscript("\\app\\plugins\\SCI.js")
    addstyle("\\app\\themes\\SCI.css")

    loadingscreentxt.innerHTML = "Loaded SoundCloud Window"
    console.log("loaded");
    
    // LOAD SCI SET
    
    // LOAD RIGHTCLICK MENU ESSENTIALS
    addscript("\\app\\plugins\\ctxMenu.js")
    
    // LOAD INFO TICKER
    addscript("\\app\\plugins\\infoticker.js")
    
    // LOAD CUSTOMBG
    if (settings.custombg) {
      addscript("\\app\\plugins\\custombg.js")
      console.log("custombg loaded")
    }
    
    // LOAD THEME
    switch (settings.theme) {
      case "darkcloud":
        addstyle("\\app\\themes\\darkCloud.css")
        break;
      case "nocturnal":
        addstyle("\\app\\themes\\nocturnal.css")
        break;
      case "postmorphic":
        addstyle("\\app\\themes\\postMorphic.css")
        break;
      default:
        console.log("No theme selected")
        break;
    }

    // LOAD CUSTOM CSS AND JS
    if (settings.customcss != undefined) {
      webview.insertCSS(settings.customcss);
      loadingscreentxt.innerHTML = "Added Custom CSS";
    }
    if (settings.customjs != undefined) {
      webview.executeJavaScript(settings.customjs);
      loadingscreentxt.innerHTML = "Added Custom JS";
    }



    loadingscreentxt.innerHTML = "Loading Finished"
    setTimeout(() => {
      loadingscreen.classList.add("fadels")
    }, 500);
  }, 3000);
}

sciloadingcheck = setInterval(() => {
  webview.executeJavaScript(`
  if (issciloaded) {
    console.log("BSCReceive|sciloaded")
  } else {
    console.log("BSCReceive|scinotloaded")
  }`)
}, 1000);

webview.addEventListener('did-stop-loading', loadstop)