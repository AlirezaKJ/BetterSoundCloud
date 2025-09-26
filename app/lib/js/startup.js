let loadingscreen = document.querySelector("#loadingscreen");
let loadingscreenver = document.querySelector(".loadingscreenver");
loadingscreenver.innerHTML = "V" + packagefile.version;
let loadingscreentxt = document.querySelector("#loadingscreentxt");
loadingscreentxt.innerHTML = "Loading Main Window";
function mainWindowload() {
  loadingscreentxt.innerHTML = "Loaded Main Window";
}

function loadstop() {
  if (settings.useragent) {
    webview.setUserAgent(settings.userAgent);
  }
  webview.setZoomFactor(settings.zoomfactorperc / 100);
  if (settings.startupfullscreen) {
    ipcRenderer.send("appReqFullscreenApp");
  }
  changeSettings("lasturlvisited", webview.getURL());
  setTimeout(() => {
    // TODO: figure out why it have to wait 2 seconds and load after
    webview.executeJavaScript("let issciloaded = false");
    addscript(path.join("plugins", "SCI.js"));
    addstyle(path.join("themes", "SCI.css"));

    loadingscreentxt.innerHTML = "Loaded SoundCloud Window";
    console.log("loaded");

    // LOAD SCI SET

    // LOAD RIGHTCLICK MENU ESSENTIALS
    addscript(path.join("plugins", "ctxMenu.js"));

    // LOAD INFO TICKER
    addscript(path.join("plugins", "infoticker.js"));

    // LOAD CUSTOMBG
    if (settings.custombg) {
      addscript(path.join("plugins", "custombg.js"));
      console.log("custombg loaded");
    }

    // LOAD THEME
    switch (settings.theme) {
      case "darkcloud":
        addstyle(path.join("themes", "darkCloud.css"));
        break;
      case "nocturnal":
        addstyle(path.join("themes", "nocturnal.css"));
        break;
      case "postmorphic":
        addstyle(path.join("themes", "postMorphic.css"));
        break;
      default:
        console.log("No theme selected");
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

    loadingscreentxt.innerHTML = "Loading Finished";
    setTimeout(() => {
      loadingscreen.classList.add("fadels");
    }, 500);
  }, 3000);
}

sciloadingcheck = setInterval(() => {
  webview.executeJavaScript(`
  if (issciloaded) {
    console.log("BSCReceive|sciloaded")
  } else {
    console.log("BSCReceive|scinotloaded")
  }`);
}, 1000);

webview.addEventListener("did-stop-loading", loadstop);
